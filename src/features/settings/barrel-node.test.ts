import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

// The offers script (scripts/fetch-offers.ts) runs in plain Node and imports this
// barrel, so nothing it reaches may be a .tsx file (it broke once, 2026-11-05).
it("loads the settings barrel in plain Node", () => {
  const run = spawnSync(
    process.execPath,
    [
      "--experimental-transform-types",
      "--disable-warning=ExperimentalWarning",
      "--import",
      "./scripts/src-paths.mjs",
      "-e",
      'import("@/features/settings").then(() => process.exit(0), (e) => { console.error(e); process.exit(1); })',
    ],
    { encoding: "utf8" },
  );
  expect(run.stderr).not.toContain("ERR_UNKNOWN_FILE_EXTENSION");
  expect(run.status).toBe(0);
}, 20000);
