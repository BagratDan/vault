import Hyperswarm from "hyperswarm";
import b4a from "b4a";
import { wireRpc, type DuplexLike, type RpcHandler, type RpcSession } from "./swarm.js";

/**
 * MemberClaim — sent over the Hyperswarm RPC channel on first peer
 * connect. Lives only on the wire (never persisted). The receiving peer
 * (admin) verifies the Ed25519 signature, checks the vaultId matches,
 * and writes a Member record on the claimant's behalf.
 */
export interface MemberClaim {
  v: 1;
  vaultId: string;
  peerId: string;       // hex(32) — same as publicKey for Ed25519
  publicKey: string;    // hex(32)
  displayName: string;
  ts: string;           // ISO8601
  sig: string;          // Ed25519 sig over canonical(claim - sig)
}

export interface SwarmEvents {
  onPeerConnect?: (peerId: string, session: RpcSession) => Promise<void> | void;
  onPeerDisconnect?: (peerId: string) => void;
  /** Called when a peer sends us a member.claim RPC. Admins use this
   *  to verify + admit; non-admin peers can ignore (no-op). */
  onClaim?: (peerId: string, claim: MemberClaim) => Promise<void> | void;
}

/**
 * Wraps Hyperswarm peer discovery into a typed transport. On each
 * connection, wires a JSON-line RPC layer (wireRpc) over the duplex
 * stream so RPC requests can flow in both directions.
 */
export class SwarmTransport {
  private swarm: Hyperswarm | null = null;
  private connections = new Map<string, RpcSession>();
  private handler: RpcHandler;
  private events: SwarmEvents;

  constructor(handler: RpcHandler, events: SwarmEvents = {}) {
    this.handler = handler;
    this.events = events;
  }

  async join(topicHex: string): Promise<void> {
    const topic = b4a.from(topicHex, "hex");
    this.swarm = new Hyperswarm();

    this.swarm.on("connection", (conn, info) => {
      const peerPk = b4a.toString(info.publicKey, "hex");

      const duplex: DuplexLike = {
        write: (s) => conn.write(b4a.from(s + "\n", "utf8")),
      };

      // Buffered line reader — Hyperswarm gives us chunks of bytes; we
      // split on '\n' to recover the framed JSON lines wireRpc expects.
      let buffer = "";
      conn.on("data", (data) => {
        buffer += b4a.toString(data, "utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.length > 0) duplex.onData?.(line);
        }
      });

      conn.on("close", () => {
        this.connections.delete(peerPk);
        this.events.onPeerDisconnect?.(peerPk);
      });

      // Intercept member.claim before falling through to the generic handler
      // so admins can wire admission logic via onClaim without taking over
      // the full RPC handler shape.
      const session = wireRpc(duplex, async (method, params) => {
        if (method === "member.claim") {
          await this.events.onClaim?.(peerPk, params as MemberClaim);
          return { ok: true };
        }
        return this.handler(method, params);
      });
      this.connections.set(peerPk, session);
      void this.events.onPeerConnect?.(peerPk, session);
    });

    this.swarm.join(topic, { server: true, client: true });
    await this.swarm.flush();
  }

  listConnectedPeers(): string[] {
    return [...this.connections.keys()];
  }

  request(peerId: string, method: string, params: unknown): Promise<unknown> {
    const session = this.connections.get(peerId);
    if (!session) throw new Error(`no rpc session for peer ${peerId}`);
    return session.request(method, params);
  }

  /** Send a MemberClaim to a specific peer. Members call this on connect. */
  async sendClaim(peerId: string, claim: MemberClaim): Promise<void> {
    const session = this.connections.get(peerId);
    if (!session) return;
    await session.request("member.claim", claim);
  }

  async broadcast(
    method: string,
    params: unknown
  ): Promise<Array<{ peerId: string; reply?: unknown; error?: string }>> {
    const peers = [...this.connections.entries()];
    const settled = await Promise.allSettled(
      peers.map(([peerId, sess]) =>
        sess.request(method, params).then((reply) => ({ peerId, reply }))
      )
    );
    return settled.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { peerId: peers[i]![0], error: (r.reason as Error).message }
    );
  }

  async close(): Promise<void> {
    for (const [, s] of this.connections) s.close();
    this.connections.clear();
    if (this.swarm) {
      await this.swarm.destroy();
      this.swarm = null;
    }
  }
}
