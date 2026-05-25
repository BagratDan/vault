import { z } from "zod";
import { baseRecordShape, peerIdShape, ulidShape } from "./base.js";

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
  requesterPeerId: peerIdShape,
  ownerPeerId: peerIdShape,
  resourceId: ulidShape,
  kind: consentEventKindShape,
  payloadHash: z.string().regex(/^sha256:[0-9a-f]{64}$/).optional(),
  byteCount: z.number().int().nonnegative().optional(),
  ratePolicy: z.enum(["normal", "warned", "paused"]).optional(),
});
export type ConsentEvent = z.infer<typeof consentEventShape>;
