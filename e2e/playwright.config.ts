// Playwright config for a UI-level E2E that drives the browser through
// the literal-prompt flow. Not run by `pnpm test` — invoke explicitly
// with `pnpm --filter @vault/e2e test:playwright`.
//
// The headless E2E that proves backend wiring lives at
// tests/e2e1-literal-prompt.spec.ts and runs under vitest.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./playwright",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "tsx --import=../packages/app/tests/qvac-mock/register.js ../packages/app/src/index.ts",
      url: "http://127.0.0.1:7421/healthz",
      timeout: 30_000,
      reuseExistingServer: !process.env["CI"],
      env: {
        VAULT_QVAC_MOCK: "1",
        VAULT_ROOT: process.env["VAULT_ROOT"] ?? "/tmp/vault-playwright",
        VAULT_PORT: "7421",
      },
    },
    {
      command: "pnpm --filter @vault/web dev",
      url: "http://127.0.0.1:5173",
      timeout: 30_000,
      reuseExistingServer: !process.env["CI"],
    },
  ],
});
