import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LOCATIONS, UNITS } from "@/features/catalog";

// AD-12, AD-19: a pantry item's location is one of the catalog's LOCATIONS and
// its unit one of UNITS. The `check` lists in the pantry migration must be
// exactly those, in the same order, so the database and the domain never
// drift apart.

const migrations = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
const pantryMigration = readdirSync(migrations).filter((name) => /^\d+_pantry\.sql$/.test(name));

function pantrySql(): string {
  if (pantryMigration.length !== 1) {
    throw new Error(
      `Expected exactly one supabase/migrations/<time>_pantry.sql, found ${pantryMigration.length}. It holds the check lists for pantry_item.`,
    );
  }
  return readFileSync(join(migrations, pantryMigration[0]), "utf8");
}

function checkList(sql: string, constraint: string, column: string): string[] {
  const pattern = new RegExp(`constraint ${constraint} check \\(\\s*${column} in \\(([^)]*)\\)\\s*\\)`);
  const match = pattern.exec(sql);
  if (!match) throw new Error(`No check list for ${column} in constraint ${constraint}`);
  return [...match[1].matchAll(/'((?:[^']|'')*)'/g)].map((value) => value[1].replace(/''/g, "'"));
}

describe("pantry check constraints", () => {
  it("has one pantry migration", () => {
    expect(pantryMigration, "supabase/migrations/<time>_pantry.sql").toHaveLength(1);
  });

  it.each([
    ["pantry_item_location_check", "location", LOCATIONS],
    ["pantry_item_unit_check", "unit", UNITS],
  ] as const)("%s lists exactly the domain values", (constraint, column, values) => {
    expect(checkList(pantrySql(), constraint, column)).toEqual([...values]);
  });
});

// add_to_pantry (Story 3.7) refuses an unknown unit or location itself (22023),
// with lists that must equal UNITS and LOCATIONS. Read from the latest
// migration that (re)defines it.
function latestAddToPantry(): { file: string; sql: string } {
  const latest = readdirSync(migrations)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(migrations, file), "utf8") }))
    .filter(({ sql }) => /create (or replace )?function public\.add_to_pantry\(/.test(sql))
    .at(-1);
  if (!latest) throw new Error("No migration defines add_to_pantry");
  return latest;
}

describe("add_to_pantry's input checks", () => {
  it.each([
    ["location", LOCATIONS],
    ["unit", UNITS],
  ] as const)("lists exactly the domain values for item.%s", (column, values) => {
    const { file, sql } = latestAddToPantry();
    const match = new RegExp(`item\\.${column} not in \\(([^)]*)\\)`).exec(sql);
    expect(match, `the ${column} list in ${file}`).not.toBeNull();
    expect([...match![1].matchAll(/'((?:[^']|'')*)'/g)].map((value) => value[1])).toEqual([...values]);
  });
});

// empty_pantry_place (Story 6.3) refuses an unknown location itself (22023),
// with a list that must equal LOCATIONS. Read from the latest migration that
// (re)defines it.
describe("empty_pantry_place's location check", () => {
  it("lists exactly the domain values", () => {
    const latest = readdirSync(migrations)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((file) => ({ file, sql: readFileSync(join(migrations, file), "utf8") }))
      .filter(({ sql }) => /create (or replace )?function public\.empty_pantry_place\(/.test(sql))
      .at(-1);
    expect(latest, "a migration that defines empty_pantry_place").toBeDefined();
    const match = /place not in \(([^)]*)\)/.exec(latest!.sql);
    expect(match, `the location list in ${latest!.file}`).not.toBeNull();
    expect([...match![1].matchAll(/'((?:[^']|'')*)'/g)].map((value) => value[1])).toEqual([...LOCATIONS]);
  });
});
