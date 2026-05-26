import { z } from "zod";
import { baseRecordShape, ulidShape } from "./base.js";

export const requestableScopeShape = z.enum(["metadata", "snippet", "file"]);
export type RequestableScope = z.infer<typeof requestableScopeShape>;

export const memoryShape = baseRecordShape.extend({
  summary: z.string(),
  body: z.string(),
  sourceRecordId: ulidShape,
  confidence: z.number().min(0).max(1),
  tags: z.array(z.string()),
  requestableScopes: z.array(requestableScopeShape),
  folderId: ulidShape,
});
export type Memory = z.infer<typeof memoryShape>;
