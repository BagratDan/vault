# Threat model

This document covers the trust posture, threat model, and residual risks of Vault as shipped in v1 (Plan 1 — Foundation). Required reading for any IT director or security-conscious user evaluating whether to install Vault on a managed laptop.

Companion docs: [README.md](README.md), [MODEL_TRADEOFFS.md](MODEL_TRADEOFFS.md), [docs/superpowers/specs/2026-05-25-vault-design.md § 10 + § 16](docs/superpowers/specs/2026-05-25-vault-design.md).

## What Vault is trying to be true to

Vault's product promise is **consent at the moment the question is asked**. Documents do not leave the machine they live on unless the owner explicitly, in real time, says yes. The trust posture below exists to make that promise verifiable, not just stated.

For Plan 1 (single-node), the practical concerns are narrower than the full multi-peer story. The full posture spec covers what Plan 1 *defers* to Plan 2/3 and what's already enforced in code.

## Adversary model

We design against three classes of adversary:

1. **Remote network attackers** — anyone not on the user's host. Defended against by binding only to numeric loopback (`127.0.0.1`, `::1`). No code path exposes Vault to the wider network.
2. **Same-host adversaries** — other processes or browser tabs on the user's machine. Defended against by per-launch WebSocket auth token + origin gate; OS file permissions on the identity key + token file.
3. **Compromised user accounts on the same machine** — another OS user. Partially defended by 0600 file permissions on identity + token. Full defense requires OS keychain (documented as vNext).

Adversaries we explicitly do **not** defend against:

- **Root on the user's machine.** If root is compromised, all bets are off — same as every desktop app.
- **The user themselves choosing to share.** Vault gates content release behind consent. If the user clicks "Share," content goes out. That's the product.
- **A compromised dependency in `@qvac/sdk` or the `bare-*` ecosystem.** Native bindings could in principle do anything. Mitigation is supply-chain hygiene (`pnpm-lock.yaml`, `npm ci --ignore-scripts` for production builds), not runtime defense.

## Trust posture (what's enforced today)

### Layer 1 — Network discipline (enforced)

**Claim:** Vault only ever opens sockets via `packages/net/`. No other package can import network primitives.

**Enforcement:**

- Custom ESLint rule at [tools/eslint-rules/no-network-imports-outside-net.js](tools/eslint-rules/no-network-imports-outside-net.js).
- Rule covers `node:net`, `node:http`, `node:https`, `node:tls`, `node:dgram`, `http`, `https`, `net`, `tls`, `dgram`, `node-fetch`, `undici`, `axios`, `got`.
- Rule applies to `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs` files under `packages/` and `e2e/`.
- Rule has its own unit tests at [tools/eslint-rules/tests/no-network-imports-outside-net.test.js](tools/eslint-rules/tests/no-network-imports-outside-net.test.js).
- CI / `pnpm lint` fails on violation.

**How to verify:** `grep -rE "(node:http|node:net|node-fetch|undici|axios|got)" packages/ e2e/ --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' | grep -v packages/net/` — should return only false positives (variable names).

### Layer 2 — Loopback-only sidecar (enforced)

**Claim:** The Vault sidecar refuses to bind any address that isn't numeric loopback.

**Enforcement:**

- [`packages/net/src/http-server.ts`](packages/net/src/http-server.ts) maintains `ALLOWED_HOSTS = new Set(["127.0.0.1", "::1"])`.
- `"localhost"` is **not** on the allowlist — it depends on `/etc/hosts` and DNS, both subvertible.
- Tests cover both rejection paths: `0.0.0.0` and `localhost` both throw at bind time.

**How to verify:** [`packages/net/tests/http-server.test.ts`](packages/net/tests/http-server.test.ts) tests pass.

### Layer 3 — WebSocket auth (enforced)

**Claim:** No process on the user's machine — including other browser tabs they visit — can talk to the Vault sidecar without holding the per-launch auth token.

**Enforcement:**

