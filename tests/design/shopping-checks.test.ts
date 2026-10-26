import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UNITS } from "@/features/catalog";
import { maxLineKeyChars } from "@/features/shopping";

// AD-8, AD-12: shopping_check_line_key_check takes the keys line-key.ts
// builds. Its unit alternation must be exactly UNITS and `-` (a vague line),
// in the same order, and its limit for a `t:` key maxLineKeyChars, so the
// database and lineKeySchema never drift apart. The constraint is read from
// the latest migration that (re)defines it.

const constraint = "shopping_check_line_key_check";
const migrations = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));

function latestDefinition(): { file: string; sql: string } {
  const defining = readdirSync(migrations)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(migrations, file), "utf8") }))
    .filter(({ sql }) => new RegExp(`(add )?constraint ${constraint} check`).test(sql));
  const latest = defining.at(-1);
  if (!latest) throw new Error(`No migration defines ${constraint}`);
  return latest;
}

/** The constraint's body, from `check (` to the matching `)`. */
function constraintBody(sql: string): string {
  const start = sql.lastIndexOf(`constraint ${constraint} check (`);
  let depth = 0;
  for (let index = sql.indexOf("(", start); index < sql.length; index += 1) {
    if (sql[index] === "(") depth += 1;
    if (sql[index] === ")") depth -= 1;
    if (depth === 0) return sql.slice(start, index + 1);
  }
  throw new Error(`Unbalanced ${constraint}`);
}

describe("shopping_check line key constraint", () => {
  it("lists exactly UNITS and - for a recipe line's key", () => {
    const { file, sql } = latestDefinition();
    const units = /'\^r:[^']*:\(([^)]*)\)\$'/.exec(constraintBody(sql));
    expect(units, `the r: pattern in ${file}`).not.toBeNull();
    expect(units![1].split("|")).toEqual([...UNITS, "-"]);
  });

  it("limits a text key to maxLineKeyChars", () => {
    const { file, sql } = latestDefinition();
    const limit = /char_length\(line_key\) <= (\d+)/.exec(constraintBody(sql));
    expect(limit, `the t: limit in ${file}`).not.toBeNull();
    expect(Number(limit![1])).toBe(maxLineKeyChars);
  });
});
