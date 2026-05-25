import { z } from "zod";
import { baseRecordShape, peerIdShape, isoShape } from "./base.js";

export const memberRoleShape = z.enum(["admin", "member"]);
export type MemberRole = z.infer<typeof memberRoleShape>;

export const memberShape = baseRecordShape.extend({
  peerId: peerIdShape,
  displayName: z.string().min(1),
  role: memberRoleShape,
  admittedBy: peerIdShape,
  admittedAt: isoShape,
});
export type Member = z.infer<typeof memberShape>;
