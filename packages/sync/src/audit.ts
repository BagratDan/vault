import Hypercore from "hypercore";
import { consentEventShape, type ConsentEvent } from "@vault/domain";

export interface AuditListOpts {
  peerId?: string;
  since?: string;
  limit?: number;
}

export class AuditLog {
  private core: Hypercore;

  constructor(rootDir: string) {
    this.core = new Hypercore(rootDir, { valueEncoding: "json" });
  }

  async ready(): Promise<void> {
    await this.core.ready();
  }

  async append(event: ConsentEvent): Promise<void> {
    consentEventShape.parse(event);
    await this.core.append(event);
  }

  async *list(opts: AuditListOpts = {}): AsyncIterable<ConsentEvent> {
    await this.core.ready();
    let emitted = 0;
    for (let i = 0; i < this.core.length; i++) {
      const ev = (await this.core.get(i)) as ConsentEvent;
      if (opts.peerId) {
        if (
          ev.requesterPeerId !== opts.peerId &&
          ev.ownerPeerId !== opts.peerId
        ) {
          continue;
        }
      }
      if (opts.since && ev.createdAt < opts.since) continue;
      yield ev;
      emitted++;
      if (opts.limit && emitted >= opts.limit) return;
    }
  }

  async close(): Promise<void> {
    await this.core.close();
  }
}
