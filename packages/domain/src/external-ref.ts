import { z } from "zod";
import { baseRecordShape } from "./base.js";

export const externalRefSystemShape = z.enum(["jira", "github", "linear", "url"]);

export const externalRefShape = baseRecordShape.extend({
  system: externalRefSystemShape,
  externalId: z.string().min(1),
  url: z.string().url().optional(),
});
export type ExternalRef = z.infer<typeof externalRefShape>;
