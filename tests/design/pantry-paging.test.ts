import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { pantryPageSize } from "@/features/pantry/data/queries";

// The pantry's reads fetch pages of pantryPageSize rows and stop at the first
// shorter page. If the API's row limit (max_rows) were smaller, every page
// would be short and the reads would silently stop after the first one.

const configPath = fileURLToPath(new URL("../../supabase/config.toml", import.meta.url));

/** `max_rows` in the `[api]` section of supabase/config.toml. */
function apiMaxRows(): number {
  const config = readFileSync(configPath, "utf8");
  const api = /^\[api\]\s*$([\s\S]*?)(?=^\[)/m.exec(config);
  if (!api) throw new Error("No [api] section in supabase/config.toml");
  const match = /^max_rows\s*=\s*(\d+)\s*$/m.exec(api[1]);
  if (!match) throw new Error("No max_rows in the [api] section of supabase/config.toml");
  return Number(match[1]);
}

describe("pantry paging", () => {
  it("asks for at most the API's row limit per page", () => {
    expect(apiMaxRows()).toBeGreaterThanOrEqual(pantryPageSize);
  });
});