- Sidecar generates a fresh `crypto.randomBytes(32).toString("hex")` token at start, persists it at `$VAULT_ROOT/.ws-token` with file mode 0600.
- WebSocket upgrade requires either a `?token=...` query parameter or an `x-vault-token` header matching the launch token.
- WebSocket upgrade also requires the `Origin` header — if present — to match the configured allowlist (defaults to `http://127.0.0.1:5173` for the Vite dev server). Browser tabs always send `Origin`; native clients like the test harness's `ws` library typically don't.
- Token served via `GET /token` is origin-gated. The web UI fetches it once on mount, then opens the authenticated WebSocket.
- Tests cover: rejected without token, rejected with wrong Origin, accepted with correct token.

**How to verify:** [`packages/net/tests/http-server.test.ts`](packages/net/tests/http-server.test.ts) covers all three cases.

### Layer 4 — Filesystem least privilege (enforced)

**Claim:** Vault only reads/writes inside `$VAULT_ROOT` and the Node modules cache. Symlinks cannot trick it into escaping.

**Enforcement:**

- All filesystem access in `@vault/app` routes through [`packages/app/src/vault-fs.ts`](packages/app/src/vault-fs.ts).
- `resolveSafe` checks both:
  1. The string-resolved path doesn't escape `VAULT_ROOT` via `..` segments.
  2. The `realpath` of the deepest existing ancestor still resolves under `realpath(VAULT_ROOT)` — refuses any symlink-based escape.
- Files are written with mode `0o600`; directories with mode `0o700`.
- Tests cover: traversal via `..`, absolute-path escape, parent-directory auto-creation.

**Defense in depth (documented, not enforced today):** Node's experimental `--permission` flag. Running the sidecar as:

```bash
node --permission \
  --allow-fs-read=$HOME/.vault \
  --allow-fs-write=$HOME/.vault \
  --allow-fs-read=$(pnpm root) \
  --allow-net=<dht hosts> \
  packages/app/dist/index.js
```

…lets the Node runtime *itself* reject filesystem and network access outside the allowlist, regardless of what app code attempts. The user can verify the flags in their process list.

### Layer 5 — Identity (enforced for v1)

**Claim:** Vault's Ed25519 private key never crosses the network. The key file is 0600.

**Enforcement:**

- `crypto.generateKeyPairSync("ed25519")` on first launch; key stored at `$VAULT_ROOT/identity/keypair.json`, mode 0600.
- Searching the codebase for `privateKey` shows it only in [`packages/app/src/identity.ts`](packages/app/src/identity.ts). `start.ts` exposes only `identity.peerId` (public) downstream.
- Stdout logs the peer ID (public) only.

**Limitations:**

- On a multi-user machine, the key sits in the home directory at mode 0600 — protected from other OS users, but not from a process running as the same user. OS keychain (macOS Keychain, Windows DPAPI, Linux libsecret) is the harder defense; documented as vNext.

### Layer 6 — No telemetry / no analytics / no crash reporting / no auto-update (enforced)

**Claim:** Vault makes no network call to any non-peer destination. There is no analytics, no crash reporter, no version-check ping, no auto-update.

**Enforcement:**

