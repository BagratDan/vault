export * from "./config.js";
export * from "./vault-fs.js";
export * from "./identity.js";
export * from "./messages.js";
export * from "./ws-bridge.js";
export * from "./start.js";

import { startVault } from "./start.js";

// CLI entry: `node packages/app/dist/index.js` (or `tsx watch src/index.ts`)
if (import.meta.url === `file://${process.argv[1]}`) {
  startVault()
    .then(({ port, peerId }) => {
      // eslint-disable-next-line no-console
      console.log(`[vault] sidecar listening on 127.0.0.1:${port} (peerId=${peerId})`);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[vault] failed to start:", err);
      process.exit(1);
    });
}
