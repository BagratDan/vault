# Vault

Peer-to-peer, consent-gated, AI-native Digital Asset Management for sensitive teams. Built as the Tether QVAC SDK Technical PM take-home (2026-05-25 → 2026-05-28).

This README covers what ships in **v1 (Plan 1 — Foundation)**. The full product vision and roadmap live in [docs/superpowers/specs/2026-05-25-vault-design.md](docs/superpowers/specs/2026-05-25-vault-design.md). Model and engine tradeoffs are in [MODEL_TRADEOFFS.md](MODEL_TRADEOFFS.md). The security posture and residual risks are in [THREAT_MODEL.md](THREAT_MODEL.md).

## What it does (v1)

A local-first personal recall app. Run the sidecar, open the web UI, and:

- **Capture memories** by typing, recording (push-to-talk), or importing an audio file.
- **Query in natural language** — "what did Sarah promise about the migration?" — and get an answer grounded in source snippets with citations.
- **Hear the answer** via streaming TTS (optional).
- **Filter** results by tag, owner, person, or date range.
- All inference runs locally through `@qvac/sdk`. No hosted APIs. No telemetry. No phone-home.

The full v1 spec also describes a per-firm Vault with signed-invite membership, federated fan-out search, consent-gated cross-node access, and a tamper-evident audit log. **Plan 1 ships the foundation — single-node only.** Multi-peer Autobee sync and the consent protocol are scoped to Plan 2 and Plan 3 respectively. See [Known limitations](#known-limitations) below for what this means for the take-home prompt.

## Setup

### Prerequisites

- **Node.js 22.17+** (the `engines` field in `package.json` enforces this; `.nvmrc` pins `22.17.0`).
- **pnpm 9.12+** (`corepack enable && corepack prepare pnpm@9.12.0 --activate`, or install directly).
- **Apple Silicon or NVIDIA consumer GPU** — `@qvac/sdk` v0.11.0 ships native bindings for these targets. The build was developed on Apple Silicon.
- **~5.5 GB free disk** for the `@qvac/sdk` transitive native binaries (llama.cpp, whisper.cpp, ONNX runtimes via the `bare-*` Holepunch ecosystem) plus model files. Models download on first inference: ~2.5 GB for Qwen3 4B Instruct Q4_K_M (the Ask LLM) + 150 MB for EmbeddingGemma + ~75 MB for the Parakeet TDT INT8 quad + ~80 MB for Chatterbox Q4F16.

### Install

```bash
git clone <repo-url> vault
cd vault
nvm use            # respects .nvmrc → 22.17.0
pnpm install       # installs all workspace deps including @qvac/sdk
pnpm -r build      # builds all packages
```

### Run

The sidecar serves a loopback HTTP+WebSocket server on `127.0.0.1:7421`. The Vite dev server serves the web UI on `127.0.0.1:5173` and proxies `/ws`, `/token`, and `/healthz` through.

In one terminal:

```bash
pnpm dev
```

This runs `pnpm --filter @vault/app dev` — boots the sidecar with `tsx watch`. On first launch it generates an Ed25519 identity (stored at `~/.vault/identity/keypair.json`, mode 0600) and a per-launch WS auth token (`~/.vault/.ws-token`).

In a second terminal, start the web UI:

```bash
pnpm --filter @vault/web dev
```

Then open <http://127.0.0.1:5173/>.

**First run downloads models** the moment you capture or query. Expect 30–90 seconds on a fresh install. Subsequent launches are instant.

### Production-style launch (with Node permission model)

The sidecar can run under Node's experimental permission model for an extra defense-in-depth layer:

```bash
node --permission \
  --allow-fs-read=$HOME/.vault \
  --allow-fs-write=$HOME/.vault \
  --allow-fs-read=$(pnpm root) \
  --allow-net=hyperdht.org,dht1.hyperdht.org \
  packages/app/dist/index.js
```

This is documented under "Trust posture" in the threat model.

## Run with mocked AI (no model download)

For demos and CI, the AI layer can be swapped for a typed mock via a Node ESM loader hook:

```bash
VAULT_QVAC_MOCK=1 VAULT_ROOT=/tmp/vault-mock \
  pnpm --filter @vault/app exec tsx --import=./tests/qvac-mock/register.js src/index.ts
```

The mock returns deterministic completions (used by the E2E in `e2e/tests/e2e1-literal-prompt.spec.ts`). The loader is inert without the explicit `--import=...` flag and the environment variable; production `node dist/index.js` cannot accidentally activate it.

## Tests

The project has unit, integration, and end-to-end tests. Run them all:

```bash
pnpm -r test        # 91 tests across 9 packages
pnpm e2e            # 3 E2E specs against a live sidecar (mocked QVAC)
pnpm lint           # ESLint with the custom no-network-imports-outside-net rule
pnpm typecheck      # parallel tsc --noEmit across packages
```

### Per-package targeted runs

```bash
pnpm --filter @vault/domain test    # 24 schema tests
pnpm --filter @vault/ai test        # 28 wrapper + extraction + dedup tests
pnpm --filter @vault/retrieval test # 8 workspace/search/filter/reindex tests
pnpm --filter @vault/sync test      # 6 Hyperbee Repo + indexes tests on tmpfs
pnpm --filter @vault/net test       # 6 sidecar tests (loopback bind, /healthz, WS auth)
pnpm --filter @vault/app test       # 13 config/vault-fs/WS-bridge tests
pnpm --filter @vault/web test       # 3 component + ws-client tests via jsdom
pnpm --filter @vault/e2e test       # E2E: capture → search → answer → TTS
```

The E2E spawns a real Node child process running the sidecar with the QVAC mock loader registered, then drives it via a real WebSocket. It's the closest thing to "this stack works end-to-end" you can get without downloading 1 GB of model weights.

A Playwright UI-level E2E config is committed at [e2e/playwright.config.ts](e2e/playwright.config.ts) for a future visual E2E; the directory it points to ([e2e/playwright/](e2e/playwright/README.md)) is currently empty.

## Stack summary

Major technology choices and why each was picked. Detailed model/engine tradeoffs are in [MODEL_TRADEOFFS.md](MODEL_TRADEOFFS.md).

### Data management & storage

- **Hyperbee** (single-peer in v1) for the structured record store. Holepunch primitive, append-only, prefixed keys give us indexed lookup with no full-table scans. Hand-off to Autobee for multi-writer sync is a one-package swap in Plan 2.
- **Corestore** to manage Hypercore lifecycle and key derivation under one root directory.
- **No ORM.** The Hyperbee API is small enough that a thin typed `Repo` over it (40 lines per entity) beats anything heavier. `@vault/sync/src/repo.ts` is the whole query layer.

### Sync structure (designed; not yet wired)

- One Autobee namespace per Vault (a firm, a project). Keys are prefixed by entity kind (`mem/`, `person/`, `place/`, `event/`, `task/`, `ref/`, `rel/`, `src/`). Secondary indexes live under `idx/tag/` and `idx/person/` as ID-only pointers.
- File bodies and derived data (embeddings, OCR text, summaries) **never** sync — only records and metadata.
- Hyperswarm DHT for discovery; per-Vault topic key bootstraps the swarm. Implemented as scaffolding only in Plan 1; wired in Plan 2.

### QVAC integration

- `@qvac/sdk` v0.11.0 — sole AI dependency.
- Provider lifecycle managed by `@vault/ai/src/provider.ts` (idempotent `startQVACProvider` / `stopQVACProvider`).
- `ModelPool` enforces the "at most one large model resident" discipline. STT and embed are small enough to co-reside; LLM and TTS evict each other on load.
- **Ask LLM is Qwen3 4B** (`QWEN3_4B_INST_Q4_K_M`), chosen over Llama 3.2 1B for materially stronger reasoning — the 1B rambled on summaries and couldn't answer count questions even with the folder count in its prompt. Qwen3 4B is the QVAC registry's quality sweet spot for a 16 GB machine: ~2.5 GB weights (~3.2 GB resident with the 4096-token KV cache), ~15–25 tok/s on an Apple M4. The SDK strips Qwen3's `<think>` reasoning blocks by default, so answers are clean. See [MODEL_TRADEOFFS.md](MODEL_TRADEOFFS.md).
- **Ask prompt budgeting.** The LLM loads with a 4096-token context (`modelConfig: { ctx_size }` — QVAC defaults to 1024, which overflows once retrieved chunks are large). `buildAnswerContext` trims the assembled prompt (folder context + top snippets + question) to a ~3000-token budget so it can never overflow, regardless of how many chunks search returns. Per-folder file counts are injected into the context so "how many files…" style questions can be answered inline (semantic retrieval alone can't count files).
- Model registry constants pinned in `@vault/ai/src/models.ts`: Qwen3 4B Instruct Q4_K_M (Ask LLM) / EmbeddingGemma 300M Q4_0 / Chatterbox EN-ES Q4F16 / Parakeet TDT INT8 (encoder + decoder + preprocessor + vocab). (Plan 1 originally shipped Llama 3.2 1B; switched to Qwen3 4B for answer quality — see MODEL_TRADEOFFS.md.)
- A single ambient `tools/types/qvac-shim.d.ts` works around a `@qvac/sdk` v0.11.0 `.d.ts` issue where extension-less re-exports trip NodeNext resolution. Documented in [docs/superpowers/notes/2026-05-26-qvac-spike.md](docs/superpowers/notes/2026-05-26-qvac-spike.md).

### Retrieval & RAG

- `@qvac/rag` (bundled with `@qvac/sdk`) for embedding storage, semantic search, and reindex/migration. We get atomic-ish parallel-workspace migration with a single SDK call per memory.
- Per-peer workspace naming (`vault-<peerId[:6]>`) keeps each peer's index independent; this is the layout federated fan-out (Plan 3) will use.
- Metadata filtering layered on top of `ragSearch` results — composable AND of tag, owner, person, and date-range predicates.

### UI

- **Vite + React 18 + Tailwind 3.4.** Tailwind 3.4 (not 4) because v4 is still under flux and our deadline doesn't allow chasing breakage; the spec lists Tailwind 4 aspirationally. Components are small (`packages/web/src/components/`, ~30–100 lines each).
- The web UI fetches a per-launch auth token via `GET /token`, then opens an authenticated WebSocket to the sidecar. Token + Origin checks block cross-origin browser tabs from talking to the loopback sidecar.
- TTS chunks queue into an `<audio>` element played sequentially; blob URLs are revoked after each chunk plays.

### Styling

- **Tailwind 3.4** utility classes; no separate CSS framework. Dark theme via `bg-slate-950` + `text-slate-100` on `<body>`.

### Testing tools

- **Vitest 2.1** for unit + integration. Components under jsdom via `@testing-library/react`.
- **Playwright 1.48** committed but not yet wired to a UI E2E (see [Known limitations](#known-limitations)).
- Custom Node ESM loader hook (`packages/app/tests/qvac-mock/loader.mjs`) for substituting `@qvac/sdk` at module-resolution time. This is what makes the live-sidecar E2E feasible without downloading 1 GB of model weights for every CI run.

### Major supporting libraries

| Library | Purpose | Why this one |
|---|---|---|
| `zod` ^4.3 | Runtime validation at every boundary | Pinned by `@qvac/sdk`; Zod 4 has cleaner discriminated-union ergonomics for our WS protocol. |
| `ulid` ^2.3 | Sortable IDs on every record | Lexicographic order = chronological; needed for Hyperbee prefix scans. |
| `ws` ^8.18 | WebSocket server in the sidecar | The only network dep allowed in `packages/net/`; tiny, audited. |
| `corestore`, `hyperbee`, `hypercore` (Holepunch) | Storage primitives | Hand-picked by Tether; same stack as Keet. |

## Architecture notes

Full architecture is in the [design spec](docs/superpowers/specs/2026-05-25-vault-design.md). The implementation plan is at [docs/superpowers/plans/2026-05-26-vault-1-foundation.md](docs/superpowers/plans/2026-05-26-vault-1-foundation.md).

Seven-package pnpm workspace with strict layering:

```text
   web   →   app   →   { net, domain, ai, retrieval, sync }
                          ↑                       ↑
                          └──── ESLint rule blocks network imports
                                outside packages/net
```

- `@vault/domain` — types + Zod 4 schemas (Memory/Person/Place/Event/Task/SourceRecord/Relationship/ExternalRef + Member/Invite/Revocation/ConsentEvent).
- `@vault/ai` — Provider lifecycle, ModelPool with hot-swap, STT/embed/LLM/TTS wrappers, extraction pipeline with Zod-retry + low-confidence fallback, cosine dedup, five typed error classes.
- `@vault/retrieval` — `@qvac/rag` workspace per peer, search with metadata filter composition, reindex + parallel-workspace migration.
- `@vault/sync` — Corestore + Hyperbee store, typed Repo for 8 entity kinds, secondary indexes for tags and persons. Multi-writer Autobee plumbing in Plan 2.
- `@vault/net` — loopback HTTP+WS sidecar (refuses non-numeric-loopback hosts).
- `@vault/app` — config, path-confined `VaultFs`, Ed25519 identity, typed WS protocol + bridge, route handlers (capture / search / memory / tts), entry point.
- `@vault/web` — Vite + React UI.

A custom ESLint rule (`tools/eslint-rules/no-network-imports-outside-net.js`) enforces that only `packages/net/` may import `node:net`, `node:http`, `node:https`, `node:tls`, `node:dgram`, `node-fetch`, `undici`, `axios`, `got` — at lint time. The rule is unit-tested.

## Known limitations

Honest disclosure of what's not in v1:

### Cut by design (Plan 1 = Foundation)

- **Multi-peer sync.** Plan 1 is single-node. The data model is Autobee-ready (records are sync-safe; file bodies and derivatives are explicitly node-local), but the actual Hyperswarm DHT + Autobee multi-writer wiring is scoped to Plan 2. The take-home prompt's "arbitrary number of synced devices" requirement is therefore unmet in v1.
- **Consent protocol.** The Vault headline (signed invites, per-request consent gate, federated fan-out, tamper-evident audit log) is scoped to Plan 3. The domain types (`Member`, `Invite`, `Revocation`, `ConsentEvent`) and schemas are in place; the runtime is not. Plan 1 ships as personal recall.
- **Mobile (iOS / Android).** Out of scope; documented as a v3 target.
- **VLM / image capture.** Out of scope.
- **Hosted-service integrations** (Jira, Slack, Notion). Out of trust scope.

### Demo limitations

- The committed E2E (`e2e/tests/e2e1-literal-prompt.spec.ts`) exercises the **backend pipeline** end-to-end against a real sidecar with `@qvac/sdk` mocked at the Node ESM resolver level. A full browser-driven Playwright E2E is committed as `playwright.config.ts` but the spec directory is empty — wiring it required a stable headed-browser setup we deprioritized for time. The React layer is covered by jsdom component tests (`packages/web/tests/App.test.tsx`).
- **Real-model smoke test:** the QVAC SDK installs cleanly and the typed shim is verified; an end-to-end actual-model load + completion was not run as part of CI (would require downloading ~1 GB of models per CI run). The first interactive demo will be the first time the full real-AI path executes. If a runtime issue surfaces, the model error classes in `@vault/ai/src/errors.ts` will surface it with a typed message.

### Smaller deferred items (called out in the [code review](#code-review-outcomes) below)

- `sig` field on `baseRecordShape`: spec asserts every record carries an owner signature; only `Invite` and `Revocation` schemas include it today. Adds a Plan-3 migration step.
- Single Hyperbee namespace vs. spec's syncs/node-local two-bucket split: structurally one bee in v1 because there's no Autobee yet. Plan 2 will split into a synced Autobee + a local-only Hyperbee.
- `migrateWorkspace` writes through without the spec's "atomically swap the workspace pointer in local config." The function is correct for v1's manual-trigger use; a real migration daemon is Plan-3.
- Tailwind 4 in the spec vs. Tailwind 3.4 in the implementation — see [Stack summary](#styling).

## Code review outcomes

Plan 1 was reviewed across five independent axes (spec compliance, shallow bug scan, history coherence, comment invariants, security posture). The review surfaced 21 findings; 11 with confidence ≥ 60 were fixed in commit `7e0d26d`:

1. **TTS playback queue** — replaced `audio.src=url+play()` overwrite with sequential queue + blob-URL revoke.
2. **Audio bytes persisted** — `capture.audio` now writes to `VAULT_ROOT/audio/<id>.bin` via VaultFs; `audioRef` points to the real path.
3. **WS auth** — per-launch `crypto.randomBytes(32)` token + origin check; web UI fetches via `/token` then opens an authenticated WS.
4. **Private-key permissions** — `VaultFs.writeFile` defaults to mode 0o600; `ensureDir` uses 0o700.
5. **`localhost` removed from ALLOWED_HOSTS** — only numeric loopback accepted.
6. **VaultFs symlink check** — realpath walks the deepest existing ancestor to refuse symlink-based escapes.
7. **`qvac-shim.d.ts` consolidated** to `tools/types/`.
8. **Date filter rejects undated hits** when a date range is set.
9. **Tags percent-encoded** before becoming Hyperbee key segments.
10. **Transcript markers prefix the words** instead of overwriting them (spec §9.3 "kept but marked").
11. **Cosine dedup wired** — capture queries `ragSearch` with k=1; ≥0.92 score → `Relationship{type:'duplicate-of'}` + return `duplicateOf` in `capture.ack`.
12. **`streamAnswer` deferred via `queueMicrotask`** so `search.hits` flushes before any background `answer.chunk`.
13. **ESLint network rule** now covers `.ts/.tsx/.js/.mjs/.cjs` in `packages/`, `tools/`, **and** `e2e/`.

Findings with confidence < 60 are documented in [Known limitations](#known-limitations).

## Multi-peer mode (Plan 2)

Vault now supports multiple peers connected through a shared Vault. Two laptops on the same network can:

1. Laptop A: create a Vault → become admin
2. Laptop A: issue an invite token (copy to clipboard, share out-of-band)
3. Laptop B: paste the token → become member
4. Both laptops: see each other's memories via cross-peer federated search

The sync layer is multi-writer Autobee on top of Hypercore + Hyperbee, with Hyperswarm DHT for discovery. Invite tokens are Ed25519-signed and carry the admin's writer key + expiry. The roster gates all writes via a deterministic `apply()` function — only admitted peers can append to the synced state. New peers send a signed `MemberClaim` on first connect; the admin verifies, writes a `Member` record, and the roster propagates to everyone.

### Running the multipeer demo

On each laptop:

```bash
pnpm install
pnpm dev                              # terminal 1 — sidecar
pnpm --filter @vault/web dev          # terminal 2 — web UI
```

Open <http://127.0.0.1:5173/> on each laptop. The first peer creates a Vault; the second pastes the invite token. After ~30 seconds the peer chip in the header shows both peers. Capture a memory on one laptop; search for it on the other.

The full walkthrough is in [docs/DEMO_PLAN_2.md](docs/DEMO_PLAN_2.md).

### Known limitations (Plan 2)

- **Hyperswarm DHT requires outbound UDP.** Corporate Wi-Fi and many hotel networks block this. A LAN-only fallback (mDNS or direct-connect by IP) is documented as Plan 4 work.
- **Federated search leaks the query.** `search.probe` ships the plain-text query to admitted peers so each can run local retrieval. Content (snippets, hits) stays node-local — only the query crosses the wire. Documented in the Plan 2 spec as accepted Plan-2 risk; the Plan 3 consent gate narrows but does not eliminate it.
- **Revocation is data-model only.** A `Revocation` kind is replicated and the `apply()` function refuses writes from revoked peers, but the UI does not yet expose a "revoke peer" action. Plan 3 surfaces it.
- **No consent prompts.** Admitted peers see every memory matching their query. Per-request consent gating, blurred previews, audit log, and the admin pane are scoped to Plan 3.

### Multipeer test

The two-process integration test (`packages/sync/tests/two-peer.test.ts`) runs in CI using an in-memory duplex pair — deterministic proof that the protocol is sound.

The real-DHT test is dev-machine only (it needs outbound UDP, real model downloads, and 3+ minutes):

```bash
pnpm e2e:multipeer
```

This spawns two sidecar child processes on different ports + `VAULT_ROOT`s, joins a real Hyperswarm topic, and verifies peer admission via the `peer.list` reply.

## Consent + audit + admin (Plan 3)

After Plan 2 admitted peers see _every_ memory in cross-peer search. Plan 3 gates each individual read with an explicit, time-bounded prompt:

- **Blurred preview** — cross-peer hits arrive with the snippet first-word + bullets (the rest of the body is redacted on the owner's side before the RPC reply leaves the node).
- **Consent toast** — clicking "Request access" pushes a `consent.request` RPC to the memory's owner. The owner sees a slide-in toast with three buttons (Snippet / Full file / Deny), a fourth Metadata-only secondary, and a 5-minute countdown.
- **Audit log** — every state change (request, approve, deny, expire) writes a `ConsentEvent` to a per-peer Hypercore under `${VAULT_ROOT}/audit/`. Reachable at `#/audit`.
- **Admin pane** — `#/admin` lets the founder see the roster + revoke any member; revoked peers' subsequent writes are dropped by `apply()`.
- **Rate-limit warning** — sliding-window counter (default: 12 / 10 min); the toast shows a yellow banner once the count crosses 8.
- **Scope ceiling per memory** — at capture time the user chooses which scopes (metadata / snippet / file) are askable. Owner-side `respond` short-circuits to deny if a request exceeds the ceiling.

### Running the consent demo

On each laptop, the Plan 2 setup applies (`pnpm install && pnpm dev`). Follow the demo script in [docs/DEMO_PLAN_3.md](docs/DEMO_PLAN_3.md) — 90-second screen recording: capture on A, search on B, request → approve, watch the blurred preview swap for full text + green check.

### Consent E2E test

Excluded from CI; run on a dev machine with outbound UDP:

```bash
pnpm e2e:consent
```

Spawns two sidecars, walks the entire flow (capture → search → request → approve → granted), and asserts the requester receives unblurred text via the consent grant.

### Known limitations (Plan 3)

- **Cross-peer audit verification** — Plan 3 ships local timeline only; "admin pulls peers' logs and cross-checks" is explicitly v2.5 (spec §7).
- **Retention policy** — audit logs grow forever in Plan 3; pruning + retention windows are future work.
- **No soft consent / "remember this decision"** — by design (spec §8.1 hard-consent stance). Every request is a fresh decision.
- **No per-matter sub-vaults** — single vault per peer; matter-scoping deferred to v3.
- **Per-peer audit aggregation by admin** — same deferred line as cross-peer verification.

## Folder-organized DAM (Plan 4)

Plans 1–3 built the consent-gated memory model. Plan 4 turns it into a real DAM by letting you point Vault at folders on your disk:

- **Add folder** from the home screen — paste an absolute path (under `$HOME`), pick a display name, set visibility. Vault walks the directory and indexes every supported file.
- **Supported file types**: PDF (via `pdfjs-dist`), DOCX (via `mammoth`), `.txt` / `.md`, and audio (`.mp3` / `.wav` / `.m4a` / `.flac` / `.ogg`) through the existing Parakeet transcription pipeline. Each file's text is extracted, split into overlapping ~2800-char chunks, and each chunk embedded + indexed locally (a whole document overflows EmbeddingGemma's 1024-token batch limit, so large files must be chunked to be searchable at all). Search collapses chunk hits back to one result per file. The raw bytes never leave your machine until a consent grant approves `scope: "file"`.
- **Public** folders are a sharing surface: admitted peers can search them. Delivery is governed by per-memory consent from Plan 3 (blurred preview by default; real snippet/file only after the owner approves a `consent.request`). **Important:** a public folder's memory bodies replicate via Autobee to the roster — the consent gate controls the *search/RPC surface*, not at-rest encryption. Treat a public folder's contents as readable-at-rest by admitted peers. See [THREAT_MODEL.md](THREAT_MODEL.md) §4a.
- **Private** folders are the at-rest confidentiality boundary — local-only, never replicated. Two independent gates protect them: a **storage gate** (private memories are written to an owner-local Hyperbee under `${VAULT_ROOT}/local/`, never to the synced Autobee — proven by `packages/sync/tests/two-peer-folder.test.ts`) and a **probe-time gate** (the peer-side `handleSearchProbe` admits only known-public folders via a positive allowlist).
- Inside a folder, **Capture / Ask / Library are folder-scoped**. The home screen's "Ask (across all folders)" runs an unscoped federated search. Typed captures land in a default per-peer **Captures** folder (public — captures replicate like any public memory, as in Plans 1-3; put a note in a private folder to keep it fully node-local).
- **Re-scan** (manual) picks up new/changed/deleted files; **Make public/private** toggles visibility (applies to future ingests); **Delete** removes the folder from the vault without touching the files on disk.

### Running the folder demo

The Plan 2 setup applies (`pnpm install && pnpm dev` + `pnpm --filter @vault/web dev`). Then follow [docs/DEMO_PLAN_4.md](docs/DEMO_PLAN_4.md) — a ~90-second walkthrough that adds a folder of text files, watches the ingest progress, and searches inside the folder.

### Folder E2E test

A browser-driven Playwright spec exercises the full add-folder → ingest → search-inside flow. Excluded from the default `vitest` runner; runs via:

```bash
pnpm --filter @vault/e2e test:playwright
```

### Known limitations (Plan 4)

- **Manual re-scan only** — no live filesystem watcher (no chokidar / fs.watch).
- **No OCR** — image-only PDFs without a text layer produce empty bodies and are skipped.
- **Public/private only** — no per-peer folder ACL (a folder is visible to all admitted peers or to no one).
- **Flat folder UI** — a chosen directory is walked recursively and collapsed into one Vault folder; no nested folder navigation.
- **Visibility toggle is not retroactive** — flipping public→private stops the owner's probe handler from serving the folder, but memories already replicated to peers' Autobee views are not recalled. To fully re-route, delete + re-add the folder as private. (THREAT_MODEL §4a.)
- **No at-rest encryption of replicated records** — public-folder bodies + typed captures replicate in cleartext to admitted peers; the consent gate controls the search/RPC surface, not raw-view inspection. Private folders are the at-rest boundary. (THREAT_MODEL §4a.)
- **Path entry by paste** — the browser File System Access API is Chromium-only and gated, so you paste an absolute path rather than using a native picker. A desktop wrapper (Electron/Tauri) would add a native dir picker in a future version.
- **No in-app file preview** — once a peer grants `scope: "file"`, the bytes flow as base64 and download; a built-in PDF/image viewer is deferred.
- **Orphan embeddings on edit/delete** — editing a file's content between reindexes can leave stale chunk vectors in the workspace (re-scan mints a new memory id; content-hash dedup keeps unchanged content from duplicating, but old chunks linger). They're dropped from results (their tombstoned memory resolves to no live folder) and dedupe to their parent, so they're harmless in the UI. The `memory.reindex` message **wipes the workspace and rebuilds from scratch**, clearing all orphans — the canonical recovery for files indexed before chunked embedding, or after many edits.

## Submission deliverables

- **Source code** — this repo.
- **Repository access** — granted to `@elchiapp` (pre-submission).
- **README** — this file.
- **Architecture notes** — [docs/superpowers/specs/2026-05-25-vault-design.md](docs/superpowers/specs/2026-05-25-vault-design.md).
- **Implementation plans** — Plan 1: [docs/superpowers/plans/2026-05-26-vault-1-foundation.md](docs/superpowers/plans/2026-05-26-vault-1-foundation.md). Plan 2: [docs/superpowers/plans/2026-05-26-vault-2-multi-peer-sync.md](docs/superpowers/plans/2026-05-26-vault-2-multi-peer-sync.md). Plan 3: [docs/superpowers/plans/2026-05-26-vault-3-consent-audit-admin.md](docs/superpowers/plans/2026-05-26-vault-3-consent-audit-admin.md). Plan 4: [docs/superpowers/plans/2026-05-26-vault-4-folders-dam.md](docs/superpowers/plans/2026-05-26-vault-4-folders-dam.md).
- **Multi-peer demo script** — [docs/DEMO_PLAN_2.md](docs/DEMO_PLAN_2.md).
- **Consent demo script** — [docs/DEMO_PLAN_3.md](docs/DEMO_PLAN_3.md).
- **Folder DAM demo script** — [docs/DEMO_PLAN_4.md](docs/DEMO_PLAN_4.md).
- **QVAC SDK spike notes** — [docs/superpowers/notes/2026-05-26-qvac-spike.md](docs/superpowers/notes/2026-05-26-qvac-spike.md).
- **Model/engine tradeoffs** — [MODEL_TRADEOFFS.md](MODEL_TRADEOFFS.md).
- **Threat model + trust posture** — [THREAT_MODEL.md](THREAT_MODEL.md).
- **Test instructions** — see [Tests](#tests) above.
- **Known limitations** — see [Known limitations](#known-limitations) above.
- **Demo video (≤3 min)** — see `docs/DEMO.md` (committed alongside the video file).

## License

Source-available for the purposes of this take-home review. License-to-be-decided for any onward use.
