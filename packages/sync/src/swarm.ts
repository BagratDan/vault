import { newUlid } from "@vault/domain";

/**
 * A duplex string transport. `write(line)` ships one JSON-encoded line.
 * The owner sets `onData` to receive incoming lines. The Hyperswarm
 * wrapper in swarm-transport.ts adapts byte streams + newline buffering
 * to this interface.
 */
export interface DuplexLike {
  onData?: (data: string) => void;
  write(s: string): void;
}

export interface RpcSession {
  request(method: string, params: unknown): Promise<unknown>;
  close(): void;
}

export type RpcHandler = (method: string, params: unknown) => Promise<unknown>;

interface Frame {
  v: 1;
  id: string;
  kind: "req" | "res";
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: string;
}

/**
 * Wires a JSON-line RPC layer on top of a duplex string transport.
 * Returns an RpcSession that lets the caller initiate requests.
 */
export function wireRpc(duplex: DuplexLike, handler: RpcHandler): RpcSession {
  const pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();

  duplex.onData = (line) => {
    let frame: Frame;
    try {
      frame = JSON.parse(line) as Frame;
    } catch {
      return;
    }
    if (frame.kind === "req" && frame.method) {
      void (async () => {
        try {
          const result = await handler(frame.method as string, frame.params);
          duplex.write(JSON.stringify({ v: 1, id: frame.id, kind: "res", result }));
        } catch (err) {
          duplex.write(
            JSON.stringify({
              v: 1,
              id: frame.id,
              kind: "res",
              error: err instanceof Error ? err.message : "unknown",
            })
          );
        }
      })();
    } else if (frame.kind === "res") {
      const slot = pending.get(frame.id);
      if (!slot) return;
      pending.delete(frame.id);
      if (frame.error) slot.reject(new Error(frame.error));
      else slot.resolve(frame.result);
    }
  };

  return {
    request(method, params) {
      return new Promise((resolve, reject) => {
        const id = newUlid();
        pending.set(id, { resolve, reject });
        duplex.write(JSON.stringify({ v: 1, id, kind: "req", method, params }));
      });
    },
    close() {
      for (const [, slot] of pending) {
        slot.reject(new Error("closed"));
      }
      pending.clear();
    },
  };
}
