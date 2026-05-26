import http from "node:http";
import { WebSocketServer } from "ws";
import type { WebSocket as WSConn } from "ws";

export interface SidecarServerOptions {
  port: number;
  host: string;
  onMessage: (msg: unknown, conn: SidecarConnection) => Promise<unknown>;
  /**
   * Required shared secret. Clients must include it in the `?token=...`
   * query string of the WS upgrade URL OR in an `x-vault-token` header.
   * Generated at sidecar start; the web UI reads it via the /token endpoint
   * which only accepts requests originating from the sidecar's own origin.
   */
  authToken: string;
  /** Origin(s) accepted on WS upgrade. Defaults to same-origin only. */
  allowedOrigins?: readonly string[];
}

export interface SidecarConnection {
  send(msg: unknown): void;
  close(): void;
}

export interface SidecarServer {
  port: number;
  close: () => Promise<void>;
  /**
   * Push a message to every currently-connected WS client. Used for
   * peer.connected / peer.disconnected events that originate in the
   * Hyperswarm transport, not in response to a client request.
   */
  broadcast: (msg: unknown) => void;
}

// Numeric loopback only. "localhost" intentionally excluded — it depends on
// /etc/hosts and DNS, both of which a non-loopback adversary can influence.
const ALLOWED_HOSTS = new Set(["127.0.0.1", "::1"]);

export async function createSidecarServer(
  opts: SidecarServerOptions
): Promise<SidecarServer> {
  if (!ALLOWED_HOSTS.has(opts.host)) {
    throw new Error(
      `sidecar refused to bind ${opts.host} — loopback only (127.0.0.1 / ::1)`
    );
  }

  // Browsers use whatever hostname is in the address bar for the Origin header,
  // so we accept both 127.0.0.1 and localhost variants. The loopback-only bind
  // (enforced above) is the real isolation; Origin is a defense-in-depth check
  // against cross-origin browser tabs.
  const allowedOriginsHttp = opts.allowedOrigins ?? [
    `http://${opts.host}:${opts.port}`,
    `http://127.0.0.1:5173`,
    `http://localhost:5173`,
    `http://127.0.0.1:${opts.port}`,
    `http://localhost:${opts.port}`,
  ];

  const httpServer = http.createServer((req, res) => {
    if (req.url === "/healthz") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.url === "/token") {
      // Origin-gated handoff so the local web UI can pick up the secret
      // without any caller off-host seeing it. Browsers always send Origin
      // on cross-origin XHR/fetch; same-origin fetch from the Vite dev
      // proxy carries Origin too. Native HTTP clients (curl, ws lib) skip
      // Origin, in which case we serve the token — the bind is loopback
      // only, so a same-host client with no Origin is the user.
      const origin = req.headers.origin;
      if (origin !== undefined && !allowedOriginsHttp.includes(origin)) {
        res.statusCode = 403;
        res.end();
        return;
      }
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ token: opts.authToken }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });

  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
    verifyClient: (info, done) => {
      // Origin gate: any browser tab attempting cross-origin WS connection
      // to this loopback sidecar must be denied. Native WebSocket clients
      // (the Vite dev proxy, tests via `ws` lib) typically send no Origin.
      const origin = info.req.headers.origin;
      if (origin !== undefined && !allowedOriginsHttp.includes(origin)) {
        done(false, 403, "forbidden origin");
        return;
      }
      // Token gate: either ?token=... in the request URL or x-vault-token.
      const url = new URL(info.req.url ?? "/ws", "http://placeholder");
      const queryTok = url.searchParams.get("token");
      const headerTok = info.req.headers["x-vault-token"];
      const presented = queryTok ?? (typeof headerTok === "string" ? headerTok : null);
      if (presented !== opts.authToken) {
        done(false, 401, "auth required");
        return;
      }
      done(true);
    },
  });
  const liveSockets = new Set<WSConn>();
  wss.on("connection", (socket: WSConn) => {
    let closed = false;
    liveSockets.add(socket);
    socket.on("close", () => {
      closed = true;
      liveSockets.delete(socket);
    });
    const conn: SidecarConnection = {
      send: (msg) => {
        if (closed) return;
        try {
          socket.send(JSON.stringify(msg));
        } catch {
          // socket may have closed between the readyState check and send
        }
      },
      close: () => socket.close(),
    };
    socket.on("message", async (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(raw));
      } catch {
        conn.send({
          kind: "error",
          code: "invalid-json",
          message: "WS payload was not valid JSON",
        });
        return;
      }
      try {
        const reply = await opts.onMessage(parsed, conn);
        conn.send(reply);
      } catch (err) {
        conn.send({
          kind: "error",
          code: "router-threw",
          message: err instanceof Error ? err.message : String(err),
        });
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
    broadcast: (msg: unknown) => {
      const payload = JSON.stringify(msg);
      for (const s of liveSockets) {
        if (s.readyState === 1 /* OPEN */) {
          try {
            s.send(payload);
          } catch {
            // socket may have closed between iteration and send
          }
        }
      }
    },
  };
}
