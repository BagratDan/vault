import { z } from "zod";
import { baseRecordShape } from "./base.js";
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
  path: z.string(),
  mime: z.string(),
  hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
});

export const sourceRecordShape = z.discriminatedUnion("kind", [
  textVariant,
  audioVariant,
  fileVariant,
]);
export type SourceRecord = z.infer<typeof sourceRecordShape>;
