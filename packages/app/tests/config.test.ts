import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("uses VAULT_ROOT env if set", () => {
    const cfg = loadConfig({ env: { VAULT_ROOT: "/tmp/v" } });
    expect(cfg.vaultRoot).toBe("/tmp/v");
  });

  it("falls back to ~/.vault if VAULT_ROOT is unset", () => {
    const cfg = loadConfig({ env: {}, home: "/Users/test" });
    expect(cfg.vaultRoot).toBe("/Users/test/.vault");
  });

  it("default WS port is 7421", () => {
    const cfg = loadConfig({ env: {} });
    expect(cfg.wsPort).toBe(7421);
  });

  it("env VAULT_PORT overrides the port", () => {
    const cfg = loadConfig({ env: { VAULT_PORT: "9999" } });
    expect(cfg.wsPort).toBe(9999);
  });

  it("rejects non-numeric VAULT_PORT", () => {
    expect(() => loadConfig({ env: { VAULT_PORT: "abc" } })).toThrow(/numeric/);
  });
});
