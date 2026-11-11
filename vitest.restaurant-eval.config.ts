import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// `pnpm eval:restaurant`: Restaurangagentens webbsökning (tests/eval/restaurant.eval.ts), riktiga AI-anrop, aldrig en del av CI.
export default defineConfig({
  resolve: { alias: { "@/": fromRoot("./src/"), "server-only": fromRoot("./tests/mocks/server-only.ts") } },
  test: { environment: "node", include: ["tests/eval/restaurant.eval.ts"], fileParallelism: false, testTimeout: 900_000 },
});
