import { describe, expect, it } from "vitest";
import { createWsClient } from "../src/ws-client.js";

class MockWs {
  static CONNECTING = 0;
  static OPEN = 1;
  CONNECTING = 0;
  OPEN = 1;
  onopen?: () => void;
  onmessage?: (ev: { data: string }) => void;
  onclose?: () => void;
  readyState: number;
  sent: string[] = [];
  constructor(readyState = 1) {
    this.readyState = readyState;
  }
  send(data: string) {
    if (this.readyState !== this.OPEN) {
      throw new Error("InvalidStateError: still CONNECTING");
    }
    this.sent.push(data);
  }
  close() {}
  open() {
    this.readyState = this.OPEN;
    this.onopen?.();
  }
}

describe("WsClient", () => {
  it("encodes messages as JSON to an OPEN WebSocket", () => {
    const instances: MockWs[] = [];
    const Impl = function (this: MockWs) {
      const m = new MockWs(1);
      instances.push(m);
      return m;
    } as unknown as typeof WebSocket;
    const client = createWsClient({ url: "ws://x", wsImpl: Impl });
    client.send({ kind: "capture.text", text: "hi", tags: [] });
    expect(instances[0]!.sent).toEqual([
      JSON.stringify({ kind: "capture.text", text: "hi", tags: [] }),
    ]);
  });

  it("queues sends made before onopen and flushes them on open", () => {
    const instances: MockWs[] = [];
    const Impl = function (this: MockWs) {
      const m = new MockWs(0); // CONNECTING
      instances.push(m);
      return m;
    } as unknown as typeof WebSocket;
    const client = createWsClient({ url: "ws://x", wsImpl: Impl });
    // Send while still CONNECTING — must not throw
    expect(() =>
      client.send({ kind: "vault.status" })
    ).not.toThrow();
    expect(instances[0]!.sent).toEqual([]); // nothing yet
    instances[0]!.open();
    expect(instances[0]!.sent).toEqual([JSON.stringify({ kind: "vault.status" })]);
  });
});
