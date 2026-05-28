// Browser-driven smoke test: load the web UI and assert that the WS
// handshake succeeds (the page transitions out of "QVAC: error" or
// "loading" into a real surface).
//
// History: a silent setConnState("error") in App.tsx + a synchronous
// send-before-open in ws-client.ts together produced a "QVAC: error"
// page with no console output. This spec is the regression gate.
//
// Runs against the same dev servers the rest of e2e uses (see
// ../playwright.config.ts). Invoke with:
//   pnpm --filter @vault/e2e test:playwright
import { test, expect } from "@playwright/test";

test("page loads to a working state (no QVAC: error)", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  await page.goto("/");

  // The page first shows "QVAC: loading", then transitions to either
  // VaultSetup (no-vault) or the main UI (admin/member). Either is a
  // success; "QVAC: error" is the failure we're guarding against.
  await expect(page.getByText(/QVAC: (ready|loading)/)).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("QVAC: error")).toHaveCount(0);

  // No browser-side errors should be logged during the handshake.
  expect(consoleErrors).toEqual([]);
});
