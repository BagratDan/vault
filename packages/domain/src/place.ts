import { z } from "zod";
import { baseRecordShape } from "./base.js";

export const placeShape = baseRecordShape.extend({
  name: z.string().min(1),
  geo: z.object({ lat: z.number(), lon: z.number() }).optional(),
});
export type Place = z.infer<typeof placeShape>;
