// packages/ai/src/provider.ts
import {
  startQVACProvider,
  stopQVACProvider,
  state as sdkState,
} from "@qvac/sdk";

type ProviderState = "idle" | "starting" | "running" | "stopping" | "stopped";

export class Provider {
  private status: ProviderState = "idle";
  private startPromise: Promise<void> | null = null;
  private stopPromise: Promise<void> | null = null;

  async start(): Promise<void> {
    if (this.status === "running") return;
    if (this.startPromise) return this.startPromise;
    this.status = "starting";
    this.startPromise = (async () => {
      try {
        await startQVACProvider();
        this.status = "running";
      } catch (err) {
        this.status = "idle";
        this.startPromise = null;
        throw err;
      }
    })();
    return this.startPromise;
  }

  async stop(): Promise<void> {
    if (this.status === "stopped" || this.status === "idle") return;
    if (this.stopPromise) return this.stopPromise;
    this.status = "stopping";
    this.stopPromise = (async () => {
      try {
        await stopQVACProvider();
      } finally {
        this.status = "stopped";
        this.startPromise = null;
      }
    })();
    return this.stopPromise;
  }

  async state(): Promise<unknown> {
    if (this.status !== "running") {
      throw new Error(`Provider not started (status=${this.status})`);
    }
    return sdkState();
  }

  getStatus(): ProviderState {
    return this.status;
  }
}
