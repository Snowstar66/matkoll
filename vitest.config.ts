import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Integration tests need local Supabase and run with `pnpm test:integration`.
const exclude = ["node_modules/**", ".next/**", "tests/e2e/**", "tests/integration/**"];

export default defineConfig({
  resolve: {
    alias: {
      "@/": fromRoot("./src/"),
      "server-only": fromRoot("./tests/mocks/server-only.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
          exclude,
        },
      },
      {
        // Component tests (*.test.tsx) run in jsdom with Testing Library.
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["src/**/*.test.tsx", "tests/**/*.test.tsx"],
          exclude,
          setupFiles: ["./tests/setup/jsdom.ts"],
        },
      },
    ],
  },
});
