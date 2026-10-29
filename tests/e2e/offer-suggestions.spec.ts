import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { normalizeIngredientText } from "@/features/catalog/domain/normalize";
import { weekStartOf } from "@/features/offers/domain/week";
import { adminClient, e2eUserId, offerSuggestionsEmail, offerSuggestionsStorageState } from "./support";

// Story 9.5: AI-förslag från veckans erbjudanden, with AI_PROVIDER=mock (the
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
      { onConflict: "user_id,normalized_name" },
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
const suggestButton = (page: Page) => sheet(page).getByRole("button", { name: "Föreslå rätter från veckans erbjudanden" });

async function openOffers(page: Page) {
  await page.goto("/lista");
  await page.getByRole("button", { name: "Erbjudanden" }).click();
  await expect(sheet(page)).toBeVisible();
}

test("the button waits, with a reason, when there are no offers", async ({ page }) => {
  await seed({ withOffers: false });
  await openOffers(page);
  await expect(suggestButton(page)).toBeDisabled();
  await expect(sheet(page).getByText("Hämta veckans erbjudanden först")).toBeVisible();
});

test("offers become dishes with labels, one step puts a dish on the menu and the list lacks only what is not at home", async ({ page }) => {
  const errors = watchErrors(page);
  await seed({ withOffers: true });
  const bodies: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/ai/jobs") bodies.push(request.postData() ?? "");
  });

  await openOffers(page);
  await expect(suggestButton(page)).toBeEnabled();
  await suggestButton(page).click();
  await expect(sheet(page)).toBeHidden();
  // Only the mode goes from the client: never the offers, never prices.
  expect(bodies).toHaveLength(1);
  expect(JSON.parse(bodies[0])).toMatchObject({ kind: "suggest", mode: "offers" });
  expect(bodies[0]).not.toMatch(/falukorv|kr\//);

  // The finished job says so with "Visa", which opens the suggestions in Recept.
  await toast(page).getByRole("button", { name: "Visa" }).click(jobTime);
  const section = page.getByTestId("ai-suggestions");
  await expect(section.getByRole("heading", { name: "AI-förslag från veckans erbjudanden" })).toBeVisible(jobTime);
  const cards = section.getByTestId("ai-suggestion");
  await expect(cards).toHaveCount(3);
  const card = cards.filter({ hasText: dishName });
  await expect(card.getByTestId("ai-suggestion-offers")).toHaveText("Erbjudanden: Falukorv");
  await expect(card.getByTestId("ai-suggestion-why")).toHaveText("allt hemma eller på erbjudande");

  await card.getByRole("button", { name: `Lägg på matsedeln: ${dishName}` }).click();
  const preview = page.getByRole("dialog", { name: "Spara AI-förslag" });
  await expect(preview).toBeVisible();
  await preview.getByRole("button", { name: "Spara och lägg på matsedeln" }).click();
  await expect(preview).toBeHidden();
  await expect(toast(page)).toContainText("Lagt på matsedeln.");
  await expect(cards).toHaveCount(2);

  // The dish is on the plan (a saved recipe with the same title).
  const plan = await adminClient().from("meal_plan_recipe").select("recipe_title").eq("user_id", userId);
  expect(plan.error).toBeNull();
  expect((plan.data as { recipe_title: string }[]).map((row) => row.recipe_title)).toEqual([dishName]);

  // "Visa inköpslistan": the list holds the falukorv, nothing that is at home.
  await toast(page).getByRole("button", { name: "Visa inköpslistan" }).click();
  await expect(page).toHaveURL(/\/lista$/);
  const lines = page.getByTestId("shopping-line").filter({ visible: true });
  await expect(lines).toHaveCount(1);
  await expect(lines.first()).toContainText(/falukorv/i);
  for (const name of atHome) {
    await expect(page.getByTestId("shopping-line").filter({ visible: true, hasText: new RegExp(`^${name}\\b`, "i") })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

// Story 9.14: two stores with offers. Maxi has offers on things that are at home, so it is the week's best store.
async function seedMaxi(): Promise<{ maxiId: string; testId: string }> {
  const admin = adminClient();
  const ids = await seedIngredients(atHome.slice(0, 3));
  const maxi = await admin
    .from("store")
    .insert({
      user_id: userId,
      name: "Maxi ICA Stormarknad Östersund",
      chain: "ICA",
      external_store_id: "1003733",
      offers_url: "https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/",
      is_selected: false,
    })
    .select("id")
    .single();
  if (maxi.error) throw maxi.error;
  const maxiId = (maxi.data as { id: string }).id;
  const offers = await admin.from("store_offer").insert(
    atHome.slice(0, 3).map((name) => ({
      user_id: userId,
      store_id: maxiId,
      week_start: weekStartOf(new Date()),
      label: name,
      name,
      ingredient_id: ids.get(name) ?? null,
      section: "Övrigt",
      price: "10 kr/st",
      source: "link",
    })),
  );
  if (offers.error) throw offers.error;
  const test = await admin.from("store").select("id").eq("user_id", userId).eq("name", "Matkoll Testbutik").single();
  if (test.error) throw test.error;
  return { maxiId, testId: (test.data as { id: string }).id };
}

function watchJobBodies(page: Page): string[] {
  const bodies: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/ai/jobs") bodies.push(request.postData() ?? "");
  });
  return bodies;
}

test("the week's best store is on top and preselected, and the dishes are built from that store", async ({ page }) => {
  const errors = watchErrors(page);
  await seed({ withOffers: true });
  const { maxiId } = await seedMaxi();
  const bodies = watchJobBodies(page);

  await openOffers(page);
  await expect(sheet(page).getByTestId("best-store")).toContainText("Bäst denna vecka:");
  await expect(sheet(page).getByTestId("best-store")).toContainText("Maxi");
  await expect(sheet(page).getByTestId("best-store")).toContainText("3 erbjudanden passar det du brukar laga");
  const picker = sheet(page).getByRole("radiogroup", { name: "Butik för förslagen" });
  await expect(picker.getByRole("radio", { name: "Maxi" })).toBeChecked();

  await suggestButton(page).click();
  await expect(sheet(page)).toBeHidden();
  expect(bodies).toHaveLength(1);
  expect(JSON.parse(bodies[0])).toMatchObject({ kind: "suggest", mode: "offers", storeId: maxiId });

  await toast(page).getByRole("button", { name: "Visa" }).click(jobTime);
  await expect(page.getByTestId("ai-suggestions").getByRole("heading", { name: "Med veckans erbjudanden från Maxi" })).toBeVisible(jobTime);
  expect(errors).toEqual([]);
});

test("another store can be picked for the dishes", async ({ page }) => {
  await seed({ withOffers: true });
  const { testId } = await seedMaxi();
  const bodies = watchJobBodies(page);

  await openOffers(page);
  const picker = sheet(page).getByRole("radiogroup", { name: "Butik för förslagen" });
  await picker.getByRole("radio", { name: "Matkoll" }).click();
  await expect(picker.getByRole("radio", { name: "Matkoll" })).toBeChecked();
  await suggestButton(page).click();
  await expect(sheet(page)).toBeHidden();
  expect(JSON.parse(bodies[0])).toMatchObject({ mode: "offers", storeId: testId });
  await toast(page).getByRole("button", { name: "Visa" }).click(jobTime);
  await expect(page.getByTestId("ai-suggestions").getByRole("heading", { name: "Med veckans erbjudanden från Matkoll" })).toBeVisible(jobTime);
});

// Story 16.1: the buttons on a suggestion work after Pontus has been to other pages and back, and a suggestion can be removed.
async function suggestionsFromOffers(page: Page) {
  await openOffers(page);
  await suggestButton(page).click();
  await expect(sheet(page)).toBeHidden();
  await toast(page).getByRole("button", { name: "Visa" }).click(jobTime);
  const cards = page.getByTestId("ai-suggestions").getByTestId("ai-suggestion");
  await expect(cards).toHaveCount(3, jobTime);
  return cards;
}

async function awayAndBack(page: Page) {
  const nav = page.getByRole("navigation", { name: "Huvudmeny" });
  await nav.getByRole("link", { name: "Matsedel" }).click();
  await expect(page).toHaveURL(/\/matsedel/);
  await nav.getByRole("link", { name: "Lagersaldo" }).click();
  await expect(page).toHaveURL(/\/hemma/);
  await nav.getByRole("link", { name: "Recept" }).click();
  await expect(page).toHaveURL(/\/recept/);
}

for (const away of [false, true]) {
  const where = away ? "after visiting other pages" : "straight away";
  test(`Spara and Lägg på matsedeln work on a suggestion ${where}`, async ({ page }) => {
    const errors = watchErrors(page);
    await seed({ withOffers: true });
    const cards = await suggestionsFromOffers(page);
    if (away) await awayAndBack(page);
    await expect(cards).toHaveCount(3);

    const preview = page.getByRole("dialog", { name: "Spara AI-förslag" });
    await cards.nth(1).getByRole("button", { name: /^Lägg på matsedeln/ }).click();
    await expect(preview).toBeVisible();
    await preview.getByRole("button", { name: "Spara och lägg på matsedeln" }).click();
    await expect(preview).toBeHidden();
    await expect(toast(page)).toContainText("Lagt på matsedeln.");
    await expect(cards).toHaveCount(2);

    await cards.first().getByRole("button", { name: /^Spara / }).click();
    await expect(preview).toBeVisible();
    await preview.getByRole("button", { name: "Spara recept" }).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}/);
    const recipes = await adminClient().from("recipe").select("id").eq("user_id", userId);
    expect(recipes.data).toHaveLength(3);
    expect(errors).toEqual([]);
  });
}

test("a suggestion can be removed with its trash, also after visiting other pages", async ({ page }) => {
  await seed({ withOffers: true });
  const cards = await suggestionsFromOffers(page);
  await awayAndBack(page);
  await expect(cards).toHaveCount(3);
  await cards.filter({ hasText: dishName }).getByRole("button", { name: `Ta bort förslaget ${dishName}` }).click();
  await expect(cards).toHaveCount(2);
  await expect(cards.filter({ hasText: dishName })).toHaveCount(0);
  await page.waitForTimeout(450);
  // The bins ignore a second tap within 400 ms, so each removal is waited for.
  for (const left of [1, 0]) {
    await cards.last().getByRole("button", { name: /^Ta bort förslaget / }).click();
    await expect(cards).toHaveCount(left);
    await page.waitForTimeout(450);
  }
  await expect(cards).toHaveCount(0);
  await expect(page.getByTestId("ai-suggestions").getByRole("heading")).toHaveCount(0);
  // Nothing is saved by removing.
  const recipes = await adminClient().from("recipe").select("id").eq("user_id", userId);
  expect(recipes.data).toHaveLength(1);
});
