import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createSidecarServer, type SidecarServer } from "../src/http-server.js";
import { WebSocket } from "ws";

const TOKEN = "test-token-1234567890";

describe("createSidecarServer", () => {
  let server: SidecarServer;

  beforeEach(async () => {
    server = await createSidecarServer({
      port: 0,
      host: "127.0.0.1",
      authToken: TOKEN,
      onMessage: async (msg) => ({ echoed: msg }),
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it("binds to loopback only (refuses 0.0.0.0)", async () => {
    await expect(
      createSidecarServer({
        port: 0,
        host: "0.0.0.0",
        authToken: TOKEN,
        onMessage: async () => ({}),
      })
    ).rejects.toThrow(/loopback/);
  });

  it("refuses to bind 'localhost' (DNS-dependent; numeric only)", async () => {
    await expect(
      createSidecarServer({
        port: 0,
        host: "localhost",
        authToken: TOKEN,
        onMessage: async () => ({}),
      })
    ).rejects.toThrow(/loopback/);
  });

  it("responds to GET /healthz with 200", async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/healthz`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("WS echoes via the onMessage handler when token is presented", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?token=${TOKEN}`);
    await new Promise<void>((res) => ws.once("open", () => res()));
    ws.send(JSON.stringify({ hello: "world" }));
    const reply = await new Promise<string>((res) =>
      ws.once("message", (data) => res(String(data)))
    );
    const parsed = JSON.parse(reply);
    expect(parsed).toMatchObject({ echoed: { hello: "world" } });
    ws.close();
  });

  it("WS rejects connection without a token", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    const result = await new Promise<"open" | "error" | "close">((res) => {
      ws.once("open", () => res("open"));
      ws.once("error", () => res("error"));
      ws.once("unexpected-response", () => res("error"));
    });
    expect(result).toBe("error");
  });

  it("WS rejects a request whose Origin header is from another site", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?token=${TOKEN}`, {
      headers: { origin: "http://evil.example.com" },
    });
    const result = await new Promise<"open" | "error">((res) => {
      ws.once("open", () => res("open"));
      ws.once("error", () => res("error"));
      ws.once("unexpected-response", () => res("error"));
    });
    expect(result).toBe("error");
  });

  it("WS accepts Origin: http://localhost:5173 (browser default for Vite dev)", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?token=${TOKEN}`, {
      headers: { origin: "http://localhost:5173" },
    });
    const result = await new Promise<"open" | "error">((res) => {
      ws.once("open", () => res("open"));
      ws.once("error", () => res("error"));
      ws.once("unexpected-response", () => res("error"));
    });
    expect(result).toBe("open");
    ws.close();
  });
});
