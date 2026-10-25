import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@/": fromRoot("./src/"),
      "server-only": fromRoot("./tests/mocks/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    // Integration tests need local Supabase and run with `pnpm test:integration`.
    exclude: ["node_modules/**", ".next/**", "tests/e2e/**", "tests/integration/**"],
  },
});
