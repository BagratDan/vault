// Minimal synthetic WS client that drives a real capture + search against the
// live sidecar. No browser involved. Pulls the WS auth token from disk.
import { WebSocket } from "ws";
import fs from "node:fs";

const token = fs.readFileSync("/tmp/vault-live/.ws-token", "utf-8").trim();
console.log("token:", token.slice(0, 12) + "…");

const ws = new WebSocket(`ws://127.0.0.1:7421/ws?token=${token}`);

ws.on("open", () => {
  console.log("OPEN ✓");
  console.log("→ capture.text");
  ws.send(
    JSON.stringify({
      kind: "capture.text",
      text: "Sarah promised to ship the migration by Friday.",
      tags: ["commitment"],
    })
  );
});

let captureAcked = false;

ws.on("message", (data) => {
  const raw = String(data);
  const msg = JSON.parse(raw);
  console.log("←", msg.kind ?? "(unknown)", JSON.stringify(msg).slice(0, 200));
  if (msg.kind === "capture.ack" && !captureAcked) {
    captureAcked = true;
    console.log("→ search.run (after capture.ack)");
    setTimeout(() => {
      ws.send(
        JSON.stringify({
          kind: "search.run",
          query: "what did Sarah commit to",
          k: 4,
        })
      );
    }, 500);
  }
});

ws.on("error", (e) => console.error("WS ERROR:", e.message));
ws.on("close", (code, reason) => console.log("CLOSE", code, String(reason)));

const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes — first capture loads LLM + embed model
setTimeout(() => {
  console.log("--- timeout, closing ---");
  ws.close();
  process.exit(0);
}, TIMEOUT_MS);
