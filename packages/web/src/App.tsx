import React, { useEffect, useRef, useState } from "react";
import { createWsClient, type WsClient } from "./ws-client.js";
import { CapturePane } from "./components/CapturePane.js";
import { SearchBar } from "./components/SearchBar.js";
import { ResultCard } from "./components/ResultCard.js";
import { AnswerCard } from "./components/AnswerCard.js";
import { FilterControls, type Filters } from "./components/FilterControls.js";
import { ModelStatus } from "./components/ModelStatus.js";
import { VaultSetup } from "./components/VaultSetup.js";
import type { Hit, Citation, ClientMessage } from "./types.js";

export function App() {
  const [ws, setWs] = useState<WsClient | null>(null);
  const [connState, setConnState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [vaultStateView, setVaultStateView] = useState<"unknown" | "no-vault" | "admin" | "member">(
    "unknown"
  );
  const [hits, setHits] = useState<Hit[]>([]);
  const [answer, setAnswer] = useState<{ text: string; citations: Citation[] } | null>(
    null
  );
  const [filters, setFilters] = useState<Filters>({});
  const [playing, setPlaying] = useState(false);
  const [banner, setBanner] = useState<
    | { kind: "info" | "success" | "error"; text: string }
    | null
  >(null);
  const audioQueue = useRef<{ queue: string[]; el: HTMLAudioElement | null }>({
    queue: [],
    el: null,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    setConnState("loading");
    (async () => {
      try {
        const res = await fetch("/token", { credentials: "omit" });
        if (!res.ok) throw new Error(`token endpoint returned ${res.status}`);
        const body = (await res.json()) as { token: string };
        if (cancelled) return;
        const client = createWsClient({
          url: `ws://${window.location.host}/ws?token=${encodeURIComponent(body.token)}`,
        });
        client.send({ kind: "vault.status" });
        setWs(client);
        setConnState("ready");
      } catch {
        if (!cancelled) setConnState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ws) return;
    if (!audioQueue.current.el) {
      const el = new Audio();
      // Play the next queued blob URL when the current one finishes,
      // revoking the URL we just played to avoid blob leaks.
      el.addEventListener("ended", () => {
        const finishedUrl = el.src;
        if (finishedUrl.startsWith("blob:")) URL.revokeObjectURL(finishedUrl);
        const next = audioQueue.current.queue.shift();
        if (next) {
          el.src = next;
          void el.play();
        }
      });
      audioQueue.current.el = el;
    }
    return ws.onMessage((m) => {
      if (m.kind === "vault.status") {
        setVaultStateView(m.state);
      } else if (m.kind === "vault.created" || m.kind === "vault.joined") {
        ws.send({ kind: "vault.status" });
      } else if (m.kind === "search.hits") {
        setHits(m.hits);
      } else if (m.kind === "capture.ack") {
        setBanner(
          m.duplicateOf
            ? { kind: "info", text: `Duplicate of memory ${m.duplicateOf.slice(0, 8)}` }
            : { kind: "success", text: `Saved memory ${m.memoryId.slice(0, 8)}` }
        );
      } else if (m.kind === "error") {
        const short = m.message.length > 240 ? m.message.slice(0, 240) + "…" : m.message;
        setBanner({ kind: "error", text: `${m.code}: ${short}` });
      } else if (m.kind === "answer.chunk") {
        setAnswer({ text: m.text, citations: [] });
      } else if (m.kind === "answer.done") {
        setAnswer((prev) => (prev ? { ...prev, citations: m.citations } : null));
      } else if (m.kind === "tts.chunk") {
        const bytes = Uint8Array.from(atob(m.audioBase64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        const el = audioQueue.current.el!;
        if (el.paused && !el.src.startsWith("blob:")) {
          el.src = url;
          void el.play();
        } else {
          audioQueue.current.queue.push(url);
        }
      } else if (m.kind === "tts.done") {
        setPlaying(false);
      }
    });
  }, [ws]);

  const send = (msg: ClientMessage) => ws?.send(msg);

  if (connState !== "ready") {
    return (
      <main className="mx-auto flex max-w-3xl flex-col items-center justify-center p-10">
        <ModelStatus state={connState} />
      </main>
    );
  }

  if (vaultStateView === "unknown") {
    return (
      <main className="mx-auto flex max-w-3xl flex-col items-center justify-center p-10">
        <p className="text-sm text-slate-400">Loading vault status…</p>
      </main>
    );
  }

  if (vaultStateView === "no-vault") {
    return (
      <VaultSetup
        onCreate={(displayName) => send({ kind: "vault.create", displayName })}
        onJoin={(token, displayName) => send({ kind: "vault.invite-accept", token, displayName })}
      />
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Vault</h1>
        <ModelStatus state={connState} />
      </header>

      {banner && <Banner banner={banner} onDismiss={() => setBanner(null)} />}

      <CapturePane
        onSubmitText={(text, tags) => send({ kind: "capture.text", text, tags })}
        onSubmitAudio={(audio, tags) => {
          let bin = "";
          for (let i = 0; i < audio.length; i++) bin += String.fromCharCode(audio[i]!);
          const audioBase64 = btoa(bin);
          send({ kind: "capture.audio", audioBase64, tags });
        }}
      />

      <SearchBar
        onSubmit={(query) => {
          setAnswer(null);
          const msg: ClientMessage =
            Object.keys(filters).length > 0
              ? { kind: "search.run", query, k: 8, filters }
              : { kind: "search.run", query, k: 8 };
          send(msg);
        }}
      />
      <FilterControls value={filters} onChange={setFilters} />

      {answer && (
        <AnswerCard
          text={answer.text}
          citations={answer.citations}
          playing={playing}
          onPlay={(text) => {
            setPlaying(true);
            send({
              kind: "tts.play",
              text,
              requestId: `tts-${Date.now()}`,
            });
          }}
        />
      )}

      <div className="space-y-3">
        {hits.map((h) => (
          <ResultCard
            key={h.memoryId}
            memoryId={h.memoryId}
            score={h.score}
            snippet={h.snippet}
            tags={h.tags}
          />
        ))}
      </div>
    </main>
  );
}

interface BannerProps {
  banner: { kind: "info" | "success" | "error"; text: string };
  onDismiss: () => void;
}

function Banner({ banner, onDismiss }: BannerProps) {
  const className =
    "rounded-xl px-4 py-2 text-sm " +
    (banner.kind === "error"
      ? "bg-rose-950 text-rose-200 ring-1 ring-rose-900"
      : banner.kind === "success"
        ? "bg-emerald-950 text-emerald-200 ring-1 ring-emerald-900"
        : "bg-slate-800 text-slate-200 ring-1 ring-slate-700");
  const inner = (
    <div className="flex items-center justify-between gap-3">
      <span className="break-words">{banner.text}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="text-xs text-slate-400 hover:text-slate-200"
        aria-label="dismiss"
      >
        ✕
      </button>
    </div>
  );
  // Two static role branches so jsx-a11y/aria-role can resolve them.
  return banner.kind === "error" ? (
    <div role="alert" className={className}>
      {inner}
    </div>
  ) : (
    <div role="status" className={className}>
      {inner}
    </div>
  );
}
