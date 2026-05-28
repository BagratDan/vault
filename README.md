# Vault

**A local-first, peer-to-peer, AI-native document manager for teams that can't send their data to the cloud.**

Vault lets you point your computer at folders of real documents — contracts, notes, recordings — and then ask questions about them in plain language. The answers come from a language model that runs entirely on your own machine. Nothing is uploaded. When you work with teammates, your devices sync directly to each other over an encrypted peer-to-peer network, and every cross-device read is gated by an explicit, time-limited consent prompt.

Built on Tether's [QVAC SDK](https://docs.tether.io) (on-device LLM, speech-to-text, text-to-speech, embeddings, and vector search) and the Holepunch stack (Hypercore / Hyperbee / Autobee / Hyperswarm) for storage and sync.

> **Companion docs:** [MODEL_TRADEOFFS.md](MODEL_TRADEOFFS.md) (why each AI model was chosen) · [THREAT_MODEL.md](THREAT_MODEL.md) (security posture and residual risks).

---

## What you can do with it

### Organize folders of documents

Point Vault at any folder under your home directory. It walks the folder, reads every supported file, and makes the contents searchable. Supported formats:

- **PDF** (text-layer extraction via `pdfjs-dist`)
- **Word** (`.docx` via `mammoth`)
- **Plain text & Markdown** (`.txt`, `.md`)
- **Audio** (`.mp3`, `.wav`, `.m4a`, `.flac`, `.ogg`) — automatically transcribed on-device with the Parakeet speech model, then indexed like any text document.

Each folder is marked **public** or **private**. Public folders are searchable by teammates you've admitted (subject to the consent gate below). Private folders never leave your machine — not even in encrypted form — and are physically stored in a separate local-only database.

The raw file bytes always stay on your disk. Only when a teammate explicitly requests a file *and you approve* does the content cross the wire.

### Ask questions in natural language

Type a question — *"What does the Acme contract say about liability?"* or *"Summarize the Q3 planning notes"* — and Vault:

1. Embeds your question and runs semantic search across the indexed documents.
2. Pulls the most relevant passages.
3. Feeds them to a local LLM, which writes a grounded answer with inline `[1]`, `[2]` citations back to the source documents.

You can ask across all your folders or scope the question to a single folder. You can also have the answer **read aloud** via on-device text-to-speech.

