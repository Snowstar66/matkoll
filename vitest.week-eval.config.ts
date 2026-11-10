import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// `pnpm eval:week`: the week agent's planning eval (tests/eval/week-plan.eval.ts), real AI calls, never part of CI.
export default defineConfig({
  resolve: { alias: { "@/": fromRoot("./src/"), "server-only": fromRoot("./tests/mocks/server-only.ts") } },
  test: { environment: "node", include: ["tests/eval/week-plan.eval.ts"], fileParallelism: false, testTimeout: 3_600_000 },
});
