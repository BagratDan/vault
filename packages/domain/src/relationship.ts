import { z } from "zod";
import { baseRecordShape, ulidShape } from "./base.js";

export const relationshipTypeShape = z.enum([
  "mentions",
  "attended-by",
  "located-at",
  "derived-from",
  "duplicate-of",
  "references",
]);
export type RelationshipType = z.infer<typeof relationshipTypeShape>;

export const relationshipShape = baseRecordShape.extend({
  fromId: ulidShape,
  toId: ulidShape,
  type: relationshipTypeShape,
});
export type Relationship = z.infer<typeof relationshipShape>;
