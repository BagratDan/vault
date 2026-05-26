import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ConsentState, type PendingEntry } from "../src/consent-state.js";

const sample = (): Omit<PendingEntry, "expiresAt"> => ({
  consentRequestId: "01J0ABCDEFGHJKMNPQRSTV0001",
  requesterPeerId: "a".repeat(64),
  ownerPeerId: "b".repeat(64),
  memoryId: "01J0ABCDEFGHJKMNPQRSTV0002",
  scope: "snippet",
  requesterDisplayName: "Marcus",
  requestedAt: "2026-05-26T10:00:00.000Z",
});

describe("ConsentState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("set + get + has roundtrip", () => {
    const s = new ConsentState();
    const entry = sample();
    s.set(entry);
    expect(s.has(entry.consentRequestId)).toBe(true);
    expect(s.get(entry.consentRequestId)?.requesterDisplayName).toBe("Marcus");
    s.dispose();
  });

  it("delete returns true on first call, false thereafter (double-respond protection)", () => {
    const s = new ConsentState();
    const entry = sample();
    s.set(entry);
    expect(s.delete(entry.consentRequestId)).toBe(true);
    expect(s.delete(entry.consentRequestId)).toBe(false);
    s.dispose();
  });

  it("expiry callback fires once after 5 min + buffer", () => {
    const onExpire = vi.fn();
    const s = new ConsentState({ onExpire, expiryMs: 5 * 60 * 1000 });
    const entry = sample();
    s.set(entry);
    vi.advanceTimersByTime(4 * 60 * 1000);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onExpire).toHaveBeenCalledWith(entry.consentRequestId);
    expect(s.has(entry.consentRequestId)).toBe(false);
    s.dispose();
  });

  it("explicit delete stops the expiry from firing", () => {
    const onExpire = vi.fn();
    const s = new ConsentState({ onExpire, expiryMs: 5 * 60 * 1000 });
    const entry = sample();
    s.set(entry);
    s.delete(entry.consentRequestId);
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(onExpire).not.toHaveBeenCalled();
    s.dispose();
  });

  it("list() returns a snapshot of current entries", () => {
    const s = new ConsentState();
    const a = { ...sample(), consentRequestId: "01J0AAAAAAAAAAAAAAAAAAAAAA" };
    const b = { ...sample(), consentRequestId: "01J0BBBBBBBBBBBBBBBBBBBBBB" };
    s.set(a);
    s.set(b);
    const out = s.list();
    expect(out).toHaveLength(2);
    s.dispose();
  });
});
