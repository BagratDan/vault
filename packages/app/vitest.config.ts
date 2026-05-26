import { defineConfig } from "vitest/config";
import path from "node:path";

// Resolve @vault/* packages from their src/ rather than dist/ so that
// vi.mock("@qvac/sdk") in integration tests substitutes the SDK across
// the entire workspace dep graph (transitive imports from @vault/ai,
// @vault/retrieval, etc. all resolve via the same module graph).
export default defineConfig({
  resolve: {
    alias: {
      "@vault/domain": path.resolve(__dirname, "../domain/src/index.ts"),
      "@vault/ai": path.resolve(__dirname, "../ai/src/index.ts"),
      "@vault/retrieval": path.resolve(__dirname, "../retrieval/src/index.ts"),
      "@vault/sync": path.resolve(__dirname, "../sync/src/index.ts"),
      "@vault/net": path.resolve(__dirname, "../net/src/index.ts"),
    },
  },
});
