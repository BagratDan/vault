import { z } from "zod";

const ULID_RX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export const scopeShape = z.enum(["metadata", "snippet", "file"]);
export type Scope = z.infer<typeof scopeShape>;

export const consentRequestShape = z.object({
  v: z.literal(1),
  method: z.literal("consent.request"),
  consentRequestId: z.string().regex(ULID_RX),
  memoryId: z.string().regex(ULID_RX),
  scope: scopeShape,
  requesterDisplayName: z.string().min(1),
  ts: z.string(),
});
export type ConsentRequest = z.infer<typeof consentRequestShape>;

const approveReply = z.object({
  v: z.literal(1),
  method: z.literal("consent.response"),
  consentRequestId: z.string().regex(ULID_RX),
  kind: z.literal("approve"),
  scope: scopeShape,
  payload: z.unknown(),
});

const denyReply = z.object({
  v: z.literal(1),
  method: z.literal("consent.response"),
  consentRequestId: z.string().regex(ULID_RX),
  kind: z.literal("deny"),
  reason: z.string().optional(),
});

const expireReply = z.object({
  v: z.literal(1),
  method: z.literal("consent.response"),
  consentRequestId: z.string().regex(ULID_RX),
  kind: z.literal("expire"),
});

export const consentResponseShape = z.discriminatedUnion("kind", [
  approveReply,
  denyReply,
  expireReply,
]);
export type ConsentResponse = z.infer<typeof consentResponseShape>;

const SCOPE_ORDER: readonly Scope[] = ["metadata", "snippet", "file"];

export function isScopeAllowed(
  requestableScopes: readonly Scope[],
  requested: Scope
): boolean {
  if (requestableScopes.length === 0) return false;
  const maxIdx = requestableScopes.reduce(
    (m, s) => Math.max(m, SCOPE_ORDER.indexOf(s)),
    -1
  );
  return SCOPE_ORDER.indexOf(requested) <= maxIdx;
}
