import http from "node:http";
import { WebSocketServer } from "ws";
import type { WebSocket as WSConn } from "ws";

export interface SidecarServerOptions {
  port: number;
  host: string;
  onMessage: (msg: unknown, conn: SidecarConnection) => Promise<unknown>;
}

export interface SidecarConnection {
  send(msg: unknown): void;
  close(): void;
}

export interface SidecarServer {
  port: number;
  close: () => Promise<void>;
}

const ALLOWED_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

export async function createSidecarServer(
  opts: SidecarServerOptions
): Promise<SidecarServer> {
  if (!ALLOWED_HOSTS.has(opts.host)) {
    throw new Error(
      `sidecar refused to bind ${opts.host} — loopback only (127.0.0.1 / ::1 / localhost)`
    );
  }

  const httpServer = http.createServer((req, res) => {
    if (req.url === "/healthz") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  wss.on("connection", (socket: WSConn) => {
    const conn: SidecarConnection = {
      send: (msg) => socket.send(JSON.stringify(msg)),
      close: () => socket.close(),
    };
    socket.on("message", async (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(raw));
      } catch {
        conn.send({ error: "invalid-json" });
        return;
      }
      try {
        const reply = await opts.onMessage(parsed, conn);
        conn.send(reply);
      } catch (err) {
        conn.send({ error: err instanceof Error ? err.message : "unknown" });
      }
    });
  });

  await new Promise<void>((res) =>
    httpServer.listen({ host: opts.host, port: opts.port }, () => res())
  );
  const addr = httpServer.address();
  const port = typeof addr === "object" && addr ? addr.port : opts.port;

  return {
    port,
    close: async () => {
      wss.close();
      await new Promise<void>((res) => httpServer.close(() => res()));
    },
  };
}
