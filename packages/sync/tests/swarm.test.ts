import { describe, expect, it } from "vitest";
import { wireRpc, type DuplexLike, type RpcSession } from "../src/swarm.js";

/** A pair of in-memory duplex transports that pipe to each other. */
function duplexPair() {
  const a: DuplexLike = { write: (s) => b.onData?.(s) };
  const b: DuplexLike = { write: (s) => a.onData?.(s) };
  return { a, b };
}

describe("wireRpc", () => {
  it("client.request resolves with server's reply", async () => {
    const { a, b } = duplexPair();
    wireRpc(a, async (method, params) => ({ ok: true, method, params }));
    const bSession: RpcSession = wireRpc(b, async () => ({ ok: false }));
    const reply = await bSession.request("ping", { n: 1 });
    expect(reply).toEqual({ ok: true, method: "ping", params: { n: 1 } });
  });

  it("handler exceptions return as error replies", async () => {
    const { a, b } = duplexPair();
    wireRpc(a, async () => {
      throw new Error("boom");
    });
    const bs = wireRpc(b, async () => ({}));
    await expect(bs.request("anything", {})).rejects.toThrow(/boom/);
  });

  it("concurrent requests are matched by requestId", async () => {
    const { a, b } = duplexPair();
    wireRpc(a, async (_m, p) => {
      const delay = (p as { ms: number }).ms;
      await new Promise((r) => setTimeout(r, delay));
      return { delay };
    });
    const bs = wireRpc(b, async () => ({}));
    const [r1, r2] = await Promise.all([
      bs.request("slow", { ms: 30 }),
      bs.request("fast", { ms: 5 }),
    ]);
    expect(r1).toEqual({ delay: 30 });
    expect(r2).toEqual({ delay: 5 });
  });

  it("close() rejects pending requests", async () => {
    const { a, b } = duplexPair();
    wireRpc(a, async () => {
      // Never resolves — keeps the request pending
      await new Promise(() => undefined);
      return {};
    });
    const bs = wireRpc(b, async () => ({}));
    const pending = bs.request("hang", {});
    bs.close();
    await expect(pending).rejects.toThrow(/closed/);
  });

  it("malformed lines are silently dropped", async () => {
    const { a, b } = duplexPair();
    wireRpc(a, async () => ({ ok: true }));
    const bs = wireRpc(b, async () => ({}));
    // Inject garbage from a's side
    a.write("not json at all");
    // Then a valid request from b should still work
    const reply = await bs.request("ping", {});
    expect(reply).toEqual({ ok: true });
  });
});
