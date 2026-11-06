import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { normalizeIngredientText } from "@/features/catalog/domain/normalize";
import { weekStartOf } from "@/features/offers/domain/week";
import { adminClient, dayWords, e2eUserId, offerSuggestionsEmail, offerSuggestionsStorageState, todayDay } from "./support";

// Story 9.5 and 25.3, and "Idéerna är klara när du öppnar erbjudandena": the offers and what is made of
// them, with AI_PROVIDER=mock (the server answers the three dishes in
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
    "offer_idea_set",
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

// Rätter med extrapris: the top of Veckans erbjudanden names the user's dishes that use an offer.
test("the offers sheet shows Rätter med extrapris, + adds the dish to the week, and Visa alla opens Recept's filter", async ({ page }) => {
  const errors = watchErrors(page);
  await seed({ withOffers: true });
  await seedFalukorvRecipe();
  await page.goto("/lista");
  await page.getByRole("button", { name: "Erbjudanden" }).click();
  const card = sheet(page).getByTestId("offer-dishes");
  await expect(card).toContainText("Rätter med extrapris");
  await expect(card).toContainText("Förslag för att varorna har extrapris den här veckan.");
  const row = card.getByTestId("offer-dish").filter({ hasText: "Falukorv med potatismos" });
  await expect(row.getByTestId("plan-option-deal")).toContainText("Falukorv på extrapris");
  await row.getByRole("button", { name: "Lägg Falukorv med potatismos på veckan" }).click();
  await expect(row.getByTestId("on-week")).toBeVisible();
  const plan = await adminClient().from("meal_plan_recipe").select("recipe_title").eq("user_id", userId);
  expect(plan.data).toEqual([{ recipe_title: "Falukorv med potatismos" }]);

  await card.getByRole("link", { name: "Visa alla" }).click();
  await expect(page).toHaveURL(/\/recept/);
  // Lista stays mounted but hidden after the client navigation, with its own header button Erbjudanden: only the pressed filter pill counts.
  await expect(page.getByRole("button", { name: "Erbjudanden", exact: true, pressed: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByTestId("offers-reason")).toContainText("Förslag för att varorna har extrapris den här veckan.");
  expect(errors).toEqual([]);
});

// The card Rätter med extrapris is there whenever there are offers, also when none of the user's dishes match. The ideas are
// prepared in the background (here on the first view, since the offers were seeded, not fetched): nobody taps a start button.
test("the offers sheet shows the Nya idéer ready without a button, + opens the preview, and Andra idéer replaces the set", async ({ page }) => {
  const errors = watchErrors(page);
  await seed({ withOffers: true });
  await page.goto("/lista");
  await page.getByRole("button", { name: "Erbjudanden" }).click();
  const card = sheet(page).getByTestId("offer-dishes");
  await expect(card).toContainText("Rätter med extrapris");
  await expect(card.getByTestId("offer-dish")).toHaveCount(0);
  await expect(card.getByRole("link", { name: "Visa alla" })).toHaveCount(0);
  await expect(card.getByRole("button", { name: /Nya idéer med extrapris/ })).toHaveCount(0);
  await expect(card.getByRole("heading", { name: "Nya idéer" })).toBeVisible();
  await expect(card.getByTestId("ai-option")).toHaveCount(3, jobTime);
  await expect(card.getByTestId("offer-ideas-intro")).toContainText("billigt i veckan");
  // The set is saved for the household and the offer week.
  const set = await adminClient().from("offer_idea_set").select("status, week_start").eq("user_id", userId);
  expect(set.data).toEqual([{ status: "ready", week_start: weekStartOf(new Date()) }]);

  // Andra idéer asks for a replacing set, prepared in the background; the card says so meanwhile. The mock AI has no other set to
  // give (every title is to be avoided), so the first set is given back: the user is never left without ideas.
  await card.getByRole("button", { name: "Andra idéer" }).click();
  await expect(card.getByTestId("ai-option")).toHaveCount(3, jobTime);
  expect((await adminClient().from("offer_idea_set").select("id").eq("user_id", userId)).data).toHaveLength(1);

  await card.getByRole("button", { name: `Granska och spara: ${dishName}` }).click();
  await expect(page.getByRole("dialog", { name: "Spara AI-förslag" })).toBeVisible();
  expect(errors).toEqual([]);
});

// An idea saved as a recipe leaves the set, in every place that shows it.
test("a saved idea does not show again on Matsedel", async ({ page }) => {
  await seed({ withOffers: true });
  await page.goto("/lista");
  await page.getByRole("button", { name: "Erbjudanden" }).click();
  const card = sheet(page).getByTestId("offer-dishes");
  await expect(card.getByTestId("ai-option")).toHaveCount(3, jobTime);
  await card.getByRole("button", { name: `Granska och spara: ${dishName}` }).click();
  await page.getByRole("dialog", { name: "Spara AI-förslag" }).getByRole("button", { name: "Spara och lägg på veckan" }).click();
  await expect(page.getByRole("dialog", { name: "Spara AI-förslag" })).toBeHidden();
  await page.goto("/matsedel");
  await page.getByRole("radio", { name: "På erbjudande" }).click();
  await expect(page.getByTestId("ai-option")).toHaveCount(2);
  await expect(page.getByTestId("ai-option").filter({ hasText: dishName })).toHaveCount(0);
});

// Story 25.3: Matsedel is where the week is planned: På erbjudande, "+" and the dish is on the week with no day.
test("Matsedel: På erbjudande, + puts the dish on the first free day and the bar follows", async ({ page }) => {
  const errors = watchErrors(page);
  await seed({ withOffers: true });
  await seedFalukorvRecipe();

  await page.goto("/matsedel");
  await expect(page.getByTestId("week-empty")).toBeVisible();
  // An empty week says "Inga rätter än" instead of a count.
  await expect(bar(page)).toHaveCount(0);
  await page.getByRole("radio", { name: "På erbjudande" }).click();
  await expect(page.getByTestId("offers-hint")).toBeVisible();
  const row = page.getByTestId("plan-option").filter({ hasText: "Falukorv med potatismos" });
  await expect(row.getByTestId("plan-option-deal")).toContainText("Falukorv på extrapris");
  await row.getByRole("button", { name: "Lägg Falukorv med potatismos på veckan" }).click();

  await expect(weekDishes(page)).toHaveCount(1);
  await expect(weekDishes(page).first()).toContainText("Falukorv med potatismos");
  // The week is empty: the dish lands on today.
  const today = todayDay();
  const short = dayWords[today - 1]!.slice(0, 3).replace(/^./, (c) => c.toUpperCase());
  await expect(weekDishes(page).first().getByTestId("dish-day")).toHaveText(short);
  await expect(toast(page)).toContainText(new RegExp(`Falukorv med potatismos på ${dayWords[today - 1]}\\. .+ står på inköpslistan\\.`));
  await expect(toast(page).getByRole("button", { name: "Byt dag" })).toBeVisible();
  await expect(row.getByTestId("on-week")).toHaveText(short);
  await expect(bar(page)).toHaveText(/^1 rätt · [1-9]\d* var(a|or) att köpa$/);

  // What is saved: on this week's plan, on today.
  const plan = await adminClient().from("meal_plan_recipe").select("recipe_title, weekday").eq("user_id", userId);
  expect(plan.data).toEqual([{ recipe_title: "Falukorv med potatismos", weekday: today }]);

  // "Byt dag" picks a day; the chip says it, and the list is one tab away.
  await toast(page).getByRole("button", { name: "Byt dag" }).click();
  await page.getByRole("dialog", { name: /Flytta till dag/ }).getByRole("button", { name: "Onsdag" }).click();
  await expect(weekDishes(page).first().getByTestId("dish-day")).toHaveText("Ons");
  await page.getByRole("navigation", { name: "Huvudmeny" }).getByRole("link", { name: /^Inköpslista/ }).click();
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

// "Nya idéer": the saved set (prepared in the background by the job of Story 9.5 over all stores), told like a friend (intro and a why per dish), the same rows, and the preview first.
// The same component sits in the card Rätter med extrapris (previous test) and under På erbjudande on Matsedel.
test("Matsedel: the new ideas are ready under På erbjudande and are reviewed and saved before they go on the week", async ({ page }) => {
  const errors = watchErrors(page);
  await seed({ withOffers: true });
  const jobPosts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/ai/jobs") jobPosts.push(request.postData() ?? "");
  });

  await page.goto("/matsedel");
  await page.getByRole("radio", { name: "På erbjudande" }).click();
  await expect(page.getByRole("button", { name: /Nya idéer med extrapris/ })).toHaveCount(0);
  const ideas = page.getByTestId("ai-option");
  await expect(ideas).toHaveCount(3, jobTime);
  // Like a friend: a thought on the offers, and a why under each idea.
  await expect(page.getByTestId("offer-ideas-intro")).toContainText("billigt i veckan");
  await expect(ideas.filter({ hasText: dishName }).getByTestId("plan-option-note")).toContainText("Falukorven är billig");
  // The set is made on the server in the background, not by an AI job the client starts.
  expect(jobPosts).toEqual([]);
  // Nothing is saved yet.
  expect((await adminClient().from("recipe").select("id").eq("user_id", userId)).data).toHaveLength(1);

  const idea = ideas.filter({ hasText: dishName });
  await expect(idea).toContainText("AI-förslag");
  await expect(idea.getByTestId("plan-option-deal")).toContainText("Falukorv på extrapris");
  await idea.getByRole("button", { name: `Granska och spara: ${dishName}` }).click();
  const preview = page.getByRole("dialog", { name: "Spara AI-förslag" });
  await expect(preview).toBeVisible();
  await preview.getByRole("button", { name: "Spara och lägg på veckan" }).click();
  await expect(preview).toBeHidden();
  await expect(weekDishes(page)).toHaveCount(1);
  await expect(weekDishes(page).first()).toContainText(dishName);
  const today = todayDay();
  await expect(weekDishes(page).first().getByTestId("dish-day")).toHaveText(dayWords[today - 1]!.slice(0, 3).replace(/^./, (c) => c.toUpperCase()));
  await expect(ideas).toHaveCount(2);

  // The dish was saved as a recipe first, and is on the plan on today.
  const recipes = await adminClient().from("recipe").select("title").eq("user_id", userId);
  expect((recipes.data as { title: string }[]).map((row) => row.title).sort()).toEqual([dishName, "Linssoppa"].sort());
  const plan = await adminClient().from("meal_plan_recipe").select("recipe_title, weekday").eq("user_id", userId);
  expect(plan.data).toEqual([{ recipe_title: dishName, weekday: today }]);
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
  await expect(cards.first().getByTestId("offer-tags")).toHaveText("Extrapris: falukorv");
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

