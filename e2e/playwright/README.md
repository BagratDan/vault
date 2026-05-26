# Playwright UI E2E (stub)

This directory will hold browser-driven specs that exercise the React UI
through Playwright. **Currently empty.**

The headless E2E that proves the backend wiring lives at
[`../tests/e2e1-literal-prompt.spec.ts`](../tests/e2e1-literal-prompt.spec.ts)
and runs under Vitest. It is the canonical Plan 1 E2E.

To add a Playwright spec here in a future plan, name it `*.spec.ts` and
invoke with `pnpm --filter @vault/e2e test:playwright`. The
[`playwright.config.ts`](../playwright.config.ts) already wires up the
sidecar (with the QVAC mock loader) and the Vite dev server as
`webServer` entries.
