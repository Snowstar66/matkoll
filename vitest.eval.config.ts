import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// `pnpm eval:ai`: runs the AI test set in tests/fixtures/ai/ against the real
// AI_PROVIDER and writes tests/eval/report.md. Run by hand when the provider or
// model changes; never part of `pnpm test` or CI. `pnpm eval:ai` loads .env.local.
export default defineConfig({
  resolve: {
    alias: {
      "@/": fromRoot("./src/"),
      "server-only": fromRoot("./tests/mocks/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/eval/**/*.eval.ts"],
    // One local model: one case at a time. A case may use the port's whole 115 s budget, and a
    // photo's case then its lookup of the points (Story 6.6: one attempt of 30 s after a health check).
    fileParallelism: false,
    testTimeout: 170_000,
    hookTimeout: 30_000,
    env: {
      // LM Studio's local server, unless .env.local or the shell says otherwise.
      LMSTUDIO_BASE_URL: process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v1",
    },
  },
});
