import crypto from "node:crypto";
import path from "node:path";
import { createSidecarServer } from "@vault/net";
import { Provider, ModelPool } from "@vault/ai";
import {
  AuditLog,
  Indexes,
  RateLimiter,
  Repo,
  SwarmTransport,
  openAutobeeStore,
  signCanonical,
  verifyCanonical,
  type MemberClaim,
} from "@vault/sync";
import { Workspace } from "@vault/retrieval";
import { newUlid, type ConsentEvent } from "@vault/domain";
import b4a from "b4a";
import { loadConfig } from "./config.js";
import { VaultFs } from "./vault-fs.js";
import { loadOrCreateIdentity } from "./identity.js";
import { readVaultState, type VaultState } from "./vault-state.js";
import { makeRouter, type BridgeDeps } from "./ws-bridge.js";
import { handleSearchProbe } from "./routes/search.js";
import type { VaultRuntime } from "./routes/vault.js";
import { ConsentState } from "./consent-state.js";

export interface VaultHandle {
  port: number;
  peerId: string;
  authToken: string;
  close: () => Promise<void>;
}

export async function startVault(): Promise<VaultHandle> {
  const cfg = loadConfig({ env: process.env });
  const fsApi = new VaultFs(cfg.vaultRoot);
  await fsApi.ensureDir("data");
  await fsApi.ensureDir("audio");
  await fsApi.ensureDir("audit");

  const identity = await loadOrCreateIdentity(fsApi);

  // Per-launch WS auth token, mode 0600.
  const authToken = crypto.randomBytes(32).toString("hex");
  await fsApi.writeFile(".ws-token", new TextEncoder().encode(authToken));

  // Provider + ModelPool always start; the vault store/swarm activate
  // lazily — either at boot (if a vault-state.json exists) or after
  // vault.create / vault.invite-accept.
  const provider = new Provider();
  await provider.start();
  const pool = new ModelPool({
    memoryPressureFloor: 0.6,
    onMemoryPressure: (info) => {
      console.warn(
        `[vault] memory pressure: rss=${info.rss} total=${info.total}`
      );
    },
  });

  const workspace = new Workspace(identity.peerId);

  const rateLimiter = new RateLimiter();

  const runtime: VaultRuntime = { store: null, swarm: null, state: null };

  let consentState: ConsentState | null = null;
  let audit: AuditLog | null = null;

  // The RPC handler dispatches inbound RPC messages from connected peers.
  // Currently: search.probe (federated search). Plan 3 will add consent.request.
  const rpcHandler = async (method: string, params: unknown): Promise<unknown> => {
    if (method === "search.probe") {
      return handleSearchProbe(
        { pool, workspace, selfPeerId: identity.peerId },
        params as { v: 1; requestId: string; query: string; k: number }
      );
    }
    throw new Error(`unknown rpc method: ${method}`);
  };
  let broadcastToClients: (msg: unknown) => void = () => undefined;

  async function activateVault(state: VaultState): Promise<void> {
    if (!audit) {
      const auditInst = new AuditLog(fsApi.path("audit"));
      await auditInst.ready();
      audit = auditInst;
    }
    if (!consentState) {
      consentState = new ConsentState({
        onExpire: (consentRequestId) => {
          broadcastToClients({ kind: "consent.expired", consentRequestId });
        },
      });
    }

    const writeAudit = async (
      partial: Omit<ConsentEvent, "id" | "createdAt" | "updatedAt" | "provenance">
    ): Promise<void> => {
      if (!audit) return;
      const now = new Date().toISOString();
      const ev = {
        id: newUlid(),
        createdAt: now,
        updatedAt: now,
        provenance: { kind: "user" as const },
        ...partial,
      } as ConsentEvent;
      try {
        await audit.append(ev);
      } catch (err) {
        console.warn("[vault] audit append failed:", err);
      }
    };

    const swarm = new SwarmTransport(
      (method, params) => rpcHandler(method, params),
      {
        onPeerConnect: async (peerId) => {
          broadcastToClients({
            kind: "peer.connected",
            peer: { peerId, displayName: peerId.slice(0, 8) },
          });
          // Members send a signed MemberClaim on first connect so the
          // admin can admit them. The store's local key is the writer
          // identity; we sign with it.
          if (state.role === "member" && runtime.store) {
            const claimBody = {
              v: 1 as const,
              vaultId: state.vaultId,
              peerId: state.selfPeerId,
              publicKey: state.selfPeerId,
              displayName: state.displayName,
              ts: new Date().toISOString(),
            };
            const claim: MemberClaim = {
              ...claimBody,
              sig: signCanonical(claimBody, runtime.store.secretKey),
            };
            try {
              await swarm.sendClaim(peerId, claim);
            } catch {
              // Best-effort. If the admin is offline, the claim will be
              // retried on the next connection. Don't crash the swarm.
            }
          }
        },
        onPeerDisconnect: (peerId) => {
          broadcastToClients({ kind: "peer.disconnected", peerId });
        },
        onClaim: async (_peerId, claim) => {
          // Only the admin admits new members. Others ignore.
          if (state.role !== "admin" || !runtime.store) return;
          if (claim.vaultId !== state.vaultId) return;
          // Verify the claimant's signature against the embedded publicKey
          const { sig, ...claimBody } = claim;
          let pkBytes: Uint8Array;
          try {
            pkBytes = b4a.from(claim.publicKey, "hex");
          } catch {
            return;
          }
          if (!verifyCanonical(claimBody, sig, pkBytes)) return;
          // Write Member record signed by admin
          const now = new Date().toISOString();
          const memberRec = {
            id: newUlid(),
            createdAt: now,
            updatedAt: now,
            ownerPeerId: identity.peerId,
            provenance: { kind: "user" as const },
            kind: "member" as const,
            peerId: claim.peerId,
            displayName: claim.displayName,
            role: "member" as const,
            admittedBy: state.selfPeerId,
            admittedAt: now,
            publicKey: claim.publicKey,
          };
          await runtime.store.append({
            kind: "member",
            key: `member/${claim.peerId}`,
            value: {
              ...memberRec,
              sig: signCanonical(memberRec, runtime.store.secretKey),
            },
          });
          await runtime.store.flush();
        },
        // Owner side: a remote peer requested access to one of our memories.
        onConsentRequest: async (peerId, req) => {
          if (!runtime.store || !consentState) return;
          const repo = new Repo({
            view: runtime.store.view,
            append: runtime.store.append,
            ownerPeerId: identity.peerId,
          });
          const memory = await repo.getMemory(req.memoryId as never);
          if (!memory) {
            // Memory not found — deny immediately
            try {
              await swarm.sendConsent(peerId, {
                v: 1,
                method: "consent.response",
                consentRequestId: req.consentRequestId,
                kind: "deny",
                reason: "memory-not-found",
              });
            } catch {
              // best-effort
            }
            await writeAudit({
              requesterPeerId: peerId,
              ownerPeerId: identity.peerId,
              resourceId: req.memoryId,
              kind: "deny",
            });
            return;
          }
          const now = Date.now();
          const requesterDisplayName = req.requesterDisplayName;
          consentState.set({
            consentRequestId: req.consentRequestId,
            requesterPeerId: peerId,
            ownerPeerId: identity.peerId,
            memoryId: req.memoryId,
            scope: req.scope,
            requesterDisplayName,
            requestedAt: req.ts,
          });
          const ratePolicy = rateLimiter.record(peerId);
          broadcastToClients({
            kind: "consent.incoming",
            consentRequestId: req.consentRequestId,
            requesterPeerId: peerId,
            requesterDisplayName,
            memoryId: req.memoryId,
            memoryTitle: memory.summary ?? req.memoryId,
            scope: req.scope,
            expiresAt: now + 5 * 60 * 1000,
            ratePolicy,
          });
          await writeAudit({
            requesterPeerId: peerId,
            ownerPeerId: identity.peerId,
            resourceId: req.memoryId,
            kind: "request",
          });
        },
        // Requester side: the owner has decided (approve / deny / expire).
        onConsentResponse: async (peerId, res) => {
          const SENTINEL_ID = "00000000000000000000000000";
          if (res.kind === "approve") {
            broadcastToClients({
              kind: "consent.granted",
              consentRequestId: res.consentRequestId,
              scope: res.scope,
              payload: res.payload,
            });
            const kind: ConsentEvent["kind"] =
              res.scope === "metadata"
                ? "approve-metadata"
                : res.scope === "snippet"
                  ? "approve-snippet"
                  : "approve-file";
            await writeAudit({
              requesterPeerId: identity.peerId,
              ownerPeerId: peerId,
              resourceId: SENTINEL_ID,
              kind,
            });
          } else if (res.kind === "deny") {
            broadcastToClients({
              kind: "consent.denied",
              consentRequestId: res.consentRequestId,
              ...(res.reason ? { reason: res.reason } : {}),
            });
            await writeAudit({
              requesterPeerId: identity.peerId,
              ownerPeerId: peerId,
              resourceId: SENTINEL_ID,
              kind: "deny",
            });
          } else {
            broadcastToClients({
              kind: "consent.expired",
              consentRequestId: res.consentRequestId,
            });
          }
        },
      }
    );
    await swarm.join(state.topic);
    runtime.swarm = swarm;
  }

  // Boot-time vault open: if state file exists, open the store and join swarm.
  const existing = await readVaultState(fsApi);
  if (existing) {
    runtime.store = await openAutobeeStore({
      rootDir: path.join(cfg.vaultRoot, "data"),
      founderPeerId: existing.founderPeerId,
      role: existing.role,
      ...(existing.role === "member"
        ? { bootstrapKey: existing.bootstrapKey }
        : {}),
    });
    runtime.state = existing;
    await activateVault(existing);
  }

  // The vault routes call `runtime.onActivated(state)` after a fresh create/join
  // so the swarm comes up without us redundantly re-reading vault-state.json.
  runtime.onActivated = activateVault;

  const getRepo = (): Repo => {
    if (!runtime.store) throw new Error("vault not active");
    return new Repo({
      view: runtime.store.view,
      append: runtime.store.append,
      ownerPeerId: identity.peerId,
    });
  };
  const getIndexes = (): Indexes => {
    if (!runtime.store) throw new Error("vault not active");
    return new Indexes({
      view: runtime.store.view,
      append: runtime.store.append,
    });
  };

  const bridgeDeps: BridgeDeps = {
    pool,
    workspace,
    fs: fsApi,
    ownerPeerId: identity.peerId,
    identity: {
      peerId: identity.peerId,
      publicKey: identity.publicKey,
      privateKey: identity.privateKey,
    },
    runtime,
    getRepo,
    getIndexes,
    getConsentState: () => consentState,
    getAudit: () => audit,
    selfDisplayName: () =>
      runtime.state?.displayName ?? identity.peerId.slice(0, 8),
  };

  const router = makeRouter(bridgeDeps);

  const server = await createSidecarServer({
    port: cfg.wsPort,
    host: cfg.wsHost,
    authToken,
    onMessage: async (msg, conn) => router(msg, conn),
  });

  // Now that the server exists, point the broadcast pipe at it.
  broadcastToClients = (msg) => server.broadcast(msg);

  return {
    port: server.port,
    peerId: identity.peerId,
    authToken,
    close: async () => {
      await server.close();
      if (runtime.swarm) await runtime.swarm.close();
      if (runtime.store) await runtime.store.close();
      consentState?.dispose();
      if (audit) await audit.close();
      await workspace.close();
      await pool.unloadAll();
      await provider.stop();
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startVault()
    .then(({ port, peerId }) => {
      console.log(
        `[vault] sidecar listening on 127.0.0.1:${port} (peerId=${peerId})`
      );
    })
    .catch((err) => {
      console.error("[vault] failed to start:", err);
      process.exit(1);
    });
}
