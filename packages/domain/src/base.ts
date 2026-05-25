import { z } from "zod";

const HEX_64 = /^[0-9a-f]{64}$/;
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const ulidShape = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const peerIdShape = z.string().regex(HEX_64);
const isoShape = z.string().regex(ISO_8601);

export const provenanceShape = z.object({
  kind: z.enum(["user", "audio-import", "file-import", "extraction", "sync"]),
  note: z.string().optional(),
  sourceRecordId: ulidShape.optional(),
});
export type Provenance = z.infer<typeof provenanceShape>;

export const baseRecordShape = z.object({
  id: ulidShape,
  createdAt: isoShape,
  updatedAt: isoShape,
  deletedAt: isoShape.optional(),
  ownerPeerId: peerIdShape,
  provenance: provenanceShape,
});
export type BaseRecord = z.infer<typeof baseRecordShape>;

// Re-export shared shapes for downstream packages composing record types
export { ulidShape, peerIdShape, isoShape };
