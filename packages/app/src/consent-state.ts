import type { Scope } from "@vault/sync";

export interface PendingEntry {
  consentRequestId: string;
  requesterPeerId: string;
  ownerPeerId: string;
  memoryId: string;
  scope: Scope;
  requesterDisplayName: string;
  requestedAt: string;
  expiresAt: number;
}

export interface ConsentStateOpts {
  onExpire?: (consentRequestId: string) => void;
  expiryMs?: number;
  tickMs?: number;
}

export class ConsentState {
  private readonly entries = new Map<string, PendingEntry>();
  private readonly expiryMs: number;
  private readonly onExpire?: (id: string) => void;
  private readonly tickHandle: ReturnType<typeof setInterval>;

  constructor(opts: ConsentStateOpts = {}) {
    this.expiryMs = opts.expiryMs ?? 5 * 60 * 1000;
    if (opts.onExpire) this.onExpire = opts.onExpire;
    this.tickHandle = setInterval(() => this.tick(), opts.tickMs ?? 1000);
  }

  set(input: Omit<PendingEntry, "expiresAt">): void {
    this.entries.set(input.consentRequestId, {
      ...input,
      expiresAt: Date.now() + this.expiryMs,
    });
  }

  get(id: string): PendingEntry | undefined {
    return this.entries.get(id);
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  delete(id: string): boolean {
    return this.entries.delete(id);
  }

  list(): readonly PendingEntry[] {
    return [...this.entries.values()];
  }

  private tick(): void {
    const now = Date.now();
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(id);
        this.onExpire?.(id);
      }
    }
  }

  dispose(): void {
    clearInterval(this.tickHandle);
    this.entries.clear();
  }
}
