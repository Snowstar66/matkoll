import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { normalizeIngredientText } from "@/features/catalog/domain/normalize";
import { adminClient, aiSuggestionsEmail, aiSuggestionsStorageState, e2eUserId } from "./support";

// Story 5.2: AI-förslag from the pantry, with AI_PROVIDER=mock (the server
// answers the three recipes in tests/fixtures/ai/suggest-dishes.response.json,
// whatever is at home). The spec has an E2E user of its own
// (aiSuggestionsEmail). Before each test the pantry and the recipes are
// emptied, and the service role makes the recipe Linssoppa (so the library
// has a row), a catalog ingredient for each hint in the mock's two answer
// sets, and each of them at home: as much as the first suggestion needs for
// its own lines (so it can be cooked now once it is saved), always enough for
// the rest (so every suggestion uses the pantry and is kept).

type FixtureLine = { originalText: string; amount: number | null; unit: string | null; isVague: boolean; hint: { name: string } };
type FixtureRecipe = { title: string; ingredients: FixtureLine[] };

const fixtures = join(process.cwd(), "tests", "fixtures", "ai");
const answerSet = (name: string) =>
  (JSON.parse(readFileSync(join(fixtures, `${name}.response.json`), "utf8")) as { suggestions: FixtureRecipe[] }).suggestions;
const suggested = answerSet("suggest-dishes");
/** What the mock answers when every title of the first set is to be avoided. */
const others = answerSet("suggest-dishes-andra");
const [first] = suggested;
const titles = suggested.map((recipe) => recipe.title);
const soppa = "Linssoppa";
const reservedUnavailable = "matkoll-mock: ai_unavailable";

const mobile = { width: 375, height: 812 };
const desktop = { width: 1280, height: 900 };

test.use({ storageState: aiSuggestionsStorageState, viewport: mobile });
// One user for all the tests: each seeds it again, so they must not run at the same time.
test.describe.configure({ mode: "serial" });

let userId = "";

/** Upserts the catalog ingredients (they are never deleted) and returns their ids by name. */
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
    .select("id, name");
  if (error) throw error;
  const ids = new Map((data as { id: string; name: string }[]).map((row) => [row.name, row.id]));
  const missing = names.filter((name) => !ids.has(name));
  if (missing.length > 0) throw new Error(`The catalog upsert did not return ${missing.join(", ")}`);
  return ids;
}

/** Puts items in the pantry; `amount: null` is always enough. */
async function seedPantry(items: { ingredientId: string; amount: number | null; unit: string | null }[]) {
  const { error } = await adminClient()
    .from("pantry_item")
    .insert(
      items.map(({ ingredientId, amount, unit }) => ({
        user_id: userId,
        ingredient_id: ingredientId,
        location: "Skafferi",
        amount,
        unit,
      })),
    );
  if (error) throw error;
}

test.beforeEach(async () => {
  userId = await e2eUserId(aiSuggestionsEmail);
  const admin = adminClient();
  // Children before parents, so nothing relies on the cascades.
  for (const table of ["pantry_item", "recipe_ingredient", "recipe_step", "recipe"] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  const recipe = await admin
    .from("recipe")
    .insert({ user_id: userId, title: soppa, original_servings: 4, total_minutes: 30, source_kind: "text" })
    .select("id")
    .single();
  if (recipe.error) throw recipe.error;
  const line = await admin.from("recipe_ingredient").insert({
    user_id: userId,
    recipe_id: (recipe.data as { id: string }).id,
    position: 0,
    original_text: "3 dl röda linser",
    amount: 3,
    unit: "dl",
    is_vague: false,
    ingredient_id: null,
  });
  if (line.error) throw line.error;

  const names = [...new Set([...suggested, ...others].flatMap((recipe) => recipe.ingredients.map((line) => line.hint.name)))];
  const ids = await seedIngredients(names);
  // The first suggestion's lines: as much as each needs, in its unit (a count
  // without one is st); vague lines and everything else: always enough.
  const firstLines = new Map(first.ingredients.map((line) => [line.hint.name, line]));
  await seedPantry(
    names.map((name) => {
      const line = firstLines.get(name);
      const exact = line && !line.isVague;
      return { ingredientId: ids.get(name)!, amount: exact ? line.amount : null, unit: exact ? (line.unit ?? "st") : null };
    }),
  );
});

/** Collects console errors and uncaught exceptions for the page. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** Counts the calls to /api/ai/suggest. */
function countSuggestCalls(page: Page): () => number {
  let count = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/ai/suggest")) count++;
  });
  return () => count;
}

