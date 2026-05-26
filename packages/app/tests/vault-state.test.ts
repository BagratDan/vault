import { describe, expect, it, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { VaultFs } from "../src/vault-fs.js";
import {
  readVaultState,
  writeVaultState,
  type VaultState,
} from "../src/vault-state.js";

describe("VaultState", () => {
  let root: string;
  let fsApi: VaultFs;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-state-"));
    fsApi = new VaultFs(root);
    await fsApi.ensureDir("data");
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("returns null when state file is absent", async () => {
    expect(await readVaultState(fsApi)).toBeNull();
  });

  it("writes then reads back the same VaultState", async () => {
    const state: VaultState = {
      vaultId: "01J0ABCDEFGHJKMNPQRSTV0001",
      vaultName: "Acme Legal",
      displayName: "Sarah",
      topic: "a".repeat(64),
      bootstrapKey: "b".repeat(64),
      founderPeerId: "c".repeat(64),
      founderPublicKey: "c".repeat(64),
      role: "admin",
      selfPeerId: "c".repeat(64),
      createdAt: "2026-05-26T10:00:00.000Z",
    };
    await writeVaultState(fsApi, state);
    const got = await readVaultState(fsApi);
    expect(got).toEqual(state);
  });

  it("rejects malformed JSON", async () => {
    await fsApi.writeFile(
      "data/vault-state.json",
      new TextEncoder().encode("{ not json")
    );
    await expect(readVaultState(fsApi)).rejects.toThrow(/parse|JSON/i);
  });

  it("rejects state with invalid fields", async () => {
    const bad = {
      vaultId: "not-a-ulid",
      vaultName: "x",
      displayName: "x",
      topic: "a".repeat(64),
      bootstrapKey: "b".repeat(64),
      founderPeerId: "c".repeat(64),
      founderPublicKey: "c".repeat(64),
      role: "admin",
      selfPeerId: "c".repeat(64),
      createdAt: "2026-05-26T10:00:00.000Z",
    };
    await fsApi.writeFile(
      "data/vault-state.json",
      new TextEncoder().encode(JSON.stringify(bad))
    );
    await expect(readVaultState(fsApi)).rejects.toThrow();
  });
});
