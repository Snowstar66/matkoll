import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UNITS } from "@/features/catalog";
import { SOURCE_KINDS, draftLimits } from "@/features/recipes";

// AD-10, AD-12: a recipe line's unit is one of the catalog's UNITS, and a
// recipe's source kind one of RecipeDraft's SOURCE_KINDS. The `check` lists in
// the recipes migration must be exactly those, in the same order, so the
// database and the domain never drift apart.

const migrations = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
const recipesMigration = readdirSync(migrations).filter((name) => /^\d+_recipes\.sql$/.test(name));
const hardeningMigration = readdirSync(migrations).filter((name) => /^\d+_recipes_hardening\.sql$/.test(name));
const updateMigration = readdirSync(migrations).filter((name) => /^\d+_recipes_update_conflict\.sql$/.test(name));

function recipesSql(): string {
  if (recipesMigration.length !== 1) {
    throw new Error(
      `Expected exactly one supabase/migrations/<time>_recipes.sql, found ${recipesMigration.length}. It holds the check lists for recipe and recipe_ingredient.`,
    );
  }
  return readFileSync(join(migrations, recipesMigration[0]), "utf8");
}

function hardeningSql(): string {
  if (hardeningMigration.length !== 1) {
    throw new Error(`Expected exactly one supabase/migrations/<time>_recipes_hardening.sql, found ${hardeningMigration.length}.`);
  }
  return readFileSync(join(migrations, hardeningMigration[0]), "utf8");
}

function updateSql(): string {
  if (updateMigration.length !== 1) {
    throw new Error(`Expected exactly one supabase/migrations/<time>_recipes_update_conflict.sql, found ${updateMigration.length}.`);
  }
  return readFileSync(join(migrations, updateMigration[0]), "utf8");
}

/** The number in `constraint <name> check (char_length(<column>) <= <n>)`. */
function lengthLimit(sql: string, constraint: string, column: string): number {
  const match = new RegExp(`constraint ${constraint} check \\(char_length\\(${column}\\) <= (\\d+)\\)`).exec(sql);
  if (!match) throw new Error(`No length check for ${column} in constraint ${constraint}`);
  return Number(match[1]);
}

/** The number in save_recipe's `jsonb_array_length(<list>) > <n>`. */
function countLimit(sql: string, list: string): number {
  const match = new RegExp(`jsonb_array_length\\(${list}\\) > (\\d+)`).exec(sql);
  if (!match) throw new Error(`No count limit for ${list} in save_recipe`);
  return Number(match[1]);
}

function checkList(sql: string, constraint: string, column: string): string[] {
  const pattern = new RegExp(`constraint ${constraint} check \\(\\s*${column} in \\(([^)]*)\\)\\s*\\)`);
  const match = pattern.exec(sql);
  if (!match) throw new Error(`No check list for ${column} in constraint ${constraint}`);
  return [...match[1].matchAll(/'((?:[^']|'')*)'/g)].map((value) => value[1].replace(/''/g, "'"));
}

describe("recipe check constraints", () => {
  it("has one recipes migration", () => {
    expect(recipesMigration, "supabase/migrations/<time>_recipes.sql").toHaveLength(1);
  });

  it.each([
    ["recipe_ingredient_unit_check", "unit", UNITS],
    ["recipe_source_kind_check", "source_kind", SOURCE_KINDS],
  ] as const)("%s lists exactly the domain values", (constraint, column, values) => {
    expect(checkList(recipesSql(), constraint, column)).toEqual([...values]);
  });

  it.each([
    ["recipe_title_length_check", "title", draftLimits.titleChars],
    ["recipe_source_url_length_check", "source_url", draftLimits.urlChars],
    ["recipe_image_url_length_check", "image_url", draftLimits.urlChars],
    ["recipe_step_text_length_check", "text", draftLimits.stepChars],
    ["recipe_ingredient_original_text_length_check", "original_text", draftLimits.originalTextChars],
  ] as const)("%s has the draft's limit", (constraint, column, limit) => {
    expect(lengthLimit(hardeningSql(), constraint, column)).toBe(limit);
  });

  it("save_recipe takes as many steps and lines as a draft", () => {
    expect(countLimit(hardeningSql(), "steps")).toBe(draftLimits.steps);
    expect(countLimit(hardeningSql(), "lines")).toBe(draftLimits.lines);
  });

  it("update_recipe (its latest definition) takes as many steps and lines as a draft", () => {
    expect(countLimit(updateSql(), "steps")).toBe(draftLimits.steps);
    expect(countLimit(updateSql(), "lines")).toBe(draftLimits.lines);
  });
});
