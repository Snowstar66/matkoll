import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { defaultSiteName, maxSiteNameChars, normalizeSiteName } from "@/features/pantry/domain/site";
import { refusedCodePoints } from "@/lib/one-line";

// AD-12 pattern, AD-24, Story 8.1: pantry_site_name_check has the domain's
// length limit and refuses exactly refusedCodePoints (src/lib/one-line.ts),
// and the literal 'Hemma' and 'hemma' that the migration and
// pantry_selected_site() store are defaultSiteName and its normalized name,
// the only names SQL writes itself (normalizeSiteName is the only
// normalization). Each is read from the latest migration that defines it;
// tests/integration/pantry-site.test.ts covers the same rules against the
// table.

const migrations = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));

function sqlFiles(): { file: string; sql: string }[] {
  return readdirSync(migrations)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(migrations, file), "utf8") }));
}

/** The latest migration whose SQL matches `pattern`. */
function latest(pattern: RegExp): { file: string; sql: string } {
  const found = sqlFiles()
    .filter(({ sql }) => pattern.test(sql))
    .at(-1);
  if (!found) throw new Error(`No migration matches ${pattern}`);
  return found;
}

/** The constraint's body in the latest migration that defines it, from `check (` to the matching `)`. */
function latestCheck(name: string): { file: string; body: string } {
  const { file, sql } = latest(new RegExp(`constraint ${name} check \\(`));
  const start = sql.lastIndexOf(`constraint ${name} check (`);
  let depth = 0;
  for (let index = sql.indexOf("(", start); index < sql.length; index += 1) {
    if (sql[index] === "(") depth += 1;
    if (sql[index] === ")") depth -= 1;
    if (depth === 0) return { file, body: sql.slice(start, index + 1) };
  }
  throw new Error(`Unbalanced ${name}`);
}

/** The code points a `name !~ '[...]'` bracket lists, from its \xHH and \uHHHH escapes and ranges. */
function bracketCodePoints(body: string): number[] {
  const match = /name !~ '\[([^\]]*)\]'/.exec(body);
  if (!match) throw new Error("No refused bracket for name");
  const tokens = [...match[1].matchAll(/\\x([0-9a-f]{2})|\\u([0-9a-f]{4})|(-)/gi)];
  const codes: number[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const [, x, u, dash] = tokens[index];
    if (dash) {
      const [, x2, u2] = tokens[index + 1];
      const end = Number.parseInt(x2 ?? u2, 16);
      for (let code = codes.at(-1)! + 1; code <= end; code += 1) codes.push(code);
      index += 1;
    } else {
      codes.push(Number.parseInt(x ?? u, 16));
    }
  }
  return codes;
}

const hex = (code: number) => `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
const refused = refusedCodePoints.flatMap(([from, to]) => Array.from({ length: to - from + 1 }, (_, i) => from + i));

describe("pantry_site_name_check", () => {
  it("limits the name to maxSiteNameChars", () => {
    const { file, body } = latestCheck("pantry_site_name_check");
    const limit = /char_length\(name\) <= (\d+)/.exec(body);
    expect(limit, `the limit in ${file}`).not.toBeNull();
    expect(Number(limit![1]), file).toBe(maxSiteNameChars);
  });

  it("refuses exactly refusedCodePoints", () => {
    const { file, body } = latestCheck("pantry_site_name_check");
    expect(bracketCodePoints(body).map(hex), file).toEqual(refused.map(hex));
  });

  it("refuses a name that is empty or not trimmed", () => {
    const { file, body } = latestCheck("pantry_site_name_check");
    expect(body, file).toContain("btrim(name) <> ''");
    expect(body, file).toContain("name = btrim(name)");
  });
});

describe("the default place's name in SQL", () => {
  const files = [
    latest(/insert into public\.pantry_site \(user_id, name, normalized_name, is_selected\)\s+select/),
    latest(/create (or replace )?function public\.pantry_selected_site\(/),
  ];

  it.each(files.map(({ file, sql }) => [file, sql] as const))(
    "is defaultSiteName and normalizeSiteName(defaultSiteName) in %s",
    (file, source) => {
      // Comments may name it; only the SQL counts.
      const sql = source.replace(/--.*$/gm, "");
      // Every name SQL stores itself: the pair before `true` (is_selected) in the backfill and in pantry_selected_site.
      const pairs = [...sql.matchAll(/'([^']*)', '([^']*)', true\)?/g)].map((match) => [match[1], match[2]]);
      expect(pairs.length, file).toBeGreaterThanOrEqual(1);
      for (const pair of pairs) expect(pair, file).toEqual([defaultSiteName, normalizeSiteName(defaultSiteName)]);
      // No other spelling of the name anywhere in the file.
      const literals = [...sql.matchAll(/'(hemma)'/gi)].map((match) => match[1]);
      expect(literals.length, file).toBe(pairs.length * 2);
    },
  );
});
