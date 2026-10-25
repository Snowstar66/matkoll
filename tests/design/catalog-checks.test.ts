import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LOCATIONS, SECTIONS, UNITS } from "@/features/catalog";

// AD-12: units, sections and locations are Zod enums in catalog/domain and
// `check` lists in the database. The lists in the catalog migration must be
// exactly the domain's, in the same order, so the two never drift apart.

const migrations = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
const catalogMigration = readdirSync(migrations).filter((name) => /^\d+_catalog\.sql$/.test(name));

/** The catalog migration's SQL; fails with a clear message when the file is missing. */
function catalogSql(): string {
  if (catalogMigration.length !== 1) {
    throw new Error(
      `Expected exactly one supabase/migrations/<time>_catalog.sql, found ${catalogMigration.length}. It holds the check lists for ingredient.`,
    );
  }
  return readFileSync(join(migrations, catalogMigration[0]), "utf8");
}

function checkList(sql: string, constraint: string, column: string): string[] {
  const pattern = new RegExp(`constraint ${constraint} check \\(\\s*${column} in \\(([^)]*)\\)\\s*\\)`);
  const match = pattern.exec(sql);
  if (!match) throw new Error(`No check list for ${column} in constraint ${constraint}`);
  return [...match[1].matchAll(/'((?:[^']|'')*)'/g)].map((value) => value[1].replace(/''/g, "'"));
}

describe("catalog check constraints", () => {
  it("has one catalog migration", () => {
    expect(catalogMigration, "supabase/migrations/<time>_catalog.sql").toHaveLength(1);
  });

  it.each([
    ["ingredient_section_check", "section", SECTIONS],
    ["ingredient_location_check", "location", LOCATIONS],
    ["ingredient_default_unit_check", "default_unit", UNITS],
  ] as const)("%s lists exactly the domain values", (constraint, column, values) => {
    expect(checkList(catalogSql(), constraint, column)).toEqual([...values]);
  });
});
