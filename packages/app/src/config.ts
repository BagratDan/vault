import os from "node:os";
import path from "node:path";

export interface VaultConfig {
  readonly vaultRoot: string;
  readonly wsPort: number;
  readonly wsHost: string;
}

export interface LoadConfigInput {
  env: Record<string, string | undefined>;
  home?: string;
}

export function loadConfig(input: LoadConfigInput): VaultConfig {
  const home = input.home ?? os.homedir();
  const vaultRoot = input.env["VAULT_ROOT"]
    ? path.resolve(input.env["VAULT_ROOT"])
    : path.join(home, ".vault");

  const portStr = input.env["VAULT_PORT"];
  let wsPort = 7421;
  if (portStr !== undefined) {
    const n = Number(portStr);
    if (!Number.isInteger(n) || n < 0 || n >= 65536) {
      throw new Error(`VAULT_PORT must be a numeric integer 0..65535, got "${portStr}"`);
    }
    wsPort = n;
  }
  const wsHost = input.env["VAULT_HOST"] ?? "127.0.0.1";
  return { vaultRoot, wsPort, wsHost };
}
