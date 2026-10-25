import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Integration tests against local Supabase (`pnpm db:start`). `pnpm test:integration`
// loads .env.local; CI writes it with `pnpm db:env`.
export default defineConfig({
  resolve: {
    alias: {
      "@/": fromRoot("./src/"),
      "server-only": fromRoot("./tests/mocks/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // The files share one Supabase instance; run them one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
