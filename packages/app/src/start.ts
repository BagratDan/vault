import path from "node:path";
import { createSidecarServer } from "@vault/net";
import { Provider, ModelPool } from "@vault/ai";
import { Repo, Indexes, openStore } from "@vault/sync";
import { Workspace } from "@vault/retrieval";
import { loadConfig } from "./config.js";
import { VaultFs } from "./vault-fs.js";
import { loadOrCreateIdentity } from "./identity.js";
import { makeRouter } from "./ws-bridge.js";

export interface VaultHandle {
  port: number;
  peerId: string;
  close: () => Promise<void>;
}

export async function startVault(): Promise<VaultHandle> {
  const cfg = loadConfig({ env: process.env });
  const fsApi = new VaultFs(cfg.vaultRoot);
  await fsApi.ensureDir("data");

  const identity = await loadOrCreateIdentity(fsApi);

  const opened = await openStore(path.join(cfg.vaultRoot, "data"));
  const repo = new Repo(opened.bee);
  const indexes = new Indexes(opened.bee);

  const workspace = new Workspace(identity.peerId);
  const provider = new Provider();
  await provider.start();
  const pool = new ModelPool({
    memoryPressureFloor: 0.6,
    onMemoryPressure: (info) => {
      // eslint-disable-next-line no-console
      console.warn(`[vault] memory pressure: rss=${info.rss} total=${info.total}`);
    },
  });

  const router = makeRouter({
    pool,
    repo,
    indexes,
    workspace,
    ownerPeerId: identity.peerId,
  });

  const server = await createSidecarServer({
    port: cfg.wsPort,
    host: cfg.wsHost,
    onMessage: async (msg, conn) => router(msg, conn),
  });

  return {
    port: server.port,
    peerId: identity.peerId,
    close: async () => {
      await server.close();
      await pool.unloadAll();
      await provider.stop();
      await workspace.close();
      await opened.close();
    },
  };
}
