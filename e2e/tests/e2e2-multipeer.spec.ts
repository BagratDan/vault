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
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), `vault-multipeer-${port}-`));
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
    const timer = setTimeout(() => reject(new Error("sidecar boot timeout")), SIDECAR_TIMEOUT_MS);
    proc.stdout?.on("data", (chunk) => {
      if (chunk.toString().includes("sidecar listening")) {
        clearTimeout(timer);
        resolve();
      }
    });
    proc.on("exit", () => reject(new Error(`sidecar exited early`)));
  });
  const token = (await fs.readFile(path.join(vaultRoot, ".ws-token"), "utf8")).trim();
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
  await new Promise<void>((resolve) => ws.once("open", () => resolve()));
  return { port, vaultRoot, proc, token, ws };
}

async function ask(ws: WebSocket, msg: unknown, replyKind: string, timeoutMs = 60_000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${replyKind}`)), timeoutMs);
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

const peers: Peer[] = [];

afterAll(async () => {
  for (const p of peers) {
    p.ws.close();
    p.proc.kill("SIGTERM");
    await fs.rm(p.vaultRoot, { recursive: true, force: true });
  }
});

describe("E2E-2: two sidecars on real Hyperswarm", () => {
  it("create vault on A, invite to B, B joins, peer.list shows both", async () => {
    const a = await startSidecar(7421);
    peers.push(a);
    const b = await startSidecar(7422);
    peers.push(b);

    const aCreated = await ask(
      a.ws,
      { kind: "vault.create", displayName: "Acme Legal" },
      "vault.created"
    );
    expect(aCreated["vaultId"]).toBeTruthy();

    const invite = await ask(
      a.ws,
      { kind: "vault.invite-create", placeholderDisplayName: "Marcus", expiresIn: "1h" },
      "invite.token"
    );
    const token = invite["token"] as string;
    expect(token.length).toBeGreaterThan(100);

    const bJoined = await ask(
      b.ws,
      { kind: "vault.invite-accept", token, displayName: "Marcus" },
      "vault.joined"
    );
    expect(bJoined["vaultId"]).toBe(aCreated["vaultId"]);

    let aPeers: Record<string, unknown> = { peers: [] };
    const start = Date.now();
    while (Date.now() - start < 60_000) {
      aPeers = await ask(a.ws, { kind: "peer.list" }, "peer.list");
      if (Array.isArray(aPeers["peers"]) && (aPeers["peers"] as unknown[]).length >= 2) break;
      await new Promise((r) => setTimeout(r, 2_000));
    }
    expect((aPeers["peers"] as unknown[]).length).toBe(2);
  }, 180_000);
});
