import { expect, type Page, test } from "@playwright/test";
import { normalizeIngredientText } from "@/features/catalog/domain/normalize";
import { weekStartOf } from "@/features/offers/domain/week";
import { adminClient, e2eUserId, recipeMissingEmail, recipeMissingStorageState } from "./support";

// Story 25.1: the recipe says what is missing and what to do. The spec has an
// E2E user of its own (recipeMissingEmail). Before each test the plan, list,
// pantry, recipes and stores are emptied, and Korvstroganoff is made with the
// service role: 400 g falukorv (on offer at 29 kr/st against 41 kr), 2 dl
// grädde and 4 dl ris, which are missing, and 1 gul lök, which is at home.

const mobile = { width: 390, height: 844 };
const title = "Korvstroganoff";

test.use({ storageState: recipeMissingStorageState, viewport: mobile });
test.describe.configure({ mode: "serial" });

let userId = "";
let recipeId = "";

async function seedIngredients(names: string[]): Promise<Map<string, string>> {
  const { data, error } = await adminClient()
    .from("ingredient")
    .upsert(
      names.map((name) => ({
        user_id: userId,
        name,
        normalized_name: normalizeIngredientText(name),
        section: "Övrigt",
        location: "Skafferi",
      })),
      { onConflict: "household_id,normalized_name" },
    )
    .select("id, name");
  if (error) throw error;
  return new Map((data as { id: string; name: string }[]).map((row) => [row.name, row.id]));
}

