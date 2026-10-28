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

// Story 10.4: the migrations that give catalog names an uppercase first
// letter. catalog_name_capital changed the names of the time; catalog_name_rule
// adds the rule as public.catalog_display_name (the same as catalogName in
// catalog/domain/name.ts, run on the same cases in
// tests/integration/catalog.test.ts), a trigger that keeps it for every write,
// and applies it to the names before it. Both change only `name`, need
// PostgreSQL 17 for the collation pg_c_utf8, and name it wherever case is
// mapped, so å, ä and ö work whatever the database's own collation is.
// Their results were checked against the local database (spec-10-4).

/** The one migration whose name ends in `suffix`, without comment lines. */
function migrationSql(suffix: string): string {
  const files = readdirSync(migrations).filter((name) => name.endsWith(`_${suffix}.sql`));
  if (files.length !== 1) throw new Error(`Expected one supabase/migrations/<time>_${suffix}.sql, found ${files.length}`);
  return readFileSync(join(migrations, files[0]), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

/** The SQL with runs of white space as one space. */
const flat = (sql: string) => sql.replace(/\s+/g, " ").trim();

const pg17Guard = flat(`if current_setting('server_version_num')::int < 170000 then raise exception`);

describe("catalog_name_capital", () => {
  it("stops below PostgreSQL 17", () => {
    expect(flat(migrationSql("catalog_name_capital"))).toContain(pg17Guard);
  });

  it("changes only the first character of name, where it is a lower-case letter", () => {
    const update = flat(migrationSql("catalog_name_capital")).replace(/^.*?(?=update )/, "");
    expect(update).toBe(
      flat(`update public.ingredient
        set name = upper(left(name, 1) collate "pg_c_utf8") || substr(name, 2)
        where left(name, 1) collate "pg_c_utf8" <> upper(left(name, 1) collate "pg_c_utf8")
          and left(name, 1) collate "pg_c_utf8" = lower(left(name, 1) collate "pg_c_utf8");`),
    );
  });
});

describe("catalog_name_rule", () => {
  const sql = () => flat(migrationSql("catalog_name_rule"));

  it("stops below PostgreSQL 17, and reads the name in the collation pg_c_utf8", () => {
    expect(sql()).toContain(pg17Guard);
    expect(sql()).toContain(`value text := name_text collate "pg_c_utf8";`);
  });

  it("keeps the rule with a trigger on every insert and change of name", () => {
    expect(sql()).toContain(
      flat(`create trigger ingredient_display_name
        before insert or update of name on public.ingredient
        for each row
        execute function public.ingredient_display_name();`),
    );
    expect(sql()).toContain("new.name := public.catalog_display_name(new.name);");
  });

  it("changes only the names whose result differs, and nothing else", () => {
    const update = sql().replace(/^.*(?=update public\.ingredient)/, "");
    expect(update).toBe(
      flat(`update public.ingredient
        set name = public.catalog_display_name(name)
        where name <> public.catalog_display_name(name);`),
    );
    expect(sql()).not.toMatch(/normalized_name|delete from|insert into/i);
  });
});
