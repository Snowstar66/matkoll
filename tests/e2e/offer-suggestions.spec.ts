import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { normalizeIngredientText } from "@/features/catalog/domain/normalize";
import { weekStartOf } from "@/features/offers/domain/week";
import { adminClient, e2eUserId, offerSuggestionsEmail, offerSuggestionsStorageState } from "./support";

// Story 9.5 and 25.3: the offers and what is made of them, with AI_PROVIDER=mock (the
// server answers the three dishes in
// tests/fixtures/ai/suggest-dishes-erbjudanden.response.json when the message
// has offers). The spec has an E2E user of its own (offerSuggestionsEmail).
// Before each test the service role empties the user's pantry, plan, recipes,
// jobs and store, and makes a selected store with three offers (falukorv,
// broccoli and kycklingfilé, with prices) and everything in the first dish at
// home but the falukorv.

type FixtureLine = { name: string };
type FixtureRecipe = { title: string; ingredients: FixtureLine[] };
const fixtures = join(process.cwd(), "tests", "fixtures", "ai");
const dishes = (JSON.parse(readFileSync(join(fixtures, "suggest-dishes-erbjudanden.response.json"), "utf8")) as { suggestions: FixtureRecipe[] })
  .suggestions;
const [falukorvDish] = dishes;
const dishName = falukorvDish.title;
const offered = [
  { name: "falukorv", label: "Falukorv", price: "29 kr/kg" },
  { name: "broccoli", label: "Broccoli", price: "15 kr/st" },
  { name: "kycklingfilé", label: "Kycklingfilé", price: "99 kr/kg" },
];
const atHome = falukorvDish.ingredients.map((line) => line.name).filter((name) => name !== "falukorv");

const jobTime = { timeout: 20_000 };
const mobile = { width: 375, height: 812 };

test.use({ storageState: offerSuggestionsStorageState, viewport: mobile });
test.describe.configure({ mode: "serial" });

let userId = "";

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
    .select("id, normalized_name");
  if (error) throw error;
  const byNormalized = new Map((data as { id: string; normalized_name: string }[]).map((row) => [row.normalized_name, row.id]));
  return new Map(names.map((name) => [name, byNormalized.get(normalizeIngredientText(name))!]));
}