// Earlier routes stay mounted but hidden after a client navigation, so every
// locator is scoped to what is visible.
const visible = (page: Page) => page.locator("main").filter({ visible: true });
const rows = (page: Page) => page.getByTestId("recipe-row").filter({ visible: true });
const pill = (page: Page, name: "Alla" | "Kan lagas nu") => page.getByRole("radio", { name }).filter({ visible: true });
const section = (page: Page) => page.getByRole("region", { name: "AI-förslag" }).filter({ visible: true });
const cards = (page: Page) => section(page).getByRole("listitem");
const suggestButton = (page: Page) => page.getByRole("button", { name: "Föreslå rätter med AI" }).filter({ visible: true });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Spara AI-förslag" });
const tab = (page: Page, name: "Recept" | "Hemma") =>
  page.getByRole("navigation", { name: "Huvudmeny" }).getByRole("link", { name });

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("AI-förslag: Avbryt, three cards of their own, and a saved suggestion in the library", async ({ page }) => {
  const errors = watchErrors(page);
  const suggestCalls = countSuggestCalls(page);
  await page.goto("/recept");
  await pill(page, "Kan lagas nu").click();
  await expect(rows(page)).toHaveCount(1);
  await expect(suggestButton(page)).toBeVisible();
  // Choosing the filter never asks the AI.
  expect(suggestCalls()).toBe(0);

  // Hold the first call, so "Letar efter idéer …" stays until Avbryt.
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/ai/suggest", async (route) => {
    await held;
    // The page has aborted the request by now, so there is nothing to continue.
    await route.continue().catch(() => {});
  });
  await suggestButton(page).click();
  await expect(visible(page).getByRole("status").getByText("Letar efter idéer …")).toBeVisible();
  const aborted = page.waitForEvent("requestfailed", (request) => request.url().endsWith("/api/ai/suggest"));
  await visible(page).getByRole("button", { name: "Avbryt" }).click();
  await aborted;
  release();
  await page.unroute("**/api/ai/suggest");
  await expect(suggestButton(page)).toBeFocused();
  await expect(visible(page).getByText("Letar efter idéer …")).toHaveCount(0);
  await expect(visible(page).getByRole("alert")).toHaveCount(0);

  // The mock answers.
  const answered = page.waitForResponse((response) => response.url().endsWith("/api/ai/suggest"));
  await suggestButton(page).click();
  expect((await answered).status()).toBe(200);
  await expect(cards(page)).toHaveCount(3);
  await expect(section(page).getByRole("heading", { level: 2, name: "AI-förslag" })).toBeFocused();
  await expect(section(page).getByRole("heading", { level: 3 })).toHaveText(titles);
  await expect(cards(page).first().getByText("35 min · 4 portioner")).toBeVisible();
  for (const card of await cards(page).all()) await expect(card.getByText("AI-förslag", { exact: true })).toBeVisible();
  await expect(cards(page).first().getByText(/^Med: /)).toBeVisible();
  // A section of its own, outside the list of recipes, and no status on a suggestion.
  const list = page.getByRole("list", { name: "Recept, minst saknat först" }).filter({ visible: true });
  await expect(list.getByText(first.title)).toHaveCount(0);
  await expect(section(page).getByText(/^(Kan lagas nu|Saknar \d+ varo?r?)$/)).toHaveCount(0);
  await expect(visible(page).getByRole("button", { name: "Föreslå andra rätter" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.setViewportSize(desktop);
  await expectNoHorizontalScroll(page);
  await page.setViewportSize(mobile);

  // Spara opens the preview with the AI label; Spara recept saves it.
  await section(page).getByRole("button", { name: `Spara ${first.title}` }).click();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByText("AI-förslag", { exact: true })).toBeVisible();
  await expect(sheet(page).getByLabel("Titel")).toHaveValue(first.title);
  await expect(sheet(page).getByText(/^Källa:/)).toHaveCount(0);
  await sheet(page).getByRole("button", { name: "Spara recept" }).click();

  await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
  await expect(sheet(page)).toBeHidden();
  await expect(page.getByTestId("toast")).toHaveText("Receptet är sparat.");
  await expect(page.getByRole("heading", { level: 1, name: first.title })).toBeVisible();
  await expect(page.getByText("Källa: AI-förslag")).toBeVisible();
  const article = page.getByRole("article").filter({ visible: true });
  await expect(article.getByText("Kan lagas nu", { exact: true })).toBeVisible();
  await expect(article.getByText("AI-förslag", { exact: true })).toHaveCount(0);

  // Back in the library: the recipe is a row without the AI label, and the other two suggestions stay.
  await tab(page, "Recept").click();
  await expect(page).toHaveURL(/\/recept$/);
  await expect(pill(page, "Kan lagas nu")).toBeChecked();
  const saved = rows(page).filter({ hasText: first.title });
  await expect(saved).toHaveCount(1);
  await expect(saved.getByText("Kan lagas nu", { exact: true })).toBeVisible();
  await expect(saved.getByText("AI-förslag", { exact: true })).toHaveCount(0);
  await expect(section(page).getByRole("heading", { level: 3 })).toHaveText(titles.slice(1));

  // Other dishes: the titles shown and the saved one are avoided, so the mock answers its other set.
  const again = page.waitForRequest((request) => request.url().endsWith("/api/ai/suggest"));
  await visible(page).getByRole("button", { name: "Föreslå andra rätter" }).click();
  expect((await again).postDataJSON()).toEqual({ avoidTitles: [...titles.slice(1), first.title] });
  await expect(section(page).getByRole("heading", { level: 3 })).toHaveText(others.map((recipe) => recipe.title));
  expect(errors.filter((error) => !error.includes("Failed to load resource"))).toEqual([]);
});

