import { z } from "zod";
import { baseRecordShape, peerIdShape, ulidShape, isoShape } from "./base.js";

/** A consent request, appended to the Autobee log as `consentReq/<id>` and
 *  replicated to the roster. Carries NO document content — just who wants
 *  what scope on which memory. Self-signed by the requester's autobee writer
 *  key (`requesterPeerId`); apply() binds the signer to that key. */
export const consentRequestRecordShape = baseRecordShape.extend({
  kind: z.literal("consentRequest"),
  requesterPeerId: peerIdShape,
  memoryId: ulidShape,
  scope: z.enum(["metadata", "snippet", "file"]),
  requesterDisplayName: z.string().min(1),
  expiresAt: isoShape,
  sig: z.string(),
});
export type ConsentRequestRecord = z.infer<typeof consentRequestRecordShape>;
