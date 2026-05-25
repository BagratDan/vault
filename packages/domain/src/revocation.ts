import { z } from "zod";
import { baseRecordShape, peerIdShape, ulidShape, isoShape } from "./base.js";
import { sigShape } from "./invite.js";

export const revocationShape = baseRecordShape.extend({
  vaultId: ulidShape,
  targetPeerId: peerIdShape,
  issuedBy: peerIdShape,
  reason: z.string().optional(),
  effectiveAt: isoShape,
  sig: sigShape,
});
export type Revocation = z.infer<typeof revocationShape>;
