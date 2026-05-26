import { z } from "zod";
import { baseRecordShape } from "./base.js";

export const folderVisibilityShape = z.enum(["public", "private"]);
export type FolderVisibility = z.infer<typeof folderVisibilityShape>;

/**
 * Full folder record — stored in the owner's local Hyperbee. Carries the
 * absolute `path` on the owner's disk, so it MUST NOT be replicated.
 */
export const folderShape = baseRecordShape.extend({
  kind: z.literal("folder"),
  path: z.string().min(1),
  displayName: z.string().min(1),
  visibility: folderVisibilityShape,
});
export type Folder = z.infer<typeof folderShape>;

/**
 * Public subset — written to Autobee so peers can see the folder exists,
 * who owns it, its display name, and whether it's visible. `path` is
 * explicitly omitted. Signed by the owner's autobee writer key, same
 * pattern as Member / Revocation.
 */
export const folderPublicShape = baseRecordShape.extend({
  kind: z.literal("folder"),
  displayName: z.string().min(1),
  visibility: folderVisibilityShape,
  sig: z.string(),
});
export type FolderPublic = z.infer<typeof folderPublicShape>;
