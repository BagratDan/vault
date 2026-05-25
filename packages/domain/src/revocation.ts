import { z } from "zod";
import { baseRecordShape, ulidShape, isoShape } from "./base.js";
import { sigShape } from "./invite.js";

const govPeerIdShape = z.string().length(64); // public key identifier (64-char)

export const revocationShape = baseRecordShape.extend({
  vaultId: ulidShape,
  targetPeerId: govPeerIdShape,
  issuedBy: govPeerIdShape,
  reason: z.string().optional(),
  effectiveAt: isoShape,
  sig: sigShape,
});
export type Revocation = z.infer<typeof revocationShape>;
