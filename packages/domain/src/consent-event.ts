import { z } from "zod";
import { baseRecordShape, ulidShape } from "./base.js";

const govPeerIdShape = z.string().length(64); // public key identifier (64-char)

export const consentEventKindShape = z.enum([
  "request",
  "approve-metadata",
  "approve-snippet",
  "approve-file",
  "deny",
  "expire",
]);
export type ConsentEventKind = z.infer<typeof consentEventKindShape>;

export const consentEventShape = baseRecordShape.extend({
  requesterPeerId: govPeerIdShape,
  ownerPeerId: govPeerIdShape,
  resourceId: ulidShape,
  kind: consentEventKindShape,
  payloadHash: z.string().regex(/^sha256:.{64}$/).optional(),
  byteCount: z.number().int().nonnegative().optional(),
  ratePolicy: z.enum(["normal", "warned", "paused"]).optional(),
});
export type ConsentEvent = z.infer<typeof consentEventShape>;
