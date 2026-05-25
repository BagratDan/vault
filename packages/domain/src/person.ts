import { z } from "zod";
import { baseRecordShape } from "./base.js";

export const personShape = baseRecordShape.extend({
  displayName: z.string().min(1),
  aliases: z.array(z.string()),
});
export type Person = z.infer<typeof personShape>;
