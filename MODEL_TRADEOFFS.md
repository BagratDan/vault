# Model & engine tradeoffs

This document covers the substantive AI and infrastructure choices made in Plan 1 of Vault, the reasoning behind each, and the alternatives that were considered. Required submission deliverable per the Tether take-home.

Companion docs: [README.md](README.md) (setup + stack summary), [docs/superpowers/specs/2026-05-25-vault-design.md](docs/superpowers/specs/2026-05-25-vault-design.md) (full architectural spec), [docs/superpowers/notes/2026-05-26-qvac-spike.md](docs/superpowers/notes/2026-05-26-qvac-spike.md) (spike that surfaced QVAC's actual API).

## LLM — Qwen3 4B Instruct Q4_K_M (switched from Llama 3.2 1B)

**Chosen:** `QWEN3_4B_INST_Q4_K_M` (single-file constant; ~2.5 GB on disk, ~3.2 GB resident with the 4096-token KV cache).

**History:** Plan 1 originally shipped `LLAMA_3_2_1B_INST_Q4_0` (~700 MB) for its small footprint. In testing, the 1B reasoned too weakly for the Ask flow — it rambled on summaries and could not answer count/metadata questions (e.g. "how many files are in the folder") *even when the count was injected into its prompt*. After fixing a separate LLM context-overflow bug (raising `ctx_size` 1024→4096 + budgeting the prompt), the remaining failure was purely model reasoning quality, so we upgraded the model.

**Why Qwen3 4B:**

- The QVAC v0.11.0 registry ships a fixed catalog (we can't pull arbitrary HuggingFace models). Among the general-purpose instruct LLMs that fit a 16 GB machine, Qwen3 4B is the quality sweet spot.
- Materially stronger instruction-following and reasoning than the 1B — answers count questions correctly, summarizes coherently, respects the "cite [1]/[2]" format.
- Single-file constant → one `loadModel` call (not the `_SHARD`/`_TENSORS` multi-file variants).
- Qwen3 supports a `<think>…</think>` reasoning mode; the QVAC completion normalizer **strips those blocks by default** (`captureThinking: false`), so Vault needs no extra code to keep answers clean.
- `ctx_size: 4096` (set on the pool handle) is model-agnostic and carries over unchanged. Embeddings are independent of the LLM, so the switch needs **no re-index**.

**Candidate comparison (registry LLMs viable on a 16 GB Apple M4):**

| Registry constant | Weights (Q4) | + KV @4096 | Reasoning | ~tok/s (M4) |
|---|---|---|---|---|
| `LLAMA_3_2_1B_INST_Q4_0` (was) | ~0.8 GB | ~1.1 GB | weak | 40–60 |
| `QWEN3_1_7B_INST_Q4` | ~1.2 GB | ~1.6 GB | good | 30–45 |
| **`QWEN3_4B_INST_Q4_K_M` (chosen)** | ~2.5 GB | ~3.2 GB | strong (≈GPT-3.5) | 15–25 |
| `GEMMA_4B_IT_Q4_1` | ~2.8 GB | ~3.6 GB | strong, more verbose | 15–22 |
| `QWEN3_8B_INST_Q4_K_M` | ~5 GB | ~6.5 GB | strongest | 8–14 |
| `GPT_OSS_20B_INST_Q4_K_M` | ~12 GB | — | excellent | too big for 16 GB |

Size figures are standard GGUF quant footprints (the registry carries no inline size metadata); tok/s are Apple M4 (10-core, unified memory) estimates. The `ModelPool` "one large model resident" rule means the LLM co-resides only with the small embed model (~0.3 GB) — TTS is evicted when the LLM loads — so peak Ask memory stays bounded (~3.5 GB) within 16 GB alongside macOS.

**Alternatives considered:** Gemma 4B IT (comparable quality but more verbose — worse for terse count answers); Qwen3 8B (stronger but slower with less headroom on 16 GB); Qwen3 1.7B (lighter, smaller quality gain). `LLAMA_TOOL_CALLING_1B`, `BITNET_*`, and the `GPT_OSS` family were ruled out earlier (tool-calling unused, structured-output risk, out of budget respectively).

**Risk we accepted:** ~2.5 GB first-load download and slower generation (~15–25 vs ~40–60 tok/s) — barely noticeable for short grounded answers, a brief wait for long summaries. Higher resident memory (~3.2 GB vs ~1.1 GB) is comfortable on 16 GB but could trip `onMemoryPressure` on a machine also running heavy apps. Rollback is a one-line revert of `VAULT_MODELS.llm` (back to `LLAMA_3_2_1B_INST_Q4_0`, or down to `QWEN3_1_7B_INST_Q4`). The extraction pipeline ([`packages/ai/src/extract.ts`](packages/ai/src/extract.ts)) shares this LLM, so its Zod-validated retry + confidence=0.1 raw-text fallback still applies — and benefits from the stronger model.

## STT — Parakeet TDT INT8

**Chosen:** `PARAKEET_TDT_ENCODER_INT8` + `PARAKEET_TDT_DECODER_INT8` + `PARAKEET_TDT_PREPROCESSOR_INT8` + `PARAKEET_TDT_VOCAB` (multi-file load, ~75 MB total).

**Why:**

- This is what QVAC v0.11.0 registers as named constants. The original spec wrote "Whisper tiny" but the registry has no `WHISPER_*` constants — Whisper is available via the `@qvac/sdk/whispercpp-transcription/plugin` plugin path but isn't first-class.
- INT8 quantization is small + fast on Apple Silicon and NVIDIA consumer GPUs.
- Parakeet TDT (Token-and-Duration Transducer) is NVIDIA's current best-in-class small STT model; comparable to Whisper-small in WER, lower latency.
- Comes with companion models (`PARAKEET_SORTFORMER_FP32` for speaker diarization) — not used in Plan 1 but available for Plan 2 when speaker labeling matters.

**Alternatives considered:**

- Whisper tiny / base via the plugin path. The spec's original choice; switched after the spike confirmed Parakeet is the registry-pinned default. Whisper is preserved as a fallback if Parakeet proves unstable on specific hardware.
- `PARAKEET_TDT_*_FP32` — bigger, slower, marginal quality win at our use case (push-to-talk + audio-import, not real-time captioning).
- `PARAKEET_EOU_*` (end-of-utterance) and `PARAKEET_CTC_*` — variants for streaming. Plan 1 captures audio in a single shot; not relevant.

**Risk:** Multi-file load is heavier than the spec's "Whisper tiny (~75MB)" assumption suggested. Mitigated by `ModelPool` treating STT as a small co-resident model; load happens once per session, not per capture.

## Embeddings — EmbeddingGemma 300M Q4_0

**Chosen:** `EMBEDDINGGEMMA_300M_Q4_0` (~150 MB).

**Why:**

- Smallest embedding model in QVAC's registry. The spec originally targeted "bge-class ~30 MB" but no `BGE_*` constants are pinned in v0.11.0.
- 300M params with Q4_0 quantization fits comfortably alongside the LLM in memory.
- Output dim 384 — small enough that brute-force cosine over ≤10k memories is sub-millisecond, large enough to capture the semantic distinctions Plan 1's demo corpus needs.

**Alternatives considered:**

- `EMBEDDINGGEMMA_300M_Q8_0` / `_BF16` / `_F32` — higher precision, larger files. We accept the Q4_0 quality loss; embedding fidelity matters less for our K=8 retrieval than for, say, recommender systems at scale.
- `GTE_LARGE_335M_FP16_SHARD` — comparable size, multi-file load, less popular ecosystem support.

**Risk:** Embedding model upgrades require re-indexing. Mitigated by `@vault/retrieval`'s `migrateWorkspace` which writes through to a parallel workspace then closes the old. Documented in spec §9.4.

## TTS — Chatterbox EN-ES Q4F16

**Chosen:** `TTS_EN_ES_CHATTERBOX_Q4F16` (English/Spanish, multi-file).

**Why:**

- Smallest TTS suite in QVAC's registry. The spec originally said "~40 MB ONNX TTS"; the registry's actual TTS options are multi-file Chatterbox or Supertonic suites.
- EN-ES quantized is much smaller than the multilingual fp32/fp16 variants while remaining intelligible.
- Streaming-friendly via `textToSpeechStream`.

**Alternatives considered:**

- `TTS_MULTILINGUAL_LANGUAGE_MODEL_CHATTERBOX_Q4` + companions — full multilingual suite. ~5× larger. Demo doesn't need it.
- `TTS_*_SUPERTONIC_*` — latent-denoiser-based; higher quality but larger and slower to first-audio. Better for production read-along; overkill for short answer playback.
- Just skipping TTS — the Tether prompt lists "optionally hear the answer through TTS" as a user-facing capability; cutting it would leave a literal requirement unmet.

**Risk:** Chatterbox is a multi-file load. `ModelPool` evicts the LLM when TTS loads (both are "large"), which adds latency to subsequent search queries. The UX accepts this — the user explicitly clicks Play to hear an answer; they're not searching mid-playback.

## Vector index — `@qvac/rag` (not hand-rolled)

**Chosen:** Use `@qvac/sdk`'s bundled `@qvac/rag` for ingestion, search, and reindex.

**Why:**

- The spike (committed 2026-05-26) discovered `ragIngest`, `ragSearch`, `ragReindex`, `ragSaveEmbeddings`, `ragCloseWorkspace`, `ragDeleteWorkspace`, `ragListWorkspaces` are first-class SDK functions.
- The spec's "deterministic reconstruction or migration of derived indexes" requirement is satisfied by `ragReindex` directly.
- Per-workspace scoping (one workspace per peer ID) gives us the federated-fan-out layout (Plan 3) for free — each peer's workspace queries independently.
- Engineering depth shifts from "reinvent HNSW" (the spec's original direction) to "integrate QVAC primitives correctly" — which is what a Tether reviewer actually wants to see.

**Alternatives considered:**

- Hand-rolled brute-force cosine over a Hyperbee-stored embedding column. The spec's original direction. Smaller dep surface but duplicates work `@qvac/sdk` already does well, and locks us out of `ragReindex`.
- `hnswlib-node` — production-grade HNSW. Spec listed this as the v1.1 swap. Now unnecessary because `@qvac/rag` handles vector storage internally.
- LanceDB directly — QVAC uses it under the hood; reaching past the SDK abstraction would buy nothing and break the "QVAC for all AI" trust posture.

## Sync — Hyperbee in Plan 1, Autobee in Plan 2

**Chosen for Plan 1:** Single-peer Hyperbee. Autobee deferred.

**Why:**

- The Tether prompt asks for "arbitrary number of synced devices." A real Autobee + Hyperswarm wiring is a Plan-2 deliverable; doing it right requires handling multi-writer apply functions, conflict resolution, and bootstrap-key exchange — none of which Plan 1 has time for after the foundation + extraction pipeline.
- The Plan 1 data layout is **Autobee-ready**: prefixed keys (`mem/`, `person/`, ...), node-local indexes (`idx/embed/*` lives in `@qvac/rag`, not the bee), file bodies on disk outside the sync graph. Promoting Hyperbee to Autobee is a one-package change.
- Honest disclosure: the requirement is unmet in v1. See [README.md § Known limitations](README.md#known-limitations).

**Alternatives considered:**

- Half-ship Autobee with a flaky multi-writer demo. Would meet the literal requirement at the cost of code quality. Rejected — better to ship clean foundations than broken sync.
- Use a different P2P substrate (libp2p, GossipSub). Out of scope; Tether explicitly built on Holepunch.

## Identity — Ed25519 via Node `crypto`

**Chosen:** `crypto.generateKeyPairSync("ed25519")` on first launch; persist raw 32-byte public + private keys at `$VAULT_ROOT/identity/keypair.json` (mode 0600).

**Why:**

- Native Node API, no extra dep, well-audited.
- Ed25519 is the standard for the Holepunch ecosystem; Hypercore peer IDs are Ed25519 keys.
- Plan 3's signed `Invite`, `Revocation`, and `Member` records will use the same key directly.

**Alternatives considered:**

- `sodium-native` — bigger dep, more features we don't need. Defer.
- OS keychain (macOS `security`, Windows DPAPI, Linux libsecret) — superior trust posture but each is its own integration. Documented as vNext in the threat model.

## Identity persistence — JSON file vs. OS keychain

**Chosen:** JSON file under `$VAULT_ROOT/identity/keypair.json` with file mode 0600 and directory mode 0700.

**Why:** simplest correct option for v1. The realpath check in `VaultFs` protects against symlink-based escapes from `$VAULT_ROOT`. The trust posture documented in `THREAT_MODEL.md` is honest about this being weaker than OS keychain.

## Network — `ws` (server) and native `WebSocket` (client)

**Chosen:** `ws` v8.18 for the sidecar's WebSocket server; the browser's native `WebSocket` for the client.

**Why:**

- `ws` is the canonical Node WebSocket library; small dep tree; well-audited.
- The `verifyClient` hook lets us implement origin + token auth at upgrade time.
- The browser's native `WebSocket` needs no polyfill.

**Alternatives considered:**

- Socket.io — way more than we need; auto-reconnect logic we'd have to disable to keep the token-rotation story simple.
- WebTransport — bleeding edge; not yet supported in Hyperswarm.

## TypeScript strictness

**Chosen:** `strict: true` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `noImplicitOverride` + `noFallthroughCasesInSwitch` + `noPropertyAccessFromIndexSignature` + `verbatimModuleSyntax` + `composite: true`.

**Why:**

- The take-home explicitly asks for "strongly typed; avoid untyped data flow, broad any, unchecked casts, loosely structured records."
- `exactOptionalPropertyTypes` is particularly strict; it surfaced multiple real bugs during development (notably in the WS bridge filter spread).
- Composite projects let us run `tsc -b` for fast incremental builds across the workspace.

**Alternatives considered:**

- Default strictness — would have shipped faster but missed real bugs.
- TS `--strict` without the extra `noUnchecked*` flags — common default; we want stricter.

## UI framework — Vite + React 18 + Tailwind 3.4

**Chosen:** Vite for dev/build, React 18 for components, Tailwind 3.4 for styling.

**Why:**

- Vite's hot-module-reload is the fastest dev loop available; the proxy config gracefully forwards `/ws`, `/token`, `/healthz` to the sidecar.
- React 18 + `useState`/`useEffect` is enough for the UI complexity in v1; no need for a state-management library.
- Tailwind 3.4 because v4 was still pre-release at submission time. The spec aspirationally lists Tailwind 4; we pinned 3.4 in the implementation. Documented in README.

**Alternatives considered:**

- SvelteKit, SolidJS — smaller bundles. React was chosen for ecosystem familiarity and faster iteration; the production bundle (150 KB JS gzipped to 48 KB) is well within demo budget.
- CSS Modules — finer-grained scoping but more boilerplate.

## Testing — Vitest, Playwright (committed but stub), Custom ESM loader hook

**Chosen:** Vitest for unit + integration; Playwright config committed but no UI E2E yet; a custom Node ESM resolver hook (`packages/app/tests/qvac-mock/loader.mjs`) to substitute `@qvac/sdk` for E2E.

**Why:**

- Vitest 2.1 supports parallel-pool execution, jsdom for React component tests, and `vi.mock` for unit-test SDK isolation.
- The custom ESM loader hook was the breakthrough: `vi.mock("@qvac/sdk")` couldn't reliably intercept transitive imports under pnpm workspaces + bare-runtime native bindings. The loader hook intercepts at Node's module-resolution layer, which works cleanly. This is documented in [packages/app/tests/qvac-mock/](packages/app/tests/qvac-mock/) and the deleted skipped-integration-test commit message.
- Playwright committed for the future visual-E2E path; the headless backend E2E is the canonical Plan 1 acceptance test.

## ESLint — flat config, custom rule, Zod 4

**Chosen:** ESLint v9 flat config (`eslint.config.js`) with a custom rule banning network imports outside `packages/net`.

**Why:**

- ESLint v9 dropped legacy `.eslintrc.cjs` support; flat config is the forward-compatible choice.
- The custom rule is the **architectural enforcement** of the spec's network-discipline trust claim. Lint-time guardrails are dramatically more verifiable than design-document promises.
- Rule is unit-tested against the ESLint `RuleTester` API.

## Things we deliberately did NOT choose

- **No Sentry / PostHog / analytics / telemetry.** Spec §11 forbids these. The codebase has zero matches for these names. (`THREAT_MODEL.md` covers the trust implications.)
- **No `node-fetch` / `axios` / `undici` / `got`.** The custom ESLint rule fails the build if any package outside `packages/net` imports these.
- **No auto-update / phone-home.** Releases are explicit `git pull && pnpm install`. No version check on startup.
- **No external auth provider.** Identity is local-only Ed25519. No OAuth, no JWT-from-elsewhere.
- **No hosted AI API.** `@qvac/sdk` is the sole AI dep.

## Take-home prompt → implementation map

| Tether requirement | Vault choice | Doc location |
|---|---|---|
| "TypeScript" | TS 5.5 strict, no `any`, Zod 4 at boundaries | this doc + README |
| "Autobee for sync" | Hyperbee in Plan 1 → Autobee in Plan 2 (data model already Autobee-ready) | this doc, README known-limits |
| "QVAC for all AI" | `@qvac/sdk` v0.11.0 only — STT (Parakeet), embed (Gemma), LLM (Llama), TTS (Chatterbox) | this doc |
| "Consumer hardware, 8–16 GB" | All quantized models; ModelPool one-large-resident | this doc, ModelPool section |
| "Voice + text capture" | Push-to-talk + audio import + text textarea | README |
| "NL query, grounded answers, source snippets, optional TTS" | RAG via `@qvac/rag`, citation chips, streaming TTS | README |
| "Memory + people/places/events/tasks + source records + relationships + timestamps + provenance" | 8 entity types + ULID + base record | spec §6 |
| "Indexed lookup, no full-table scans" | Hyperbee prefixed namespaces + `idx/tag`, `idx/person` | this doc |
| "Strongly typed, clear layer boundaries" | 7-package monorepo + ESLint rule | this doc, README architecture |
| "LLM robustness" | Zod-validated retry + low-confidence fallback + dedup + partial-transcript markers + 5 typed error classes | this doc, extraction section |
| "Unit + integration + E2E" | 91 tests + 3 E2E specs against live sidecar | README test section |
