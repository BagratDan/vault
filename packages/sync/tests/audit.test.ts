import { describe, expect, it, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { AuditLog } from "../src/audit.js";
import { newUlid } from "@vault/domain";

const HEX_64 = "a".repeat(64);
const HEX_64_OTHER = "b".repeat(64);

function fixture(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id: newUlid(),
    createdAt: now,
    updatedAt: now,
    ownerPeerId: HEX_64,
    provenance: { kind: "user" as const },
    requesterPeerId: HEX_64_OTHER,
    resourceId: newUlid(),
    kind: "request" as const,
    ...overrides,
  };
}

describe("AuditLog", () => {
  let dir: string;
  let log: AuditLog;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vault-audit-"));
    log = new AuditLog(dir);
    await log.ready();
  });

  afterEach(async () => {
    await log.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("append + iterate roundtrip", async () => {
    const ev = fixture();
    await log.append(ev);
    const out: unknown[] = [];
    for await (const e of log.list()) out.push(e);
    expect(out).toEqual([ev]);
  });

  it("filters by peerId (matches either requester or owner)", async () => {
    const a = fixture({ requesterPeerId: HEX_64, ownerPeerId: HEX_64_OTHER });
    const b = fixture({ requesterPeerId: HEX_64_OTHER, ownerPeerId: HEX_64 });
    const c = fixture({
      requesterPeerId: "c".repeat(64),
      ownerPeerId: "d".repeat(64),
    });
    await log.append(a);
    await log.append(b);
    await log.append(c);
    const matched: unknown[] = [];
    for await (const e of log.list({ peerId: HEX_64 })) matched.push(e);
    expect(matched).toHaveLength(2);
  });

  it("respects `since` filter (createdAt >= since)", async () => {
    const early = fixture({ createdAt: "2026-01-01T00:00:00.000Z" });
    const late = fixture({ createdAt: "2026-06-01T00:00:00.000Z" });
    await log.append(early);
    await log.append(late);
    const out: unknown[] = [];
    for await (const e of log.list({ since: "2026-03-01T00:00:00.000Z" })) {
      out.push(e);
    }
    expect(out).toEqual([late]);
  });

  it("respects `limit`", async () => {
    for (let i = 0; i < 5; i++) await log.append(fixture());
    const out: unknown[] = [];
    for await (const e of log.list({ limit: 3 })) out.push(e);
    expect(out).toHaveLength(3);
  });
});