Asking for a whole-folder overview — *"summarize this folder"*, *"what's in here?"* — is handled differently: instead of semantic search (which can't match a request that has no content words), Vault recognizes the summary intent, pulls the folder's documents directly, and synthesizes an overview from their per-file summaries.

### Capture quick notes

Beyond folders, you can capture standalone memories by typing or by recording a voice note (push-to-talk). The LLM extracts structured entities (people, places, events, tasks) from what you captured, and near-duplicate captures are detected and linked automatically.

### Work with a team — privately

Vault is multi-device by design, with no central server:

1. One person **creates a Vault** and becomes its admin.
2. The admin **issues an invite token** (a signed string) and shares it however they like — Signal, AirDrop, a sticky note.
3. A teammate **pastes the token** and is admitted as a member.
4. Devices **discover each other** over the Hyperswarm DHT and sync directly, peer-to-peer.

Once connected, a search runs across everyone's public folders. But — and this is the point — **a teammate never silently reads your documents.** Their search returns only a blurred preview (first word + redaction). To see the real content they must click "Request access," which pops a **consent prompt on your device**: Snippet / Full file / Deny, with a 5-minute countdown. The request travels as a signed record on the shared log — only admitted members can write one, so a non-member or revoked peer can't even ask. Your approval, which carries the actual content, is sent **directly to that one teammate** (point-to-point), never broadcast to the rest of the team. Every request and decision is written to a tamper-evident **audit log** you can review. Admins can revoke a member at any time, and revoked devices are immediately locked out — of both writing to the shared state **and** searching or requesting your content.

---

## Quick start

### Prerequisites

- **Node.js 22.17+** (`.nvmrc` pins `22.17.0`; `package.json` `engines` enforces it).
- **pnpm 9.12+** — `corepack enable && corepack prepare pnpm@9.12.0 --activate`.
- **Apple Silicon or an NVIDIA consumer GPU** — `@qvac/sdk` v0.11.0 ships native bindings for these. Developed and tested on Apple Silicon (M4).
- **~3.5 GB free disk** for the native AI binaries (llama.cpp / whisper.cpp / ONNX via the `bare-*` Holepunch ecosystem) plus model files. Models download on first use: ~700 MB (LLM) + ~150 MB (embeddings) + ~75 MB (speech-to-text) + ~80 MB (text-to-speech).

### Install and run

```bash
git clone <repo-url> vault && cd vault
nvm use            # → Node 22.17.0
pnpm install
pnpm -r build

# Terminal 1 — the sidecar (backend + AI)
pnpm dev

# Terminal 2 — the web UI
pnpm --filter @vault/web dev
```

Open **<http://127.0.0.1:5173/>**.

On first launch the sidecar generates your Ed25519 identity (`~/.vault/identity/keypair.json`, mode `0600`) and a per-launch WebSocket auth token. The first time you capture or ask something, models download in the background (30–90 seconds on a fresh install); after that, launches are instant.

### Trying it out

1. Click **Add folder**, paste an absolute path under your home directory (e.g. `/Users/you/Documents/Contracts`), give it a name, leave it Public, and Add.
2. Watch the ingest progress bar as Vault reads and indexes each file.
3. Open the folder and **Ask** a question about its contents.
4. To try the team flow, run a second instance on another machine, create the Vault on the first, issue an invite, and paste it on the second.

### Hardened launch (optional)

The sidecar can run under Node's experimental permission model for defense-in-depth:

```bash
node --permission \
  --allow-fs-read=$HOME/.vault --allow-fs-write=$HOME/.vault \
  --allow-fs-read=$(pnpm root) \
  --allow-net=hyperdht.org,dht1.hyperdht.org \
  packages/app/dist/index.js
```

See "Trust posture" in [THREAT_MODEL.md](THREAT_MODEL.md).

### Running without downloading models

For demos and CI the AI layer can be swapped for a deterministic typed mock via a Node ESM loader hook:

```bash
VAULT_QVAC_MOCK=1 VAULT_ROOT=/tmp/vault-mock \
  pnpm --filter @vault/app exec tsx --import=./tests/qvac-mock/register.js src/index.ts
```

The hook is inert without both the env var and the explicit `--import` flag, so a normal `node dist/index.js` can never accidentally activate it.

---

## How it's built

Vault is a single backend process (the **sidecar**) that the browser UI talks to over an authenticated, loopback-only WebSocket. The sidecar owns all storage, all AI inference, and all networking. The browser holds no secrets and makes no network calls of its own.

```text
┌─────────────┐   WebSocket    ┌────────────────────────────────────────┐
│  Web UI     │◀──(loopback,──▶│  Sidecar (Node)                        │
│  React+Vite │   token-auth)  │                                        │
└─────────────┘                │  • WS protocol + route handlers        │
                               │  • QVAC: LLM / STT / TTS / embeddings  │
                               │  • Hyperbee + Autobee storage          │
                               │  • Hyperswarm P2P sync                 │
                               └───────────────┬────────────────────────┘
                                               │ direct, encrypted
                                               ▼
                                       Other peers' sidecars
```

### The data flow, end to end

**Adding a folder** → the sidecar walks the directory, parses each file to text (PDF/DOCX/text/audio), and for each document: splits the text into overlapping ~2,800-character chunks (a whole document overflows the embedding model's token limit), embeds each chunk on-device, and stores the vectors in a per-peer vector workspace. One Memory record is created per file. Public-folder records replicate to teammates; private-folder records go to a separate local-only database that never syncs.

**Asking a question** → the sidecar embeds the question, runs vector search (collapsing multiple chunk-hits back to one result per document), assembles a token-budgeted prompt (folder context + top passages + your question, trimmed so it can never overflow the model's context window), and streams the LLM's answer back token by token with citations. For team searches, the same query is sent to connected peers, who each run local search and return *blurred* previews until you're granted access.

**Working with teammates** → invite tokens are Ed25519-signed and carry the admin's writer key plus an expiry. Membership is enforced by a deterministic `apply()` function over the shared Autobee log: only admitted, non-revoked peers can append. The peer-to-peer swarm is bound to each peer's Autobee writer key, so a connection's network identity *is* its roster identity — which lets inbound searches and consent requests be gated against the roster, and lets a consent approval be routed point-to-point to the exact requester. Consent **requests** ride the shared log as signed, roster-gated records; consent **approvals** (which carry document content) are sent directly to the one requester, never broadcast. Every consent request, grant, denial, and expiry is recorded as an event in a per-peer audit log.

### The packages

Vault is a pnpm monorepo of eight focused packages with a strict, lint-enforced dependency direction — only the networking package may import network modules, so AI and storage code physically cannot phone home:

```text
  web  →  app  →  { net, domain, ai, retrieval, sync, ingest }
                     ▲
                     └─ ESLint rule forbids network imports outside packages/net
```

| Package | Responsibility |
|---|---|
| **`@vault/domain`** | Every record's shape, as Zod schemas: Memory, Person, Place, Event, Task, SourceRecord, Relationship, ExternalRef, Folder, plus the team-protocol types (Member, Invite, Revocation, ConsentEvent). The single source of truth for data validation at every boundary. |
| **`@vault/ingest`** | Folder scanning and file parsing (PDF / DOCX / text / audio), plus the document chunker. |
| **`@vault/ai`** | All QVAC integration: provider lifecycle, a model pool that keeps at most one large model resident, and wrappers for the LLM, embeddings, speech-to-text, and text-to-speech. Also the entity-extraction pipeline (with schema-validated retry + low-confidence fallback) and duplicate detection. |
| **`@vault/retrieval`** | The vector index. Wraps `@qvac/rag` for embedding storage and semantic search; collapses chunked results back to documents and composes metadata filters on top. |
| **`@vault/sync`** | Storage and the peer-to-peer protocol: Corestore + Hyperbee for records, multi-writer Autobee for shared state, the roster/`apply()` membership gate, the owner-local store for private folders, the consent protocol, the audit log, and Hyperswarm discovery. |
| **`@vault/net`** | The loopback HTTP + WebSocket server. The *only* package allowed to import network modules. Binds `127.0.0.1` / `::1` only and refuses anything else. |
| **`@vault/app`** | The sidecar itself: configuration, a path-confined filesystem wrapper, Ed25519 identity, the typed WebSocket protocol and its route handlers (capture, search/ask, folders, consent, admin, audit, TTS, reindex), and the process entry point. |
| **`@vault/web`** | The React + Vite + Tailwind UI: folder list and folder view, search bar and answer card, capture pane, filter controls, the consent toast and audit/admin screens, peer list, and vault setup. |

### The AI models (all on-device)

| Role | Model | Notes |
|---|---|---|
| Answering & extraction | Llama 3.2 1B Instruct (Q4_0) | ~700 MB. Loaded with a 4,096-token context. |
| Embeddings | EmbeddingGemma 300M (Q4_0) | Powers semantic search and duplicate detection. |
| Speech-to-text | Parakeet TDT (INT8, 4 files) | Transcribes voice notes and audio files. |
| Text-to-speech | Chatterbox EN-ES (Q4F16) | Reads answers aloud. |

Models are pinned in [`packages/ai/src/models.ts`](packages/ai/src/models.ts). A pool keeps memory bounded — the small embedding model co-resides with whichever large model (LLM or TTS) is active, and the two large models evict each other. The full rationale, the alternatives weighed, and an evaluated-but-reverted upgrade to Qwen3 4B are documented in [MODEL_TRADEOFFS.md](MODEL_TRADEOFFS.md).

### Privacy architecture in two sentences

A **public** folder's records replicate to admitted teammates, and the *consent gate controls who can search and read them* — it is not at-rest encryption, so treat public-folder contents as readable by admitted peers (see [THREAT_MODEL.md](THREAT_MODEL.md) §4a). A **private** folder is protected by two independent gates: a **storage gate** (its records live only in an owner-local database, never in the synced log) and a **probe-time gate** (the code that answers teammates' searches serves only folders on a positive public-allowlist), so a private document can never leak even through a bug in one layer.

### Notable engineering choices

- **Two identity keys, one canonical.** Each peer has an Ed25519 *identity* key and an Autobee *writer* key. The writer key is canonical for ownership, the membership gate, search attribution, **and the peer-to-peer swarm identity** (the Hyperswarm node is bound to the writer keyPair, so a connection's authenticated pubkey equals the peer's roster key). Mixing the two keys up silently drops writes, so the codebase always stamps records — and consent requests — with the writer key.
- **Chunked embedding.** Large documents exceed the embedding model's 1,024-token batch limit, so each file is split into overlapping windows, embedded per-chunk, and indexed under a `<documentId>#<chunkIndex>` key; search recovers the parent document and keeps the best-scoring chunk. Re-indexing wipes and rebuilds the vector store cleanly.
- **Prompt budgeting.** The answer prompt is assembled under a token budget (folder context + top passages + question always fit), so it can never overflow the model's context window regardless of how many passages search returns.
- **Untrusted LLM output.** Extraction validates every entity against its schema and drops individual failures rather than aborting a capture.

---

## Tests

```bash
pnpm -r test        # full suite — 288 tests across all packages
pnpm e2e            # end-to-end against a live sidecar (QVAC mocked)
pnpm lint           # ESLint, incl. the custom no-network-imports rule
pnpm typecheck      # parallel tsc --noEmit
```

Targeted runs:

```bash
pnpm --filter @vault/domain test      # record schemas
pnpm --filter @vault/ai test          # model wrappers, extraction, dedup, prompt budgeting
pnpm --filter @vault/ingest test      # parsers + chunker
pnpm --filter @vault/retrieval test   # vector workspace, search dedup, filters
pnpm --filter @vault/sync test        # storage, roster/apply, consent, two-peer protocol
pnpm --filter @vault/net test         # loopback bind, /healthz, WS auth
pnpm --filter @vault/app test         # config, path confinement, WS bridge, routes
pnpm --filter @vault/web test         # React components + ws-client (jsdom)
```

**What the tests cover.** Unit tests exercise each package in isolation. The two-peer protocol is proven deterministically with an in-memory duplex pair (no real network needed). The default end-to-end suite spawns a real sidecar child process — with `@qvac/sdk` swapped for a deterministic mock at module-resolution time — and drives it over a real WebSocket, so the whole backend path (capture → search → answer → TTS, and add-folder → ingest → search) is verified without downloading gigabytes of models.

A few suites need a real machine and are excluded from CI:

```bash
pnpm e2e:multipeer   # two sidecars over a real Hyperswarm DHT (needs outbound UDP)
pnpm e2e:consent     # full capture → request → approve → granted flow across two peers
pnpm --filter @vault/e2e test:playwright   # browser-driven folder flow
```

---

## Known limitations

Honest disclosure of what Vault does **not** do today.

**Networking.** Hyperswarm discovery needs outbound UDP, which corporate Wi-Fi and many hotel networks block; a LAN-only fallback is future work. Team search sends the plain-text *query* to admitted peers (so each can search locally) — content stays node-local, but the query itself crosses the wire.

**Privacy boundary.** Replicated records (public-folder contents and typed captures) are not encrypted at rest on teammates' machines; the consent gate controls the *search and read surface*, not raw inspection of a peer's local store. Private folders are the true at-rest boundary. Flipping a folder public→private stops serving it but does not recall records already replicated — delete and re-add as private to fully re-route.

**Folders.** Re-scan is manual (no live filesystem watcher). Image-only PDFs without a text layer are skipped (no OCR). A folder is all-public or all-private (no per-person ACL). A chosen directory is flattened into one Vault folder (no nested navigation). Editing a file's content between re-indexes can leave orphan vectors that are harmless in results; a full reindex clears them.

**Platform.** Desktop only (Apple Silicon / NVIDIA). No mobile. Paths are pasted rather than picked through a native dialog, because the browser's directory-picker API is gated; a desktop wrapper (Electron/Tauri) would add a native picker. No in-app file preview — granted files download.

**Audit.** The audit log is a local timeline; cross-peer log verification by an admin, and retention/pruning, are future work. Consent is hard by design — every request is a fresh decision, with no "remember this."

---

## Submission deliverables

Vault was built as the Tether QVAC SDK Technical PM take-home (2026-05-25 → 2026-05-28), delivered across four implementation plans (foundation → multi-peer sync → consent/audit/admin → folder DAM).

- **Source code** — this repo.
- **Model & engine tradeoffs** — [MODEL_TRADEOFFS.md](MODEL_TRADEOFFS.md).
- **Threat model & trust posture** — [THREAT_MODEL.md](THREAT_MODEL.md).

## License

Source-available for the purposes of this take-home review. License-to-be-decided for any onward use.
