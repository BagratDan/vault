import crypto from "node:crypto";
import path from "node:path";
import { createSidecarServer } from "@vault/net";
import { Provider, ModelPool } from "@vault/ai";
import {
  Indexes,
  Repo,
  SwarmTransport,
  openAutobeeStore,
} from "@vault/sync";
import { Workspace } from "@vault/retrieval";
import { loadConfig } from "./config.js";
import { VaultFs } from "./vault-fs.js";
import { loadOrCreateIdentity } from "./identity.js";
import { readVaultState, type VaultState } from "./vault-state.js";
import { makeRouter, type BridgeDeps } from "./ws-bridge.js";
import { handleSearchProbe } from "./routes/search.js";
import type { VaultRuntime } from "./routes/vault.js";

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
      // eslint-disable-next-line no-console
      console.warn(
        `[vault] memory pressure: rss=${info.rss} total=${info.total}`
      );
    },
  });

  const workspace = new Workspace(identity.peerId);

  const runtime: VaultRuntime = { store: null, swarm: null, state: null };

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
    const swarm = new SwarmTransport(
      (method, params) => rpcHandler(method, params),
      {
        onPeerConnect: (peerId) => {
          broadcastToClients({
            kind: "peer.connected",
            peer: { peerId, displayName: peerId.slice(0, 8) },
          });
        },
        onPeerDisconnect: (peerId) => {
          broadcastToClients({ kind: "peer.disconnected", peerId });
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
      await workspace.close();
      await pool.unloadAll();
      await provider.stop();
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startVault()
    .then(({ port, peerId }) => {
      // eslint-disable-next-line no-console
      console.log(
        `[vault] sidecar listening on 127.0.0.1:${port} (peerId=${peerId})`
      );
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[vault] failed to start:", err);
      process.exit(1);
    });
}
