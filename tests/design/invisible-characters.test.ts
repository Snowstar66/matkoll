import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Source never holds invisible characters literally (review of Story 7.2):
// a regex or a check that refuses the line separators, bidi controls or
// zero-width marks writes them as \uXXXX escapes, so a reader sees what is
// refused and an editor cannot drop or reorder them unseen. Built from code
// points, so this file holds none either.

const root = fileURLToPath(new URL("../../", import.meta.url));
const scanned = ["supabase/migrations", "src", "tests"];

/** U+061C, U+200B–U+200F, U+2028, U+2029, U+202A–U+202E, U+2066–U+2069 and U+FEFF. */
const invisible = new Set([
  0x061c,
  0xfeff,
  ...Array.from({ length: 5 }, (_, i) => 0x200b + i),
  0x2028,
  0x2029,
  ...Array.from({ length: 5 }, (_, i) => 0x202a + i),
  ...Array.from({ length: 4 }, (_, i) => 0x2066 + i),
]);

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return /\.(sql|ts|tsx|js|mjs|css|md|json)$/.test(name) ? [path] : [];
  });
}

describe("invisible characters", () => {
  it("are never written literally in migrations, src or tests", () => {
    const found: string[] = [];
    for (const directory of scanned) {
      for (const file of filesUnder(join(root, directory))) {
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, index) => {
          for (const char of line) {
            const code = char.codePointAt(0)!;
            if (invisible.has(code)) found.push(`${relative(root, file)}:${index + 1} U+${code.toString(16).toUpperCase().padStart(4, "0")}`);
          }
        });
      }
    }
    expect(found).toEqual([]);
  });
});
