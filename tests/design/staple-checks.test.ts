import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeIngredientText } from "@/features/catalog";
import { parseStapleLimit, STAPLE_UNITS } from "@/features/pantry";

// Basvaror: the default list lives in the database (household_staple_defaults()),
// the matching in the app (normalizeIngredientText). Each default's
// normalized_name must be what the app makes of its name, or it would never
// match, and the units the table allows must be the app's.

const migrations = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
const file = readdirSync(migrations).filter((name) => /^\d+_household_staple\.sql$/.test(name));

function sql(): string {
  if (file.length !== 1) throw new Error(`Expected one supabase/migrations/<time>_household_staple.sql, found ${file.length}`);
  return readFileSync(join(migrations, file[0]), "utf8");
}

/** The rows of household_staple_defaults(): name, normalized name, amount and unit. */
function defaults(): [string, string, string, string][] {
  const body = /create function public\.household_staple_defaults\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/.exec(sql())?.[1] ?? "";
  return [...body.matchAll(/\('([^']+)', '([^']+)', ([^,]+), ([^)]+)\)/g)].map((row) => [row[1], row[2], row[3].trim(), row[4].trim()]);
}

describe("Basvaror's defaults", () => {
  it("has the list Pontus asked for", () => {
    const names = defaults().map(([name]) => name);
    for (const name of ["Vatten", "Salt", "Svartpeppar", "Socker", "Vetemjöl", "Smör", "Olivolja", "Rapsolja"]) expect(names).toContain(name);
  });

  it("stores each name normalised as the app normalises it", () => {
    for (const [name, normalized] of defaults()) expect(normalizeIngredientText(name), name).toBe(normalized);
  });

  it("gives each limit as the app reads one", () => {
    for (const [name, , amount, unit] of defaults()) {
      if (amount.startsWith("null")) {
        expect(unit, name).toMatch(/^null/);
        continue;
      }
      expect(parseStapleLimit(`${amount} ${unit.replace(/'/g, "")}`), name).not.toBeNull();
    }
  });

  it("allows exactly the app's units", () => {
    const list = /max_unit in \(([^)]*)\)/.exec(sql())?.[1] ?? "";
    expect([...list.matchAll(/'([^']+)'/g)].map((match) => match[1])).toEqual([...STAPLE_UNITS]);
  });
});
