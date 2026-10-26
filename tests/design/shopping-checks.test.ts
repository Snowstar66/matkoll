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

// AD-12, AD-19: an own item's unit is one of UNITS. The check list in the
// shopping_custom_item migration must be exactly UNITS, in the same order.
describe("shopping_custom_item unit constraint", () => {
  it("lists exactly UNITS", () => {
    const files = readdirSync(migrations).filter((name) => /^\d+_shopping_custom_item\.sql$/.test(name));
    expect(files, "supabase/migrations/<time>_shopping_custom_item.sql").toHaveLength(1);
    const sql = readFileSync(join(migrations, files[0]), "utf8");
    const match = /constraint shopping_custom_item_unit_check check \(\s*unit in \(([^)]*)\)\s*\)/.exec(sql);
    expect(match, "shopping_custom_item_unit_check").not.toBeNull();
    expect([...match![1].matchAll(/'([^']*)'/g)].map((value) => value[1])).toEqual([...UNITS]);
  });
});

// AD-22, Story 3.5: set_current_meal_plan deletes an empty current plan on a
// switch, and a plan counts as empty only without dishes and own items. The
// function is rewritten by whole-body migrations, so the newest one that
// defines it must still look at shopping_custom_item.
describe("set_current_meal_plan", () => {
  it("counts own items in the newest definition's emptiness rule", () => {
    const defining = readdirSync(migrations)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((file) => ({ file, sql: readFileSync(join(migrations, file), "utf8") }))
      .filter(({ sql }) => /create (or replace )?function public\.set_current_meal_plan\(/.test(sql));
    const latest = defining.at(-1);
    expect(latest, "a migration defining set_current_meal_plan").toBeDefined();
    const start = latest!.sql.search(/create (or replace )?function public\.set_current_meal_plan\(/);
    const body = latest!.sql.slice(start, latest!.sql.indexOf("$$;", start));
    expect(body, latest!.file).toMatch(/exists \(select 1 from public\.shopping_custom_item/);
  });
});

// AD-8, AD-12, Story 3.6: shopping_line_override takes a recipe line's key
// (`r:` with UNITS or `-`, or `t:` up to maxLineKeyChars), and an amount only
// on a key with one of UNITS. Read from the latest migration that defines each.
describe("shopping_line_override constraints", () => {
  function body(name: string): { file: string; body: string } {
    const defining = readdirSync(migrations)
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .map((file) => ({ file, sql: readFileSync(join(migrations, file), "utf8") }))
      .filter(({ sql }) => sql.includes(`constraint ${name} check (`));
    const latest = defining.at(-1);
    if (!latest) throw new Error(`No migration defines ${name}`);
    const start = latest.sql.lastIndexOf(`constraint ${name} check (`);
    let depth = 0;
    for (let index = latest.sql.indexOf("(", start); index < latest.sql.length; index += 1) {
      if (latest.sql[index] === "(") depth += 1;
      if (latest.sql[index] === ")") depth -= 1;
      if (depth === 0) return { file: latest.file, body: latest.sql.slice(start, index + 1) };
    }
    throw new Error(`Unbalanced ${name}`);
  }
  const units = (sql: string) => /'\^r:[^']*:\(([^)]*)\)\$'/.exec(sql)?.[1].split("|");

  it("takes a recipe line's key with exactly UNITS and -, and a text key up to maxLineKeyChars, never c:", () => {
    const { file, body: sql } = body("shopping_line_override_line_key_check");
    expect(units(sql), file).toEqual([...UNITS, "-"]);
    expect(Number(/char_length\(line_key\) <= (\d+)/.exec(sql)?.[1]), file).toBe(maxLineKeyChars);
    expect(sql, file).not.toContain("'^c:");
  });

  it("takes an amount only on a key with exactly UNITS", () => {
    const { file, body: sql } = body("shopping_line_override_amount_key_check");
    expect(units(sql), file).toEqual([...UNITS]);
  });
});