test("the AI out of reach: the text and Försök igen, while the library works", async ({ page }) => {
  const errors = watchErrors(page);
  const ids = await seedIngredients([reservedUnavailable]);
  await seedPantry([{ ingredientId: ids.get(reservedUnavailable)!, amount: null, unit: null }]);

  await page.goto("/recept");
  await pill(page, "Kan lagas nu").click();
  const answered = page.waitForResponse((response) => response.url().endsWith("/api/ai/suggest"));
  await suggestButton(page).click();
  expect((await answered).status()).toBe(503);
  const alert = visible(page).getByRole("alert");
  await expect(alert).toHaveText("AI-tjänsten svarar inte just nu. Är datorn med modellen igång?");
  await expect(visible(page).getByRole("button", { name: "Försök igen" })).toBeVisible();
  await expect(section(page)).toHaveCount(0);

  // Försök igen asks again, with the same answer.
  const again = page.waitForResponse((response) => response.url().endsWith("/api/ai/suggest"));
  await visible(page).getByRole("button", { name: "Försök igen" }).click();
  expect((await again).status()).toBe(503);
  await expect(alert).toBeVisible();

  // The library still searches and opens a recipe.
  const field = page.getByRole("searchbox", { name: "Sök recept" });
  await field.fill("lins");
  await field.press("Enter");
  await expect(rows(page)).toHaveCount(1);
  await rows(page).getByRole("link", { name: soppa }).click();
  await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: soppa })).toBeVisible();
  // The server logs ai_unavailable; the console has only the failed request.
  expect(errors.filter((error) => !error.includes("Failed to load resource"))).toEqual([]);
});

test("an empty pantry: the text with Öppna Hemma, and the AI is not asked", async ({ page }) => {
  const { error } = await adminClient().from("pantry_item").delete().eq("user_id", userId);
  if (error) throw error;

  await page.goto("/recept");
  await pill(page, "Kan lagas nu").click();
  const answered = page.waitForResponse((response) => response.url().endsWith("/api/ai/suggest"));
  await suggestButton(page).click();
  expect((await answered).status()).toBe(422);
  await expect(visible(page).getByRole("alert")).toHaveText(
    "Lagret är tomt. Lägg till varor i Hemma, så kan AI:n föreslå rätter.",
  );
  await expect(visible(page).getByRole("button", { name: "Försök igen" })).toHaveCount(0);
  await visible(page).getByRole("link", { name: "Öppna Hemma" }).click();
  await expect(page).toHaveURL(/\/hemma$/);
});
