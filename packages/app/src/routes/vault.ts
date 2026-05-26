import crypto from "node:crypto";
import {
  newUlid,
  serializeInvite,
  parseInvite,
  type InvitePayload,
} from "@vault/domain";
import {
  signCanonical,
  loadRoster,
  openAutobeeStore,
  type OpenedAutobeeStore,
  type SwarmTransport,
  type FolderLocal,
} from "@vault/sync";
import type { VaultFs } from "../vault-fs.js";
import {
  readVaultState,
  writeVaultState,
  type VaultState,
} from "../vault-state.js";

export interface VaultRuntime {
  store: OpenedAutobeeStore | null;
  swarm: SwarmTransport | null;
  state: VaultState | null;
  folderLocal: FolderLocal | null;
  /** Called by routes after vault create/join so start.ts can join the swarm. */
  onActivated?: (state: VaultState) => Promise<void>;
}

export interface VaultDeps {
  fs: VaultFs;
  identity: {
    peerId: string;
    publicKey: Uint8Array;
    privateKey: Uint8Array;
  };
  runtime: VaultRuntime;
}

function expiresInMs(spec: string | undefined): number {
  // Default: 7 days
  if (!spec) return 7 * 24 * 60 * 60 * 1000;
  const m = /^(\d+)([smhd])$/.exec(spec);
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  const unit = m[2] as "s" | "m" | "h" | "d";
  const mult = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return n * mult;
}

export type VaultStatusReply = {
  state: "no-vault" | "admin" | "member";
  vaultId?: string;
  vaultName?: string;
  selfPeerId?: string;
};

export async function vaultStatus(deps: VaultDeps): Promise<VaultStatusReply> {
  if (!deps.runtime.state) {
    const persisted = await readVaultState(deps.fs);
    if (!persisted) return { state: "no-vault" };
    deps.runtime.state = persisted;
  }
  const s = deps.runtime.state;
  return {
    state: s.role,
    vaultId: s.vaultId,
    vaultName: s.vaultName,
    selfPeerId: s.selfPeerId,
  };
}

export async function vaultCreate(
  deps: VaultDeps,
  input: { displayName: string }
): Promise<{ vaultId: string; peerId: string }> {
  if (deps.runtime.state) {
    throw new Error("vault already exists for this peer");
  }
  const vaultId = newUlid();
  const topic = crypto.randomBytes(32).toString("hex");
  const store = await openAutobeeStore({
    rootDir: deps.fs.path("data"),
    role: "admin",
  });
  const founderPeerId = store.localPeerId;
  const founderPublicKey = store.founderPeerId;
  const state: VaultState = {
    vaultId,
    vaultName: input.displayName,
    displayName: input.displayName,
    topic,
    bootstrapKey: store.bootstrapKey,
    founderPeerId,
    founderPublicKey,
    role: "admin",
    selfPeerId: founderPeerId,
    createdAt: new Date().toISOString(),
  };
  await writeVaultState(deps.fs, state);
  // Write founder Member record signed by the store's local secret key
  const founderMember = {
    id: newUlid(),
    createdAt: state.createdAt,
    updatedAt: state.createdAt,
    ownerPeerId: founderPeerId,
    provenance: { kind: "user" as const },
    kind: "member" as const,
    peerId: founderPeerId,
    displayName: input.displayName,
    role: "admin" as const,
    admittedBy: founderPeerId,
    admittedAt: state.createdAt,
    publicKey: founderPublicKey,
  };
  await store.append({
    kind: "member",
    key: `member/${founderPeerId}`,
    value: {
      ...founderMember,
      sig: signCanonical(founderMember, store.secretKey),
    },
  });
  await store.flush();
  deps.runtime.store = store;
  deps.runtime.state = state;
  if (deps.runtime.onActivated) await deps.runtime.onActivated(state);
  return { vaultId, peerId: founderPeerId };
}

export async function vaultInviteCreate(
  deps: VaultDeps,
  input: { placeholderDisplayName?: string; expiresIn?: string }
): Promise<{ token: string; expiresAt: string }> {
  if (!deps.runtime.state || deps.runtime.state.role !== "admin") {
    throw new Error("only an admin can issue invites");
  }
  if (!deps.runtime.store) throw new Error("store not open");
  const s = deps.runtime.state;
  const expiresAt = new Date(Date.now() + expiresInMs(input.expiresIn)).toISOString();
  const payload: InvitePayload = {
    v: 1,
    vaultId: s.vaultId,
    vaultName: s.vaultName,
    topic: s.topic,
    bootstrapKey: s.bootstrapKey,
    founderPeerId: s.founderPeerId,
    founderPublicKey: s.founderPublicKey,
    ...(input.placeholderDisplayName
      ? { placeholderDisplayName: input.placeholderDisplayName }
      : {}),
    expiresAt,
  };
  const token = serializeInvite(payload, deps.runtime.store.secretKey);
  return { token, expiresAt };
}

export async function vaultInviteAccept(
  deps: VaultDeps,
  input: { token: string; displayName: string }
): Promise<{ vaultId: string; peerId: string }> {
  if (deps.runtime.state) {
    throw new Error("this peer is already part of a vault");
  }
  const parsed = parseInvite(input.token);
  if (!parsed.ok) {
    throw new Error(`invite invalid: ${parsed.reason}`);
  }
  const p = parsed.payload;
  const store = await openAutobeeStore({
    rootDir: deps.fs.path("data"),
    founderPeerId: p.founderPeerId,
    role: "member",
    bootstrapKey: p.bootstrapKey,
  });
  const selfPeerId = store.localPeerId;
  const state: VaultState = {
    vaultId: p.vaultId,
    vaultName: p.vaultName,
    displayName: input.displayName,
    topic: p.topic,
    bootstrapKey: p.bootstrapKey,
    founderPeerId: p.founderPeerId,
    founderPublicKey: p.founderPublicKey,
    role: "member",
    selfPeerId,
    createdAt: new Date().toISOString(),
  };
  await writeVaultState(deps.fs, state);
  deps.runtime.store = store;
  deps.runtime.state = state;
  if (deps.runtime.onActivated) await deps.runtime.onActivated(state);
  return { vaultId: p.vaultId, peerId: selfPeerId };
}

export type PeerListReply = {
  peers: Array<{ peerId: string; displayName: string; role: "admin" | "member" }>;
};

export async function peerList(deps: VaultDeps): Promise<PeerListReply> {
  if (!deps.runtime.store) return { peers: [] };
  const roster = await loadRoster(deps.runtime.store.view);
  return {
    peers: [...roster.values()].map((m) => ({
      peerId: m.peerId,
      displayName: m.displayName,
      role: m.role,
    })),
  };
}
