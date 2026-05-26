import React, { useState } from "react";

export interface CapturePaneProps {
  onSubmitText: (text: string, tags: string[]) => void;
  onSubmitAudio: (audio: Uint8Array, tags: string[]) => void;
}

export function CapturePane({ onSubmitText, onSubmitAudio }: CapturePaneProps) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);

  function startRecording() {
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const buf = new Uint8Array(await blob.arrayBuffer());
        onSubmitAudio(buf, []);
        stream.getTracks().forEach((t) => t.stop());
      };
      r.start();
      setRecorder(r);
      setRecording(true);
    });
  }

  function stopRecording() {
    recorder?.stop();
    setRecorder(null);
    setRecording(false);
  }

  return (
    <section className="rounded-2xl bg-slate-900 p-5 shadow">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
        Capture
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onSubmitText(text.trim(), []);
          setText("");
        }}
      >
        <textarea
          rows={3}
          placeholder="Capture a memory…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full resize-none rounded-xl bg-slate-800 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
        <div className="mt-3 flex gap-2">
          <button
            type="submit"
            className="rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-cyan-400"
          >
            Save
          </button>
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              recording ? "bg-rose-500 text-white" : "bg-slate-700 text-slate-100"
            }`}
          >
            {recording ? "Stop" : "Record"}
          </button>
          <FileImport onAudio={(buf) => onSubmitAudio(buf, [])} />
        </div>
      </form>
    </section>
  );
}

function FileImport({ onAudio }: { onAudio: (b: Uint8Array) => void }) {
  return (
    <label className="cursor-pointer rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-100 hover:bg-slate-600">
      Import audio
      <input
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const buf = new Uint8Array(await file.arrayBuffer());
          onAudio(buf);
          e.target.value = "";
        }}
      />
    </label>
  );
}
