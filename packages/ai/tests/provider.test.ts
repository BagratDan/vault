import { describe, expect, it, beforeEach, vi } from "vitest";
import { Provider } from "../src/provider.js";

// Mock @qvac/sdk so this is a unit test, not an integration.
vi.mock("@qvac/sdk", () => ({
  startQVACProvider: vi.fn().mockResolvedValue(undefined),
  stopQVACProvider: vi.fn().mockResolvedValue(undefined),
  state: vi.fn().mockResolvedValue({ lifecycle: "running" }),
  heartbeat: vi.fn().mockResolvedValue(undefined),
}));

import { startQVACProvider, stopQVACProvider, state } from "@qvac/sdk";

describe("Provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("start() calls startQVACProvider exactly once across concurrent calls", async () => {
    const p = new Provider();
    await Promise.all([p.start(), p.start(), p.start()]);
    expect(startQVACProvider).toHaveBeenCalledTimes(1);
  });

  it("stop() calls stopQVACProvider exactly once and is idempotent", async () => {
    const p = new Provider();
    await p.start();
    await p.stop();
    await p.stop();
    expect(stopQVACProvider).toHaveBeenCalledTimes(1);
  });

  it("state() returns the SDK state", async () => {
    const p = new Provider();
    await p.start();
    const s = await p.state();
    expect(s).toEqual({ lifecycle: "running" });
    expect(state).toHaveBeenCalled();
  });

  it("calling state() before start() throws a typed error", async () => {
    const p = new Provider();
    await expect(p.state()).rejects.toThrow(/not started/);
  });
});