async function seed({ withOffers }: { withOffers: boolean }) {
  userId = await e2eUserId(offerSuggestionsEmail);
  const admin = adminClient();
  // Children before parents, so nothing relies on the cascades.
  for (const table of [
    "ai_job",
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
  // The library shows its filters (and so the suggestions) only when there is a recipe.
  const recipe = await admin
    .from("recipe")
    .insert({ user_id: userId, title: "Linssoppa", original_servings: 4, total_minutes: 30, source_kind: "text" });
  if (recipe.error) throw recipe.error;
  const names = [...new Set(dishes.flatMap((dish) => dish.ingredients.map((line) => line.name)))];
  const ids = await seedIngredients(names);
  const pantry = await admin.from("pantry_item").insert(
    atHome.map((name) => ({ user_id: userId, ingredient_id: ids.get(name)!, location: "Skafferi", amount: null, unit: null })),
  );
  if (pantry.error) throw pantry.error;
  const store = await admin
    .from("store")
    .insert({
      user_id: userId,
      name: "Matkoll Testbutik",
      chain: "ICA",
      external_store_id: "1000001",
      offers_url: "https://www.ica.se/erbjudanden/matkoll-test-butik-1000001/",
      is_selected: true,
    })
    .select("id")
    .single();
  if (store.error) throw store.error;
  if (!withOffers) return;
  const offers = await admin.from("store_offer").insert(
    offered.map(({ name, label, price }) => ({
      user_id: userId,
      store_id: (store.data as { id: string }).id,
      week_start: weekStartOf(new Date()),
      label,
      name,
      ingredient_id: ids.get(name) ?? null,
      section: "Övrigt",
      price,
      source: "link",
    })),
  );
  if (offers.error) throw offers.error;
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

const sheet = (page: Page) => page.getByRole("dialog", { name: "Veckans erbjudanden" });
const toast = (page: Page) => page.getByTestId("toast");

/** A library recipe with falukorv (on offer) and a pinch of salt (never a main ingredient). */
async function seedFalukorvRecipe(title = "Falukorv med potatismos") {
  const admin = adminClient();
  const falukorv = (await seedIngredients(["falukorv"])).get("falukorv")!;
  const salt = (await seedIngredients(["salt"])).get("salt")!;
  const created = await admin
    .from("recipe")
    .insert({ user_id: userId, title, original_servings: 4, total_minutes: 30, source_kind: "text", is_favorite: true })
    .select("id")
    .single();
  if (created.error) throw created.error;
  const recipeId = (created.data as { id: string }).id;
  const lines = await admin.from("recipe_ingredient").insert([
    { user_id: userId, recipe_id: recipeId, position: 0, original_text: "400 g falukorv", amount: 400, unit: "g", is_vague: false, ingredient_id: falukorv },
    { user_id: userId, recipe_id: recipeId, position: 1, original_text: "1 krm salt", amount: 1, unit: "krm", is_vague: false, ingredient_id: salt },
  ]);
  if (lines.error) throw lines.error;
  return recipeId;
}

const weekDishes = (page: Page) => page.getByRole("list", { name: "Veckans rätter" }).getByTestId("plan-dish");
const bar = (page: Page) => page.getByTestId("week-bar-count");

test("the offers sheet only lists offers: no Föreslå rätter and no store choice (Story 25.3)", async ({ page }) => {
  await seed({ withOffers: true });
  await page.goto("/matsedel");
  await page.getByRole("button", { name: "Erbjudanden" }).click();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByRole("button", { name: /Föreslå rätter/ })).toHaveCount(0);
  await expect(page.getByTestId("store-choice")).toHaveCount(0);
  await expect(sheet(page).getByTestId("offer-row").first()).toBeVisible();
});

// Story 25.3: Matsedel is where the week is planned: På erbjudande, "+" and the dish is on the week with no day.
test("Matsedel: På erbjudande, + puts the dish on the week with Ingen dag and the bar follows", async ({ page }) => {
  const errors = watchErrors(page);
  await seed({ withOffers: true });
  await seedFalukorvRecipe();

  await page.goto("/matsedel");
  await expect(page.getByTestId("week-empty")).toBeVisible();
  await expect(bar(page)).toHaveText("0 rätter · 0 varor att köpa");
  await page.getByRole("radio", { name: "På erbjudande" }).click();
  await expect(page.getByTestId("offers-hint")).toBeVisible();
  const row = page.getByTestId("plan-option").filter({ hasText: "Falukorv med potatismos" });
  await expect(row.getByTestId("plan-option-deal")).toContainText("Falukorv på erbjudande");
  await row.getByRole("button", { name: "Lägg Falukorv med potatismos på veckan" }).click();

  await expect(weekDishes(page)).toHaveCount(1);
  await expect(weekDishes(page).first()).toContainText("Falukorv med potatismos");
  await expect(weekDishes(page).first().getByTestId("dish-day")).toHaveText("Ingen dag");
  await expect(toast(page)).toContainText(/Falukorv med potatismos på veckan\. \d+ var(a|or) på listan\./);
  await expect(toast(page).getByRole("button", { name: "Välj dag" })).toBeVisible();
  await expect(row.getByTestId("on-week")).toHaveText("På veckan");
  await expect(bar(page)).toHaveText(/^1 rätt · [1-9]\d* var(a|or) att köpa$/);

  // What is saved: on this week's plan, no weekday.
  const plan = await adminClient().from("meal_plan_recipe").select("recipe_title, weekday").eq("user_id", userId);
  expect(plan.data).toEqual([{ recipe_title: "Falukorv med potatismos", weekday: null }]);

  // "Välj dag" picks a day; the chip says it, and the list is one tap away.
  await toast(page).getByRole("button", { name: "Välj dag" }).click();
  await page.getByRole("dialog", { name: /Flytta till dag/ }).getByRole("button", { name: "Onsdag" }).click();
  await expect(weekDishes(page).first().getByTestId("dish-day")).toHaveText("Ons");
  await page.getByRole("link", { name: "Inköpslistan" }).click();
  await expect(page).toHaveURL(/\/lista$/);
  await expect(page.getByTestId("shopping-line").filter({ visible: true }).first()).toContainText(/falukorv/i);

  // ✕ takes the dish off again, with Ångra.
  await page.goto("/matsedel");
  await weekDishes(page).first().getByRole("button", { name: "Ta bort Falukorv med potatismos" }).click();
  await expect(weekDishes(page)).toHaveCount(0);
  await expect(toast(page)).toContainText("Tog bort Falukorv med potatismos.");
  await toast(page).getByRole("button", { name: /Ångra/ }).click();
  await expect(weekDishes(page)).toHaveCount(1);
  expect(errors).toEqual([]);
});

// Story 25.3: "Hittar du inget? Få 2 nya idéer med erbjudandena": the job of Story 9.5 over all stores, the same rows, and the preview first.
test("Matsedel: 2 new ideas from the offers are reviewed and saved before they go on the week", async ({ page }) => {
  const errors = watchErrors(page);
  await seed({ withOffers: true });
  const bodies: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/ai/jobs") bodies.push(request.postData() ?? "");
  });

  await page.goto("/matsedel");
  await page.getByRole("radio", { name: "På erbjudande" }).click();
  await page.getByRole("button", { name: "Hittar du inget? Få 2 nya idéer med erbjudandena" }).click();
  const ideas = page.getByTestId("ai-option");
  await expect(ideas).toHaveCount(2, jobTime);
  // No store is chosen: the server reads the offers of all stores. Only the mode goes from the client.
  expect(bodies).toHaveLength(1);
  expect(JSON.parse(bodies[0])).toMatchObject({ kind: "suggest", mode: "offers" });
  expect(JSON.parse(bodies[0])).not.toHaveProperty("storeId");
  expect(bodies[0]).not.toMatch(/falukorv|kr\//);
  // Nothing is saved yet.
  expect((await adminClient().from("recipe").select("id").eq("user_id", userId)).data).toHaveLength(1);

  const idea = ideas.filter({ hasText: dishName });
  await expect(idea).toContainText("AI-förslag");
  await expect(idea.getByTestId("plan-option-deal")).toContainText("Falukorv på erbjudande");
  await idea.getByRole("button", { name: `Granska och spara: ${dishName}` }).click();
  const preview = page.getByRole("dialog", { name: "Spara AI-förslag" });
  await expect(preview).toBeVisible();
  await preview.getByRole("button", { name: "Spara och lägg på veckan" }).click();
  await expect(preview).toBeHidden();
  await expect(weekDishes(page)).toHaveCount(1);
  await expect(weekDishes(page).first()).toContainText(dishName);
  await expect(weekDishes(page).first().getByTestId("dish-day")).toHaveText("Ingen dag");
  await expect(ideas).toHaveCount(1);

  // The dish was saved as a recipe first, and is on the plan with no day.
  const recipes = await adminClient().from("recipe").select("title").eq("user_id", userId);
  expect((recipes.data as { title: string }[]).map((row) => row.title).sort()).toEqual([dishName, "Linssoppa"].sort());
  const plan = await adminClient().from("meal_plan_recipe").select("recipe_title, weekday").eq("user_id", userId);
  expect(plan.data).toEqual([{ recipe_title: dishName, weekday: null }]);
  expect(errors).toEqual([]);
});

// Story 9.3: the filter Erbjudanden in Recept lists the recipes that use an offer on a main ingredient.
test("the filter Erbjudanden shows the recipe that uses an offer, with its tag, the store and the sheet", async ({ page }) => {
  const errors = watchErrors(page);
  await seed({ withOffers: true });
  const admin = adminClient();
  const falukorv = (await seedIngredients(["falukorv"])).get("falukorv")!;
  const salt = (await seedIngredients(["salt"])).get("salt")!;
  const created = await admin
    .from("recipe")
    .insert({ user_id: userId, title: "Falukorv med potatismos", original_servings: 4, total_minutes: 30, source_kind: "text" })
    .select("id")
    .single();
  if (created.error) throw created.error;
  const lines = await admin.from("recipe_ingredient").insert([
    { user_id: userId, recipe_id: (created.data as { id: string }).id, position: 0, original_text: "400 g falukorv", amount: 400, unit: "g", is_vague: false, ingredient_id: falukorv },
    { user_id: userId, recipe_id: (created.data as { id: string }).id, position: 1, original_text: "1 krm salt", amount: 1, unit: "krm", is_vague: false, ingredient_id: salt },
  ]);
  if (lines.error) throw lines.error;

  await page.goto("/recept");
  await page.getByRole("button", { name: "Erbjudanden", exact: true }).click();
  const cards = page.getByTestId("recipe-card");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Falukorv med potatismos");
  await expect(cards.first().getByTestId("offer-tags")).toContainText("Falukorv");
  await expect(page.getByTestId("offers-line")).toContainText(/^Recept med veckans erbjudanden från Matkoll Testbutik, vecka \d+\./);
  await page.getByRole("button", { name: "Visa erbjudanden" }).click();
  await expect(sheet(page)).toBeVisible();
  await page.keyboard.press("Escape");
  // The other pills are as before: Alla shows both recipes and no tags.
  await page.getByRole("button", { name: "Erbjudanden", exact: true }).click();
  await expect(cards).toHaveCount(2);
  await expect(page.getByTestId("offer-tags")).toHaveCount(0);
  expect(errors).toEqual([]);
});