test.beforeEach(async () => {
  userId = await e2eUserId(recipeMissingEmail);
  const admin = adminClient();
  for (const table of [
    "shopping_custom_item",
    "meal_plan_recipe",
    "meal_plan",
    "pantry_item",
    "recipe_ingredient",
    "recipe_step",
    "recipe",
    "store_offer",
    "store",
  ] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  const ids = await seedIngredients(["Falukorv", "Grädde", "Ris", "Gul lök"]);
  const id = (name: string) => ids.get(name)!;

  const recipe = await admin
    .from("recipe")
    .insert({ user_id: userId, title, original_servings: 4, total_minutes: 30, source_kind: "text" })
    .select("id")
    .single();
  if (recipe.error) throw recipe.error;
  recipeId = (recipe.data as { id: string }).id;

  const lines = await admin.from("recipe_ingredient").insert(
    [
      { original_text: "400 g falukorv", amount: 400, unit: "g", ingredient_id: id("Falukorv") },
      { original_text: "2 dl grädde", amount: 2, unit: "dl", ingredient_id: id("Grädde") },
      { original_text: "4 dl ris", amount: 4, unit: "dl", ingredient_id: id("Ris") },
      { original_text: "1 gul lök", amount: 1, unit: "st", ingredient_id: id("Gul lök") },
    ].map((line, position) => ({ ...line, is_vague: false, user_id: userId, recipe_id: recipeId, position })),
  );
  if (lines.error) throw lines.error;
  const steps = await admin
    .from("recipe_step")
    .insert(["Skär korven.", "Fräs och rör ner grädden."].map((text, position) => ({ user_id: userId, recipe_id: recipeId, position, text })));
  if (steps.error) throw steps.error;

  const pantry = await admin
    .from("pantry_item")
    .insert({ user_id: userId, ingredient_id: id("Gul lök"), location: "Skafferi", amount: 5, unit: "st" });
  if (pantry.error) throw pantry.error;

  const store = await admin
    .from("store")
    .insert({ user_id: userId, name: "Testbutiken", chain: "ICA", external_store_id: "1000002", is_selected: true })
    .select("id")
    .single();
  if (store.error) throw store.error;
  const offer = await admin.from("store_offer").insert({
    user_id: userId,
    store_id: (store.data as { id: string }).id,
    week_start: weekStartOf(new Date()),
    label: "Falukorv",
    name: "Falukorv",
    ingredient_id: id("Falukorv"),
    section: "Övrigt",
    price: "29 kr/st",
    regular_price: 41,
    saving_percent: 29,
    source: "link",
  });
  if (offer.error) throw offer.error;
});

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

const view = (page: Page) => page.getByRole("article").filter({ visible: true });
const rows = (page: Page) => view(page).getByTestId("recipe-view-line");
const bar = (page: Page) => page.getByRole("button", { name: /Köp det som saknas|På listan ✓/ }).filter({ visible: true });

async function listedCount(): Promise<number> {
  const { count, error } = await adminClient().from("shopping_custom_item").select("*", { count: "exact", head: true }).eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

test("the rows say Saknas and the offer, and Köp det som saknas puts them on the list with Ångra", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(`/recept/${recipeId}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

  // The status is on the rows, and the old status box is gone.
  await expect(view(page).getByRole("img", { name: "saknas" })).toHaveCount(3);
  await expect(page.getByText(/^Saknar \d+ var/)).toHaveCount(0);
  await expect(view(page).getByTestId("recipe-at-home")).toHaveText("1 av 4 hemma");
  await expect(rows(page).filter({ hasText: "falukorv" }).getByTestId("recipe-line-offer")).toHaveText(
    "Erbjudande Testbutiken · 29 kr/st, spara 12 kr",
  );
  await expect(view(page).getByTestId("recipe-on-offer")).toHaveText("1 på erbjudande · spara 12 kr");

  // The sheet: all ticked, the offer says what it saves.
  await page.getByRole("button", { name: "Köp det som saknas (3)" }).filter({ visible: true }).click();
  const sheet = page.getByRole("dialog", { name: "Lägg på inköpslistan" });
  await expect(sheet.getByRole("checkbox", { checked: true })).toHaveCount(3);
  await expect(sheet.getByText("Erbjudande · spara 12 kr")).toBeVisible();
  await sheet.getByRole("button", { name: "Lägg 3 varor på listan" }).click();

  // Afterwards: På listan on the rows and Ångra on the button, and only the list was touched.
  await expect(view(page).getByText("På listan", { exact: true })).toHaveCount(3);
  await expect(view(page).getByRole("img", { name: "saknas" })).toHaveCount(0);
  await expect(view(page).getByTestId("recipe-listed")).toHaveCount(0); // UX-01: the rows say På listan, no chip counts them
  await expect(bar(page)).toHaveText("På listan ✓ · Ångra");
  expect(await listedCount()).toBe(3);
  const planned = await adminClient().from("meal_plan_recipe").select("id").eq("user_id", userId);
  expect(planned.data).toEqual([]);

  // Ångra takes just those items off again.
  await bar(page).click();
  await expect(view(page).getByRole("img", { name: "saknas" })).toHaveCount(3);
  await expect(bar(page)).toHaveText("Köp det som saknas (3)");
  expect(await listedCount()).toBe(0);
  expect(errors).toEqual([]);
});

test("a reload keeps På listan, since the rows follow the shopping list @flaky", async ({ page }) => {
  await page.goto(`/recept/${recipeId}`);
  await page.getByRole("button", { name: "Köp det som saknas (3)" }).filter({ visible: true }).click();
  await page.getByRole("dialog", { name: "Lägg på inköpslistan" }).getByRole("button", { name: "Lägg 3 varor på listan" }).click();
  await expect(view(page).getByText("På listan", { exact: true })).toHaveCount(3);
  await page.reload();
  await expect(view(page).getByText("På listan", { exact: true })).toHaveCount(3);
  await expect(view(page).getByTestId("recipe-listed")).toHaveCount(0); // UX-01: the rows say På listan, no chip counts them
});

test("there is no Laga nu any more, and the steps stay in the recipe", async ({ page }) => {
  await page.goto(`/recept/${recipeId}`);
  await expect(page.getByRole("button", { name: "Laga nu" })).toHaveCount(0);
  await expect(view(page).getByRole("region", { name: "Steg" }).getByRole("listitem")).toHaveCount(2);
});
