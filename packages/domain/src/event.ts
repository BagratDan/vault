import { z } from "zod";
import { baseRecordShape, isoShape } from "./base.js";

export const eventShape = baseRecordShape.extend({
  title: z.string().min(1),
  startsAt: isoShape,
  endsAt: isoShape.optional(),
});
export type Event = z.infer<typeof eventShape>;