- `grep -rE "telemetry|analytics|sentry|posthog|crashlytics" packages/ e2e/` returns empty (the only matches are inside `node_modules/@qvac/` which is the SDK's own code).
- The Layer-1 ESLint rule fails the build if any package outside `packages/net` imports an HTTP client.
- `packages/net` only exposes the loopback HTTP+WS server. There is no outbound HTTP code path anywhere in our codebase.

This is the strongest single trust claim Vault makes. **The code that could phone home does not exist in the binary.**

### Layer 7 — Input validation at boundaries (enforced)

**Claim:** Every WebSocket message from the browser is Zod-validated before any business logic touches it. Malformed messages return a structured error.

**Enforcement:**

- [`packages/app/src/messages.ts`](packages/app/src/messages.ts) defines `clientMessageShape` as a Zod-discriminated union over `capture.text`, `capture.audio`, `search.run`, `memory.get`, `tts.play`.
- [`packages/app/src/ws-bridge.ts`](packages/app/src/ws-bridge.ts) calls `clientMessageShape.safeParse(raw)` first thing on every incoming message.
- The unit tests in [`packages/app/tests/ws-bridge.test.ts`](packages/app/tests/ws-bridge.test.ts) verify rejection of malformed messages.

## Trust posture (deferred to later plans)

These are spec-defined claims that Plan 1 doesn't yet implement. Each is honestly documented here so an IT director knows what's promised vs. what's shipped.

### Tamper-evident audit log

**Spec:** Every consent decision writes a `ConsentEvent` to a local Hypercore. Append-only by construction. Cross-peer mutual logs let a firm's auditor cross-verify any two peers.

**Status:** Domain type (`ConsentEvent`) is defined in [`packages/domain/src/consent-event.ts`](packages/domain/src/consent-event.ts). The Hypercore-backed runtime log is scoped to Plan 3 alongside the consent protocol.

### Signed records (every record has a `sig` field)

**Spec § 6:** All records share `{ id, createdAt, updatedAt, deletedAt?, ownerPeerId, provenance, sig }` where `sig` is the owner's Ed25519 signature over the canonical record bytes.

**Status:** Plan 1 implements `sig` only on `Invite` and `Revocation` (the governance records that will need to be verifiable in Plan 3's invite chain). The other record types are unsigned in v1. Adding `sig` to `baseRecordShape` is a Plan-3 migration — Plan 1 is single-node, so no peer is verifying anyone else's records yet.

### Revocation propagation

**Spec:** Admin issues a signed `Revocation`; peers refuse writes from the revoked peer; departed member loses access to new content.

**Status:** Schema is defined. The runtime broadcast + `apply()` enforcement is scoped to Plan 2.

### Hardened distribution

**Spec:** Reproducible builds (Dockerfile + lockfile). Signed releases via Sigstore / Rekor. AppArmor / SELinux profiles for Linux. macOS App Sandbox entitlements. Windows AppContainer / MSIX.

**Status:** Source-available is the current trust ceiling. The Dockerfile + reproducible-build pipeline, sandbox profiles, and code-signing are scoped to vNext.

### Third-party audit + bug bounty

**Spec:** Published security audit from a recognized firm (Trail of Bits, NCC, Cure53). Bug bounty with explicit scope ($X for any proof of data exfiltration without consent, $Y for any connection to a non-DHT non-peer destination).

**Status:** Not commissioned. Documented as the "trust path" for a real productized version.

## Residual risks

These are risks Vault cannot fully eliminate by design. Each is named here, with the mitigation Vault does ship and what's left to the user / firm.

### 1. Consent fatigue

**Risk:** In a multi-peer (Plan 3) deployment, an owner who routinely clicks "Approve" out of habit lets content out that they later regret. This is the most likely real-world failure mode of the product, not a bug.

**Mitigations in code (Plan 3 — not yet implemented):**

- Per-peer rate-limit awareness ("you've approved 12 from Marcus in the last 10 minutes — pause?").
- `requestableScopes` per Memory caps what's even *askable* — sensitive memories can be `['metadata']` only, so the owner is never prompted for snippets / files.
- Default deny on toast dismissal — never implicit approval.

**Cannot be eliminated by software.** If the user says yes, the system does what they asked. Mitigation is *training* + audit logs that surface the pattern post-hoc.

### 2. Compromised peer endpoint

**Risk:** A peer's laptop is compromised by malware. Content the owner consented to release ends up under the attacker's control.

**Mitigations:**

- Small radius of trust: per-firm Vault scope keeps the membership limited.
- Audit log (Plan 3): catches the *granting* of access. Forensics catch the *misuse* post-incident.
- Identity rotation: revoke + re-invite the compromised peer.

**Cannot be eliminated.** This is the same residual risk every information-sharing system has. The mitigation is fast detection + revocation.

### 3. Supply-chain attack on a transitive npm dep

**Risk:** A `bare-*` package or transitive dependency of `@qvac/sdk` is compromised; postinstall script does something malicious.

**Mitigations:**

- `pnpm-lock.yaml` pins every version including transitive.
- `npm ci --ignore-scripts` (and pnpm equivalent) for production installs — blocks postinstall script execution.
- Minimal dep tree philosophy: the Holepunch / Tether ecosystem is famously lean on deps.
- Documented manual lockfile audit for any change touching the inference path.

**Cannot be eliminated.** Node ecosystem reality.

### 4. Reconstruction of content from synced derivatives

**Risk:** Even if file bodies don't sync (spec §7.2), if embeddings / OCR text / summaries *did* sync, an attacker with access to that derived data could approximately reconstruct content the owner never explicitly released.

**Mitigation:** Plan 1 keeps all derivatives **node-local** by design. `@qvac/rag` workspaces are per-peer and never replicated. The cross-node search Plan 3 will ship uses federated fan-out — query embeddings travel, but the candidate's derivatives never leave the owner.

**Status:** This risk class **cannot occur in v1** because there's no sync at all. In Plan 2, sync ships but only for records (file bodies stay local, derivatives stay local). The threat is **eliminated by data-flow design**, not after-the-fact validation.

### 4a. At-rest replication of public-folder content (Plan 4)

**Risk:** Plan 4 introduces folders. A **private** folder's memories are written to an owner-local Hyperbee (`$VAULT_ROOT/local/`) and never enter the synced Autobee — they are confidential from peers at rest. A **public** folder's memory *records* (including the `body` text extracted from the file) DO replicate via Autobee to every admitted roster member, the same way Plan 1-3 memory records always have. Raw file *bytes* still never replicate (only the extracted text in the Memory record does).

This means the consent gate (Plan 3) and the search-probe folder filter are **read-time controls on cooperative search**, not at-rest confidentiality. An admitted peer that inspects its own replicated Autobee view directly — rather than going through `search.probe` — can read every public-folder memory body and every typed capture (which uses the public/replicating path). The blurred-preview + per-request consent flow governs what the *UI and RPC surface* expose; it does not encrypt replicated records.

**Mitigation / posture:**

- **Private folders are the at-rest confidentiality boundary.** Anything that must not be readable by an admitted-but-curious peer goes in a private folder (storage-gated — never replicates). This is enforced structurally in `Repo.putMemoryByVisibility` and proven by `packages/sync/tests/two-peer-folder.test.ts` (the private memory id is never present in the synced view).
- **Public folders are explicitly a sharing surface.** Marking a folder public is the user stating "admitted peers may search this." The consent gate then narrows *delivery* (blurred preview → snippet/file only on approval), but the owner should treat a public folder's contents as readable-at-rest by the roster.
- Encryption-at-rest of replicated records (so even raw-view inspection yields ciphertext) is **deferred** — it requires per-record envelope encryption keyed to the roster and is sketched as future work. v1-v4 do not claim it.

**Status:** Honestly bounded. The "private NEVER reaches a peer" guarantee holds for private folders (two gates, tested). The "public folder + per-memory consent" model is a *cooperative-search* control, documented here so a reviewer doesn't over-read the consent UI as at-rest encryption.

**Known limitations that follow from this model (Plan 4):**

- **Visibility toggle is not retroactive.** Flipping a folder public→private leaves already-replicated memories in peers' Autobee views; the owner's own probe handler stops serving them (folder is now private) but the bytes a peer already replicated are not recalled. Re-create the folder as private to fully re-route. Documented in the README.
- **Default "Captures" folder is public.** Typed/recorded captures replicate like any public memory (as in Plans 1-3). To keep a note fully node-local, capture it into a folder marked private.

### 5. Cross-origin attack via the user's browser

**Risk:** A user visits `evil.example.com` in another tab. The site's JavaScript opens a WebSocket to `ws://127.0.0.1:7421/ws` and tries to drain memories.

**Mitigations:**

- WebSocket upgrade requires a token the cross-origin site cannot read (token endpoint is origin-gated).
- WebSocket upgrade refuses requests whose `Origin` header doesn't match the configured allowlist.
- Tests cover both.

### 6. Token leakage via crash dumps / logs

**Risk:** The per-launch token is logged or dumped somewhere.

**Mitigation:** Token is generated once at sidecar start and written only to `$VAULT_ROOT/.ws-token` (mode 0600). It is **not** logged to stdout. The web UI fetches it via the origin-gated `/token` endpoint and holds it only in memory. The token rotates every launch, so even a stale leak is short-lived.

### 7. Path traversal / symlink escape from VAULT_ROOT

**Risk:** An attacker who can plant a symlink inside `$VAULT_ROOT` (e.g. via a malicious npm postinstall during install) could trick Vault's filesystem layer into writing outside the root.

**Mitigations:**

- `VaultFs.resolveSafe` checks both `..` traversal AND `realpath`-based symlink escape.
- Recommended deployment uses Node `--permission --allow-fs-write=$VAULT_ROOT` as a second layer.

### 8. Model corruption / hostile model file

**Risk:** A malicious actor with write access to the user's `~/.cache/qvac/models/` directory swaps a real model for a hostile one.

**Mitigations:**

- Model files live outside `$VAULT_ROOT` (in the user's home cache). Mode-0700 protection applies at the parent level.
- QVAC's model registry includes a content hash (`blobCoreKey` in the `.d.ts`); a future check should verify download integrity. **Not enforced today** — documented as a Plan-3 hardening item.

**Status:** Mitigation incomplete. Mitigated by file-system permissions; not yet by hash verification.

## How a CISO would verify Vault for their firm

1. **Read this document and `docs/superpowers/specs/2026-05-25-vault-design.md` § 10.**
2. **Run** `pnpm lint && pnpm -r test && pnpm e2e`. All three pass on a fresh clone.
3. **Run** `grep -rE "(fetch\(|XMLHttpRequest|node:http|axios)" packages/ e2e/ --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' | grep -v packages/net/`. Expect zero substantive matches.
4. **Run** `grep -rE "telemetry|analytics|sentry|posthog" packages/ e2e/` (excluding node_modules). Expect empty.
5. **Run the sidecar with `node --permission`** and the `--allow-fs-*` / `--allow-net=...` flags from `README.md`. Vault should still start. Drop the `--allow-net` flag; Vault should refuse to bind anything (verifying it has no hidden network needs).
6. **Audit the import graph:** `grep -rn "from \"@vault/" packages/`. Confirm no upward imports — sync doesn't import app, ai doesn't import retrieval, etc.
7. **Audit the `@qvac/sdk` integration:** [`tools/types/qvac-shim.d.ts`](tools/types/qvac-shim.d.ts) is the entire shape Vault uses. Verify nothing else from the SDK is invoked.
8. **Check the dependency tree:** `pnpm list --depth=0`. The runtime deps are minimal: `@qvac/sdk`, `corestore`, `hyperbee`, `hypercore`, `ulid`, `ws`, `zod`. Everything else is either a workspace package or a devDep.

This is verifiable in roughly 20 minutes by someone who can read TypeScript.

## What Vault deliberately does NOT do

(Same as `MODEL_TRADEOFFS.md` § "Things we deliberately did NOT choose" — repeated here for the trust audience.)

- No Sentry / PostHog / analytics / telemetry / crash reporting / version-check ping / auto-update.
- No outbound HTTP client (`fetch`, `axios`, `node-fetch`, `undici`, `got`) anywhere in our code.
- No external auth provider. Identity is local-only Ed25519. No OAuth, no SSO, no JWT-from-elsewhere.
- No hosted AI API. `@qvac/sdk` is the sole AI dep.
- No background daemon. The sidecar runs as the user's foreground process; closing it stops Vault.
- No file uploads to third-party services. The Markdown exporter (a future feature) writes to the local clipboard or local disk.

## Submission note

This is v1 of Vault's threat model. It will evolve as Plan 2 adds multi-peer sync (introduces new threats: peer impersonation, malicious replication, eclipse attacks via Hyperswarm) and Plan 3 adds consent (introduces new threats: consent fatigue, request flooding, audit-log tampering).

The full multi-version trust path — including reproducible builds, code-signed binaries, AppArmor profiles, third-party audit, and bug bounty — is sketched in spec § 10 and §16, and re-stated in this document under "Trust posture (deferred to later plans)."

If you are a CISO / IT director reviewing Vault for a firm deployment: **the v1 trust posture is honest about what's enforced today vs. what's documented as the trust path.** No claims in code outrun claims in tests.
