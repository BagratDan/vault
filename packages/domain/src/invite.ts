import { z } from "zod";
import { baseRecordShape, peerIdShape, ulidShape, isoShape } from "./base.js";

const sigShape = z.string().length(128); // Ed25519 sig (hex or base64url)
export { sigShape };

export const inviteShape = baseRecordShape.extend({
  vaultId: ulidShape,
  issuedBy: peerIdShape,
  expiresAt: isoShape,
  placeholderDisplayName: z.string().optional(),
  sig: sigShape,
});
export type Invite = z.infer<typeof inviteShape>;
