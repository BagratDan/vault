import { describe, expect, it } from "vitest";
import { createWsClient } from "../src/ws-client.js";

describe("WsClient", () => {
  it("encodes messages as JSON to a mock WebSocket", () => {
    const sent: string[] = [];
    class MockWs {
      onopen?: () => void;
      onmessage?: (ev: { data: string }) => void;
      onclose?: () => void;
      readyState = 1;
      send(data: string) {
        sent.push(data);
      }
      close() {}
    }
    const mockGlobal = MockWs as unknown as typeof WebSocket;
    const client = createWsClient({ url: "ws://x", wsImpl: mockGlobal });
    client.send({ kind: "capture.text", text: "hi", tags: [] });
    expect(sent).toEqual([
      JSON.stringify({ kind: "capture.text", text: "hi", tags: [] }),
    ]);
  });
});
