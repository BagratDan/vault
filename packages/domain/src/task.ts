import { z } from "zod";
import { baseRecordShape, isoShape } from "./base.js";

export const taskStatusShape = z.enum(["open", "done", "cancelled"]);
export type TaskStatus = z.infer<typeof taskStatusShape>;

export const taskShape = baseRecordShape.extend({
  title: z.string().min(1),
  dueAt: isoShape.optional(),
  status: taskStatusShape,
});
export type Task = z.infer<typeof taskShape>;
