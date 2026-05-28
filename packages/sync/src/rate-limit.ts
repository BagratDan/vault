export type RatePolicy = "normal" | "warned" | "paused";

export interface RateLimiterOpts {
  /** Threshold (inclusive) at which we flip to 'warned'. Default: 8. */
  warnedAt?: number;
  /** Threshold (inclusive) at which we flip to 'paused'. Default: 12. */
  pausedAt?: number;
  /** Sliding window length in ms. Default: 10 minutes. */
  windowMs?: number;
}

/**
 * Per-peer sliding-window counter. record(peerId) appends Date.now() to the
 * peer's bucket, drops timestamps outside the window, and classifies the
 * resulting count.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, number[]>();
  private readonly warnedAt: number;
  private readonly pausedAt: number;
  private readonly windowMs: number;

  constructor(opts: RateLimiterOpts = {}) {
    this.warnedAt = opts.warnedAt ?? 8;
    this.pausedAt = opts.pausedAt ?? 12;
    this.windowMs = opts.windowMs ?? 10 * 60 * 1000;
  }

  record(peerId: string): RatePolicy {
    const now = Date.now();
    const horizon = now - this.windowMs;
    const bucket = this.buckets.get(peerId) ?? [];
    const fresh = bucket.filter((t) => t >= horizon);
    fresh.push(now);
    this.buckets.set(peerId, fresh);
    if (fresh.length >= this.pausedAt) return "paused";
    if (fresh.length >= this.warnedAt) return "warned";
    return "normal";
  }
}
