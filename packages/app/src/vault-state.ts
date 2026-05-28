import { z } from "zod";
import type { VaultFs } from "./vault-fs.js";

const HEX_64 = /^[0-9a-f]{64}$/;
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * Local Vault config — read on boot, written on vault create/join.
 * Never synced. Contains the membership role for this peer plus the
 * topic + bootstrap key needed to reconnect to the swarm.
 */
export const vaultStateShape = z.object({
  vaultId: z.string().regex(ULID),
  vaultName: z.string().min(1),
  /** This peer's chosen display name within the Vault. */
  displayName: z.string().min(1),
  topic: z.string().regex(HEX_64),
  bootstrapKey: z.string().regex(HEX_64),
  founderPeerId: z.string().regex(HEX_64),
  founderPublicKey: z.string().regex(HEX_64),
  role: z.enum(["admin", "member"]),
  selfPeerId: z.string().regex(HEX_64),
  createdAt: z.string().regex(ISO),
  /**
   * This peer's "Captures" folder ID — the implicit destination for typed
   * captures. Optional so vault-state.json files written before Plan 4 still
   * parse; activateVault backfills it on next boot.
   */
  capturesFolderId: z.string().regex(ULID).optional(),
});

export type VaultState = z.infer<typeof vaultStateShape>;

const VAULT_STATE_PATH = "data/vault-state.json";

export async function readVaultState(fsApi: VaultFs): Promise<VaultState | null> {
  if (!(await fsApi.exists(VAULT_STATE_PATH))) return null;
  const bytes = await fsApi.readFile(VAULT_STATE_PATH);
  const raw = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  return vaultStateShape.parse(raw);
}

export async function writeVaultState(
  fsApi: VaultFs,
  state: VaultState
): Promise<void> {
  vaultStateShape.parse(state);
  await fsApi.writeFile(
    VAULT_STATE_PATH,
    new TextEncoder().encode(JSON.stringify(state, null, 2))
  );
}
