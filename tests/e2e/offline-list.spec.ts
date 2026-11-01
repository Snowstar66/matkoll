import { expect, type Page, test } from "@playwright/test";
import { adminClient, e2eUserId, offlineListEmail, offlineListStorageState, thisMonday } from "./support";

// Story 17.8: Handla med dålig täckning. In a store basement the net is gone:
// checks still show at once, a calm line says they wait, and they are sent in
// order when the net is back. Checked with the browser offline
// (context.setOffline), then online again, a reload and a second phone.

const mobile = { width: 375, height: 812 };
const within = { timeout: 15_000 };
const offlineLine = "Offline – sparas när nätet kommer tillbaka";
test.use({ storageState: offlineListStorageState, viewport: mobile });

let userId = "";
let planId = "";
let ingredients = new Map<string, string>();
const recipes: Record<string, string> = {};

async function seedIngredients(): Promise<Map<string, string>> {
  const sections: Record<string, string> = { Grädde: "Mejeri", Mjöl: "Skafferi" };
  const { data, error } = await adminClient()
    .from("ingredient")
    .upsert(
      Object.entries(sections).map(([name, section]) => ({
        user_id: userId,
        name,
        normalized_name: name.toLocaleLowerCase("sv-SE"),
        section,
        location: "Kyl",
      })),
      { onConflict: "household_id,normalized_name" },
    )
    .select("id, name");
  if (error) throw error;
  return new Map((data as { id: string; name: string }[]).map((row) => [row.name, row.id]));
}

async function seedRecipe(title: string, ingredient: string, text: string, amount: number, unit: string) {
  const admin = adminClient();
  const recipe = await admin
    .from("recipe")
    .insert({ user_id: userId, title, original_servings: 4, total_minutes: 30, source_kind: "text" })
    .select("id")
    .single();
  if (recipe.error) throw recipe.error;
  const id = (recipe.data as { id: string }).id;
  const line = await admin.from("recipe_ingredient").insert({
    user_id: userId,
    recipe_id: id,
    position: 0,
    original_text: text,
    amount,
    unit,
    is_vague: false,
    ingredient_id: ingredients.get(ingredient),
  });
  if (line.error) throw line.error;
  recipes[title] = id;
}

async function addDish(title: string, position: number) {
  const { error } = await adminClient().from("meal_plan_recipe").insert({
    user_id: userId,
    meal_plan_id: planId,
    recipe_id: recipes[title],
    recipe_title: title,
    servings: 4,
    position,
  });
  if (error) throw error;
}


test.beforeAll(async () => {
  userId = await e2eUserId(offlineListEmail);
  const admin = adminClient();
  for (const table of ["shopping_custom_item", "shopping_check", "meal_plan", "pantry_item", "recipe"] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  ingredients = await seedIngredients();
  await seedRecipe("Gryta", "Grädde", "2 dl grädde", 2, "dl");
  await seedRecipe("Paj", "Mjöl", "2 dl mjöl", 2, "dl");
  const plan = await admin
    .from("meal_plan")
    .insert({ user_id: userId, name: "Vecka", is_current: true, week_start: thisMonday() })
    .select("id")
    .single();
  if (plan.error) throw plan.error;
  planId = (plan.data as { id: string }).id;
  await addDish("Gryta", 0);
  await addDish("Paj", 1);
});

const check = (page: Page, name: RegExp) => page.getByRole("checkbox", { name }).filter({ visible: true });

test("checks made offline show at once, wait with a calm line, and are saved when the net is back", async ({
  browser,
}) => {
  const phoneA = await browser.newContext({ storageState: offlineListStorageState, viewport: mobile });
  const phoneB = await browser.newContext({ storageState: offlineListStorageState, viewport: mobile });
  const a = await phoneA.newPage();
  const b = await phoneB.newPage();
  const errors: string[] = [];
  a.on("pageerror", (error) => errors.push(error.message));
  await a.goto("/lista");
  await expect(check(a, /^Grädde/)).not.toBeChecked();
  await expect(check(a, /^Mjöl/)).not.toBeChecked();
  await expect(a.getByText(offlineLine)).toHaveCount(0);

  await phoneA.setOffline(true);
  await check(a, /^Grädde/).click();
  // Past the double tap guard, which ignores a tap right after a line moved.
  await a.waitForTimeout(800);
  await check(a, /^Mjöl/).click();
  await expect(a.getByText(offlineLine)).toBeVisible();
  await expect(a.getByTestId("list-progress")).toContainText("Allt ligger i korgen");
  // No failure notice, and nothing reached the server.
  await expect(a.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
  const before = await adminClient().from("shopping_check").select("line_key").eq("user_id", userId);
  expect(before.data).toHaveLength(0);

  await phoneA.setOffline(false);
  await expect(a.getByText(offlineLine)).toHaveCount(0, within);
  await expect
    .poll(async () => (await adminClient().from("shopping_check").select("line_key").eq("user_id", userId)).data?.length, within)
    .toBe(2);

  // The checks persist after a reload and show on a second phone.
  await a.reload();
  await expect(a.getByTestId("list-progress")).toContainText("Allt ligger i korgen");
  await b.goto("/lista");
  await expect(b.getByTestId("list-progress")).toContainText("Allt ligger i korgen");
  expect(errors).toEqual([]);
  await phoneA.close();
  await phoneB.close();
});
