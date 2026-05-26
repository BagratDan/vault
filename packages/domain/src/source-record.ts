import { z } from "zod";
import { baseRecordShape, isoShape } from "./base.js";
import { transcriptShape } from "./transcript.js";

const textVariant = baseRecordShape.extend({
  kind: z.literal("text"),
  body: z.string(),
});

const audioVariant = baseRecordShape.extend({
  kind: z.literal("audio"),
  audioRef: z.string(),
  transcript: transcriptShape.optional(),
});

const fileVariant = baseRecordShape.extend({
  kind: z.literal("file"),
  path: z.string().min(1),
  hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  size: z.number().int().nonnegative(),
  mime: z.string().min(1),
  lastModified: isoShape,
});

export const sourceRecordShape = z.discriminatedUnion("kind", [
  textVariant,
  audioVariant,
  fileVariant,
]);
export type SourceRecord = z.infer<typeof sourceRecordShape>;
