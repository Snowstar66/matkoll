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
