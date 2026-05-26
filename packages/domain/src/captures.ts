import { newUlid, type Ulid } from "./ids.js";

/**
 * Each peer has exactly one "Captures" folder — the implicit destination
 * for memories created via the Capture textarea (no file behind them).
 * The folder's ID is generated once at vault create/join and persisted in
 * VaultState. Existing memories (pre-Plan-4) read with folderId substituted
 * from this value via the migration in Repo.
 */
export function newCapturesFolderId(): Ulid {
  return newUlid();
}

export const CAPTURES_DISPLAY_NAME = "Captures";
