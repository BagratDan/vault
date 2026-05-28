// Browser-driven E2E: add a folder of text files from disk, watch ingest,
// then search inside the folder. Exercises the full Plan 4 path —
// folder.add → scanFolder → parse → embed → index → folder.list →
// FolderView → folder-scoped search.run → search.hits.
//
// Requires a live sidecar + Vite (the playwright.config.ts webServer
// entries bring them up). Fixtures are created under $HOME so the
// sidecar's resolveSafeAbsolute accepts them, and cleaned up after.
//
// Invoke with: pnpm --filter @vault/e2e test:playwright
import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("add a folder with two text files, then search inside it", async ({ page }) => {
  const fixtureDir = await fs.mkdtemp(path.join(os.homedir(), ".vault-test-folder-"));
  await fs.writeFile(
    path.join(fixtureDir, "msa.md"),
    "# Acme MSA 2025\n\nIndemnification clause: each party indemnifies the other against confidentiality breaches."
  );
  await fs.writeFile(
    path.join(fixtureDir, "notes.txt"),
    "Sarah promised the migration by Friday."
  );

  try {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Home shows the folder list + Add folder button.
    await page.getByRole("button", { name: /Add folder/ }).click();
    await page.getByPlaceholder(/Users\/sarah/).fill(fixtureDir);
    // displayName auto-fills from the basename; set it explicitly.
    const nameInput = page.getByPlaceholder("Acme MSA");
    await nameInput.fill("E2E Fixture");
    await page.getByLabel(/Public/).check();
    await page.getByRole("button", { name: /^Add folder$/ }).click();

    // The folder appears in the list once ingest reports back.
    await expect(page.getByText("E2E Fixture")).toBeVisible({ timeout: 90_000 });

    // Enter the folder.
    await page.getByText("E2E Fixture").click();
    await expect(page.getByText(/Library/i)).toBeVisible({ timeout: 10_000 });

    // Search inside the folder.
    const search = page.getByPlaceholder("Ask anything…");
    await search.fill("migration");
    await search.press("Enter");

    // A result mentioning the indexed content appears.
    await expect(
      page.getByText(/Sarah|migration|Friday/i).first()
    ).toBeVisible({ timeout: 60_000 });
  } finally {
    await fs.rm(fixtureDir, { recursive: true, force: true });
  }
});
