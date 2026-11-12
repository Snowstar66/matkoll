import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  recipeImageBucket,
  recipeImageHouseholdCap,
  recipeImageMaxFileBytes,
  recipeImageMediaTypes,
  recipeImageSides,
} from "@/features/recipes/domain/recipe-image";
import { recipeImageLimits } from "@/server/images";

// Recipe pictures in the app's own storage: the migration, the domain and the
// image maker must say the same, and the migration must only add (AD-5).
// tests/integration/recipe-images.test.ts tries the policies against Storage.

const migrations = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
const files = readdirSync(migrations).filter((name) => /^\d+_recipe_images\.sql$/.test(name));
const sql = () => {
  if (files.length !== 1) throw new Error(`Expected exactly one supabase/migrations/<time>_recipe_images.sql, found ${files.length}.`);
  return readFileSync(join(migrations, files[0]!), "utf8");
};
/** The migration without its comments. */
const code = () => sql().replace(/^--.*$/gm, "");

describe("recipe images migration", () => {
  it("has a version above the migrations before it", () => {
    expect(Number(files[0]!.split("_")[0])).toBeGreaterThan(20261111140000);
  });

  it("only adds: no drop of a table, column, function or bucket, no rename, no delete from storage", () => {
    const text = code().toLowerCase();
    expect(text).not.toMatch(/\bdrop\s+(table|column|function|schema|view|index|type)\b/);
    expect(text).not.toMatch(/\balter\s+table\b[^;]*\b(rename|drop\s+column)\b/);
    expect(text).not.toMatch(/\bdelete\s+from\b/);
    expect(text).not.toMatch(/\btruncate\b/);
    // The only drops are of its own policies, constraint and trigger, so it can run again.
    for (const match of text.matchAll(/\bdrop\s+(\w+)\s+(?:if\s+exists\s+)?([\w.]+)/g)) {
      expect(["policy", "constraint", "trigger"], `drop ${match[1]} ${match[2]}`).toContain(match[1]);
      expect(match[2], `drop ${match[1]}`).toMatch(/^(recipe_images_|recipe_image_)/);
    }
  });

  it("makes the private bucket with the domain's name, size and types", () => {
    const text = sql();
    expect(text).toContain(`'${recipeImageBucket}', '${recipeImageBucket}', false, ${Math.round(recipeImageMaxFileBytes)}`);
    expect(text).toContain(`array[${recipeImageMediaTypes.map((type) => `'${type}'`).join(", ")}]`);
  });

  it("has the domain's cap in recipe_image_household_cap", () => {
    const match = /function public\.recipe_image_household_cap\(\)[\s\S]*?select (\d+);/.exec(sql());
    expect(Number(match?.[1])).toBe(recipeImageHouseholdCap);
  });

  it("ties image_path to the row's own household and id", () => {
    expect(code()).toMatch(/check \(image_path is null or image_path = household_id::text \|\| '\/' \|\| id::text\)/);
  });

  it("lets only the household's members read, add and remove, and nobody update in place", () => {
    const text = code();
    expect(text).toMatch(/create policy recipe_images_select on storage\.objects\s+for select to authenticated/);
    expect(text).toMatch(/create policy recipe_images_insert on storage\.objects\s+for insert to authenticated/);
    expect(text).toMatch(/create policy recipe_images_delete on storage\.objects\s+for delete to authenticated/);
    expect(text).not.toMatch(/for update/);
    expect(text).not.toMatch(/to (anon|public)/);
    expect(text).toContain("recipe_image_room_in_my_household()");
  });

  it("revokes every function from the public roles", () => {
    const text = code();
    for (const name of ["recipe_image_household_cap()", "recipe_image_count(uuid)", "recipe_image_cap_guard()", "recipe_image_orphans(interval)"]) {
      expect(text, name).toContain(`revoke all on function public.${name} from public, anon, authenticated, service_role`);
    }
  });
});

describe("recipe image sizes", () => {
  it("are the same in the domain and in the image maker", () => {
    expect(recipeImageLimits.fullSide).toBe(recipeImageSides.full);
    expect(recipeImageLimits.thumbSide).toBe(recipeImageSides.thumb);
    expect(recipeImageLimits.maxOutputBytes).toBe(recipeImageMaxFileBytes);
  });
});
