import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// AD-19, AD-24, Story 8.1: the pantry is never summed over places. Every
// `.from("pantry_item")` in src/ either filters on the place
// (`.eq("site_id", …)`) or is in the allow-list below, with its reason. And
// no code in src/ inserts, upserts or updates pantry_item directly: every
// write goes through the pantry's Postgres functions, which always set
// site_id, so the column default can never stand in for a forgotten place.

const root = fileURLToPath(new URL("../../", import.meta.url));

/** Files whose pantry_item access needs no place filter, and why. */
const allowed: Record<string, string> = {
  // Deletes one row by its id (unique over all places) for removePantryItem,
  // and returns it with its site_id for "Ångra".
  "src/features/pantry/data/remove.ts": "delete by id",
};

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Each `.from("pantry_item")` chain in the file: from the call to the end of its statement. */
function pantryItemChains(source: string): string[] {
  const chains: string[] = [];
  for (const match of source.matchAll(/\.from\(\s*["']pantry_item["']\s*\)/g)) {
    const end = source.indexOf(";", match.index);
    chains.push(source.slice(match.index, end === -1 ? undefined : end));
  }
  return chains;
}

const files = sourceFiles(join(root, "src")).map((path) => ({
  file: relative(root, path),
  source: readFileSync(path, "utf8"),
}));

describe("pantry_item in src/", () => {
  it("is read only with a place filter, outside the allow-list", () => {
    const unfiltered = files.flatMap(({ file, source }) =>
      file in allowed
        ? []
        : pantryItemChains(source)
            .filter((chain) => !/\.eq\(\s*["']site_id["']/.test(chain))
            .map((chain) => `${file}: ${chain.slice(0, 80)}`),
    );
    expect(unfiltered).toEqual([]);
  });

  it("is read somewhere, so the check above has something to check", () => {
    expect(files.some(({ source }) => pantryItemChains(source).length > 0)).toBe(true);
  });

  it("is never inserted, upserted or updated directly", () => {
    const writes = files.flatMap(({ file, source }) =>
      pantryItemChains(source)
        .filter((chain) => /\.(insert|upsert|update)\(/.test(chain))
        .map((chain) => `${file}: ${chain.slice(0, 80)}`),
    );
    expect(writes).toEqual([]);
  });
});
