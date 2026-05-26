import React, { useEffect, useMemo, useRef, useState } from "react";
import { createWsClient } from "./ws-client.js";
import { CapturePane } from "./components/CapturePane.js";
import { SearchBar } from "./components/SearchBar.js";
import { ResultCard } from "./components/ResultCard.js";
import { AnswerCard } from "./components/AnswerCard.js";
import { FilterControls, type Filters } from "./components/FilterControls.js";
import { ModelStatus } from "./components/ModelStatus.js";
import type { Hit, Citation, ClientMessage } from "./types.js";

export function App() {
  const ws = useMemo(() => {
    if (typeof window === "undefined") return null;
    return createWsClient({ url: `ws://${window.location.host}/ws` });
  }, []);
  const [hits, setHits] = useState<Hit[]>([]);
  const [answer, setAnswer] = useState<{ text: string; citations: Citation[] } | null>(
    null
  );
  const [filters, setFilters] = useState<Filters>({});
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!ws) return;
    return ws.onMessage((m) => {
      if (m.kind === "search.hits") {
        setHits(m.hits);
      } else if (m.kind === "answer.chunk") {
        setAnswer({ text: m.text, citations: [] });
      } else if (m.kind === "answer.done") {
        setAnswer((prev) => (prev ? { ...prev, citations: m.citations } : null));
      } else if (m.kind === "tts.chunk") {
        const bytes = Uint8Array.from(atob(m.audioBase64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        if (!audioRef.current) audioRef.current = new Audio();
        audioRef.current.src = url;
        void audioRef.current.play();
      } else if (m.kind === "tts.done") {
        setPlaying(false);
      }
    });
  }, [ws]);

  const send = (msg: ClientMessage) => ws?.send(msg);

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Vault</h1>
        <ModelStatus state="ready" />
      </header>

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
