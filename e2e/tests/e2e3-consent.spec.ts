import { describe, expect, it, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { WebSocket } from "ws";

const REPO = path.resolve(__dirname, "../..");
const SIDECAR_TIMEOUT_MS = 90_000;

interface Peer {
  port: number;
  vaultRoot: string;
  proc: ChildProcess;
  token: string;
  ws: WebSocket;
}

async function startSidecar(port: number): Promise<Peer> {
  const vaultRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), `vault-e2e3-${port}-`)
  );
  const env = {
    ...process.env,
    VAULT_ROOT: vaultRoot,
    VAULT_PORT: String(port),
  };
  const proc = spawn(
    path.join(REPO, "node_modules/.bin/tsx"),
    [path.join(REPO, "packages/app/src/index.ts")],
    { env, cwd: REPO, stdio: ["ignore", "pipe", "pipe"] }
  );
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("sidecar boot timeout")),
      SIDECAR_TIMEOUT_MS
    );
    proc.stdout?.on("data", (chunk) => {
      if (chunk.toString().includes("sidecar listening")) {
        clearTimeout(timer);
        resolve();
      }
    });
    proc.on("exit", () => reject(new Error("sidecar exited early")));
  });
  const token = (
    await fs.readFile(path.join(vaultRoot, ".ws-token"), "utf8")
  ).trim();
  const ws = new WebSocket(
    `ws://127.0.0.1:${port}/ws?token=${token}`
  );
  await new Promise<void>((resolve) => ws.once("open", () => resolve()));
  return { port, vaultRoot, proc, token, ws };
}

async function ask(
  ws: WebSocket,
  msg: unknown,
  replyKind: string,
  timeoutMs = 60_000
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for ${replyKind}`)),
      timeoutMs
    );
    function handler(raw: WebSocket.RawData) {
      const m = JSON.parse(String(raw)) as Record<string, unknown>;
      if (m["kind"] === replyKind) {
        clearTimeout(timer);
        ws.off("message", handler);
        resolve(m);
      }
    }
    ws.on("message", handler);
    ws.send(JSON.stringify(msg));
  });
}

function awaitMsg(
  ws: WebSocket,
  predicate: (m: Record<string, unknown>) => boolean,
  timeoutMs = 60_000
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("awaitMsg timeout")),
      timeoutMs
    );
    function handler(raw: WebSocket.RawData) {
      const m = JSON.parse(String(raw)) as Record<string, unknown>;
      if (predicate(m)) {
        clearTimeout(timer);
        ws.off("message", handler);
        resolve(m);
      }
    }
    ws.on("message", handler);
  });
}

const peers: Peer[] = [];

afterAll(async () => {
  for (const p of peers) {
    p.ws.close();
    p.proc.kill("SIGTERM");
    await fs.rm(p.vaultRoot, { recursive: true, force: true });
  }
});

describe("E2E-3: two sidecars consent round-trip", () => {
  it(
    "request → approve-snippet → requester receives full text",
    async () => {
      const a = await startSidecar(7431);
      peers.push(a);
      const b = await startSidecar(7432);
      peers.push(b);

      const aCreated = await ask(
        a.ws,
        { kind: "vault.create", displayName: "Acme Legal" },
        "vault.created"
      );
      const invite = await ask(
        a.ws,
        { kind: "vault.invite-create", placeholderDisplayName: "Marcus", expiresIn: "1h" },
        "invite.token"
      );
      const token = invite["token"] as string;
      await ask(
        b.ws,
        { kind: "vault.invite-accept", token, displayName: "Marcus" },
        "vault.joined"
      );

      // Wait until both peers see each other
      const start = Date.now();
      while (Date.now() - start < 60_000) {
        const aPeers = await ask(a.ws, { kind: "peer.list" }, "peer.list");
        if (Array.isArray(aPeers["peers"]) && (aPeers["peers"] as unknown[]).length >= 2) {
          break;
        }
        await new Promise((r) => setTimeout(r, 2_000));
      }

      // A captures a memory
      const text = "Sarah promised the indemnification clause from Acme MSA 2025";
      const aCap = await ask(
        a.ws,
        { kind: "capture.text", text, tags: [] },
        "capture.ack"
      );
      const memoryId = aCap["memoryId"] as string;
      const aVaultId = aCreated["vaultId"];

      // B searches — gets a blurred hit
      const bHits = (await ask(
        b.ws,
        { kind: "search.run", query: "indemnification", k: 5 },
        "search.hits"
      )) as { hits: Array<{ memoryId: string; snippet: string; ownerPeerId?: string }> };
      const remoteHit = bHits.hits.find((h) => h.memoryId === memoryId);
      expect(remoteHit).toBeTruthy();
      expect(remoteHit!.snippet).toContain("•");
      const ownerPeerId = remoteHit!.ownerPeerId!;

      // A listens for the incoming consent.incoming push
      const incomingPromise = awaitMsg(
        a.ws,
        (m) => m["kind"] === "consent.incoming"
      );

      // B sends consent.request
      const pending = await ask(
        b.ws,
        {
          kind: "consent.request",
          memoryId,
          ownerPeerId,
          scope: "snippet",
        },
        "consent.pending"
      );
      const consentRequestId = pending["consentRequestId"] as string;
      expect(typeof consentRequestId).toBe("string");

      // A receives consent.incoming
      const incoming = await incomingPromise;
      expect(incoming["consentRequestId"]).toBe(consentRequestId);

      // B listens for consent.granted
      const grantedPromise = awaitMsg(
        b.ws,
        (m) =>
          m["kind"] === "consent.granted" &&
          m["consentRequestId"] === consentRequestId
      );

      // A approves snippet
      a.ws.send(
        JSON.stringify({
          kind: "consent.respond",
          consentRequestId,
          decision: "approve-snippet",
        })
      );

      // B sees the full snippet
      const granted = await grantedPromise;
      expect(granted["scope"]).toBe("snippet");
      const payload = granted["payload"] as { text: string };
      expect(payload.text).toContain("indemnification");
      expect(payload.text).not.toContain("•");
    },
    300_000
  );
});
