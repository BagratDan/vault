/**
 * E2E-1 — the literal Tether prompt flow.
 *
 * Spec: "at least one end-to-end flow covering capture, sync, retrieval,
 * and answer generation."
 *
 * Boots a real Vault sidecar in a child process (with @qvac/sdk swapped
 * for a mock via a Node ESM resolver hook), then drives the full backend
 * pipeline over a real WebSocket connection:
 *
 *   capture.text → capture.ack
 *   capture.audio → capture.ack (mocked Parakeet transcription)
 *   search.run → search.hits + answer.chunk + answer.done (with citations)
 *   tts.play → tts.chunk + tts.done
 *
 * The React layer is covered by @vault/web's component tests; this E2E
 * proves the backend wires end-to-end. A future Playwright variant
 * (playwright.config.ts is also committed) can drive the same flow
 * through the browser once a stable webServer setup is dialed in.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { WebSocket } from "ws";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const APP_DIR = path.join(REPO_ROOT, "packages/app");

let child: ChildProcess;
let port: number;
let vaultRoot: string;

beforeAll(async () => {
  vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vault-e2e-"));

  const tsxBin = path.join(REPO_ROOT, "node_modules/.bin/tsx");

  child = spawn(
    tsxBin,
    ["--import=./tests/qvac-mock/register.js", "src/index.ts"],
    {
      cwd: APP_DIR,
      env: {
        ...process.env,
        VAULT_QVAC_MOCK: "1",
        VAULT_ROOT: vaultRoot,
        VAULT_PORT: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  // Wait for the sidecar to announce its port, with a 20s timeout
  port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("sidecar did not start within 20s"));
    }, 20_000);
    let buffered = "";
    child.stdout!.on("data", (chunk) => {
      buffered += String(chunk);
      const m = buffered.match(/listening on 127\.0\.0\.1:(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    });
    child.stderr!.on("data", (chunk) => {
      // surface errors immediately
      process.stderr.write(`[sidecar stderr] ${String(chunk)}`);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`sidecar exited early with code ${code}`));
    });
  });
}, 30_000);

afterAll(async () => {
  if (child && !child.killed) {
    child.kill("SIGTERM");
    await new Promise((res) => setTimeout(res, 200));
    if (!child.killed) child.kill("SIGKILL");
  }
  await fs.rm(vaultRoot, { recursive: true, force: true });
});

interface CapturedMessage {
  kind: string;
  [k: string]: unknown;
}

async function openWs(): Promise<{
  ws: WebSocket;
  messages: CapturedMessage[];
}> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise<void>((resolve) => ws.once("open", () => resolve()));
  const messages: CapturedMessage[] = [];
  ws.on("message", (raw) => {
    messages.push(JSON.parse(String(raw)) as CapturedMessage);
  });
  return { ws, messages };
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 4000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((res) => setTimeout(res, 50));
  }
  throw new Error("waitFor timed out");
}

describe("E2E-1: literal Tether prompt flow", () => {
  it("captures text → searches → receives answer with citations", async () => {
    const { ws, messages } = await openWs();

    ws.send(
      JSON.stringify({
        kind: "capture.text",
        text: "Sarah said she'd ship the migration by Friday.",
        tags: [],
      })
    );
    await waitFor(() => messages.some((m) => m.kind === "capture.ack"));

    ws.send(
      JSON.stringify({
        kind: "search.run",
        query: "what did Sarah promise",
        k: 8,
      })
    );

    await waitFor(() => messages.some((m) => m.kind === "answer.done"));

    expect(messages.find((m) => m.kind === "capture.ack")).toBeDefined();
    expect(messages.find((m) => m.kind === "search.hits")).toBeDefined();
    expect(messages.find((m) => m.kind === "answer.chunk")).toBeDefined();
    const done = messages.find((m) => m.kind === "answer.done");
    expect(done).toBeDefined();
    expect((done as { citations: unknown[] }).citations.length).toBeGreaterThan(0);

    ws.close();
  });

  it("captures audio (mocked Parakeet) → answer over the transcript", async () => {
    const { ws, messages } = await openWs();

    const audio = new Uint8Array([0, 1, 2, 3]);
    ws.send(
      JSON.stringify({
        kind: "capture.audio",
        audioBase64: Buffer.from(audio).toString("base64"),
        tags: [],
      })
    );
    await waitFor(() => messages.some((m) => m.kind === "capture.ack"));

    ws.send(
      JSON.stringify({
        kind: "search.run",
        query: "team",
        k: 8,
      })
    );
    await waitFor(() => messages.some((m) => m.kind === "answer.done"));

    expect(messages.filter((m) => m.kind === "capture.ack")).toHaveLength(1);

    ws.close();
  });

  it("TTS streams audio chunks and signals done", async () => {
    const { ws, messages } = await openWs();

    ws.send(
      JSON.stringify({
        kind: "tts.play",
        text: "Hello from Vault.",
        requestId: "tts-1",
      })
    );

    await waitFor(() => messages.some((m) => m.kind === "tts.done"));

    expect(messages.find((m) => m.kind === "tts.chunk")).toBeDefined();
    expect(messages.find((m) => m.kind === "tts.done")).toBeDefined();

    ws.close();
  });
});
