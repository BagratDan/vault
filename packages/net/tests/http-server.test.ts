import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createSidecarServer, type SidecarServer } from "../src/http-server.js";
import { WebSocket } from "ws";

describe("createSidecarServer", () => {
  let server: SidecarServer;

  beforeEach(async () => {
    server = await createSidecarServer({
      port: 0,
      host: "127.0.0.1",
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

  it("WS echoes via the onMessage handler", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    await new Promise<void>((res) => ws.once("open", () => res()));
    ws.send(JSON.stringify({ hello: "world" }));
    const reply = await new Promise<string>((res) =>
      ws.once("message", (data) => res(String(data)))
    );
    const parsed = JSON.parse(reply);
    expect(parsed).toMatchObject({ echoed: { hello: "world" } });
    ws.close();
  });
});
