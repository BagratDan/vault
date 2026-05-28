import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "../src/rate-limit.js";

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-05-26T10:00:00.000Z") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits 'normal' under the warned threshold", () => {
    const r = new RateLimiter({ warnedAt: 3, pausedAt: 5, windowMs: 60_000 });
    expect(r.record("peer-a")).toBe("normal");
    expect(r.record("peer-a")).toBe("normal");
  });

  it("emits 'warned' when count reaches warned threshold", () => {
    const r = new RateLimiter({ warnedAt: 3, pausedAt: 5, windowMs: 60_000 });
    r.record("peer-a");
    r.record("peer-a");
    expect(r.record("peer-a")).toBe("warned");
  });

  it("emits 'paused' when count reaches paused threshold", () => {
    const r = new RateLimiter({ warnedAt: 3, pausedAt: 5, windowMs: 60_000 });
    for (let i = 0; i < 4; i++) r.record("peer-a");
    expect(r.record("peer-a")).toBe("paused");
  });

  it("forgets old entries past the window", () => {
    const r = new RateLimiter({ warnedAt: 3, pausedAt: 5, windowMs: 60_000 });
    r.record("peer-a");
    r.record("peer-a");
    r.record("peer-a"); // warned
    vi.advanceTimersByTime(120_000); // 2 min — fully past window
    expect(r.record("peer-a")).toBe("normal");
  });

  it("is scoped per peer", () => {
    const r = new RateLimiter({ warnedAt: 2, pausedAt: 5, windowMs: 60_000 });
    r.record("peer-a");
    r.record("peer-a");
    expect(r.record("peer-b")).toBe("normal");
  });
});
