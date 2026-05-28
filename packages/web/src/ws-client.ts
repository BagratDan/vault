import type { ClientMessage, ServerMessage } from "./types.js";

export interface WsClient {
  send: (msg: ClientMessage) => void;
  onMessage: (handler: (msg: ServerMessage) => void) => () => void;
  close: () => void;
}

export interface WsClientOptions {
  url: string;
  wsImpl?: typeof WebSocket;
}

export function createWsClient(opts: WsClientOptions): WsClient {
  const Impl = opts.wsImpl ?? WebSocket;
  const socket = new Impl(opts.url);
  const handlers = new Set<(m: ServerMessage) => void>();
  const pending: string[] = [];

  socket.onmessage = (ev: MessageEvent) => {
    let parsed: ServerMessage;
    try {
      parsed = JSON.parse(String(ev.data)) as ServerMessage;
    } catch {
      return;
    }
    for (const h of handlers) h(parsed);
  };

  socket.onopen = () => {
    while (pending.length > 0) socket.send(pending.shift()!);
  };

  return {
    send: (msg) => {
      const data = JSON.stringify(msg);
      if (socket.readyState === socket.OPEN) {
        socket.send(data);
      } else {
        pending.push(data);
      }
    },
    onMessage: (h) => {
      handlers.add(h);
      return () => {
        handlers.delete(h);
      };
    },
    close: () => socket.close(),
  };
}
