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
// has a row), a catalog ingredient for each line name from the pantry
// (`new: null`) in the mock's two answer sets, and each of them at home: as
// much as the first suggestion needs for its own lines (so it can be cooked
// now once it is saved), always enough for the rest (so every suggestion
// uses the pantry and is kept).
//
// Story 12.4: AI-förslag are an AI job. POST /api/ai/jobs answers 202 with the
// job at once, the mock takes AI_MOCK_DELAY_MS (3 s, playwright.config.ts)
// and the page polls the job (ai-jobs.spec.ts has the queue, the job row and
// the badge). The rows here are those of Story 5.2's matrix as they are now:
// what Avbryt stops, what is saved, and the errors.
//
// Story 12.3: the fixtures are the compact answer the model gives (a line
// without an amount is vague). The one line outside the pantry, with `new`
// (grönsaksbuljong in Morotssoppa med vitlök), is neither in the catalog nor
// at home: an earlier run's catalog row for it is renamed before each test
// (catalog rows cannot be deleted), so the preview
// proposes it as a new ingredient, and saving makes it with the section and
// place from `new`.
type FixtureLine = {
  text: string;
  amount: number | null;
  unit: string | null;
  name: string;
  new: { section: string; location: string; defaultUnit: string } | null;
};
type FixtureRecipe = { title: string; ingredients: FixtureLine[] };

const fixtures = join(process.cwd(), "tests", "fixtures", "ai");
const answerSet = (name: string) =>
  (JSON.parse(readFileSync(join(fixtures, `${name}.response.json`), "utf8")) as { suggestions: FixtureRecipe[] }).suggestions;
const suggested = answerSet("suggest-dishes");
/** What the mock answers when every title of the first set is to be avoided. */
const others = answerSet("suggest-dishes-andra");
const [first] = suggested;
const titles = suggested.map((recipe) => recipe.title);
/** The dish with a line outside the pantry, and that line (Story 12.3). */
const soup = others.find((recipe) => recipe.ingredients.some((line) => line.new !== null))!;
const newLine = soup.ingredients.find((line) => line.new !== null)!;
const soppa = "Linssoppa";
const reservedUnavailable = "matkoll-mock: ai_unavailable";

/** The mock's delay plus the polling of the page (every 2 s): how long a job may take to show. */
const jobTime = { timeout: 20_000 };

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
    .select("id, normalized_name");
  if (error) throw error;
  // Story 10.4: the catalog stores "Gul lök" for "gul lök", so the rows are found by their normalised name.
  const byNormalized = new Map((data as { id: string; normalized_name: string }[]).map((row) => [row.normalized_name, row.id]));
  const ids = new Map(
    names.flatMap((name) => {
      const id = byNormalized.get(normalizeIngredientText(name));
      return id === undefined ? [] : [[name, id] as const];
    }),
  );
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
  // Story 12.4: no job of an earlier test is left (a run of it that is still on its way sees it gone and stops).
  const jobs = await admin.from("ai_job").delete().eq("user_id", userId);
  if (jobs.error) throw jobs.error;
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

  // Story 12.3: the line outside the pantry is not in the catalog. Catalog
  // rows are never deleted (not even by the service role), so the row an
  // earlier run's save made gets a name of its own that matches nothing, and
  // loses its synonyms.
  const stale = await admin
    .from("ingredient")
    .select("id")
    .eq("user_id", userId)
    .eq("normalized_name", normalizeIngredientText(newLine.name));
  if (stale.error) throw stale.error;
  for (const { id } of stale.data as { id: string }[]) {
    const synonyms = await admin.from("ingredient_synonym").delete().eq("user_id", userId).eq("ingredient_id", id);
    if (synonyms.error) throw synonyms.error;
    const retired = `e2e-undanlagd-${id}`;
    const renamed = await admin
      .from("ingredient")
      .update({ name: retired, normalized_name: normalizeIngredientText(retired) })
      .eq("user_id", userId)
      .eq("id", id);
    if (renamed.error) throw renamed.error;
  }

  const names = [
    ...new Set(
      [...suggested, ...others].flatMap((recipe) => recipe.ingredients.filter((line) => line.new === null).map((line) => line.name)),
    ),
  ];
  const ids = await seedIngredients(names);
  // The first suggestion's lines: as much as each needs, in its unit (a count
  // without one is st); vague lines and everything else: always enough.
  const firstLines = new Map(first.ingredients.map((line) => [line.name, line]));
  await seedPantry(
    names.map((name) => {
      const line = firstLines.get(name);
      const exact = line && line.amount !== null;
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

/** True for the request that starts an AI job. */
const isStart = (request: { method: () => string; url: () => string }) =>
  request.method() === "POST" && new URL(request.url()).pathname === "/api/ai/jobs";

/** Counts the jobs the page starts. */
function countSuggestCalls(page: Page): () => number {
  let count = 0;
  page.on("request", (request) => {
    if (isStart(request)) count++;
  });
  return () => count;
}

/** The status of the user's latest AI job, read with the service role. */
async function latestJobStatus(): Promise<string | null> {
  const { data, error } = await adminClient()
    .from("ai_job")
    .select("status")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data[0]?.status ?? null;
}

// Earlier routes stay mounted but hidden after a client navigation, so every
// locator is scoped to what is visible.
const visible = (page: Page) => page.locator("main").filter({ visible: true });
const rows = (page: Page) => page.getByTestId("recipe-card").filter({ visible: true });
const pill = (page: Page, name: "Alla" | "Kan lagas nu") => page.getByRole("radio", { name }).filter({ visible: true });
const section = (page: Page) => page.getByRole("region", { name: "AI-förslag" }).filter({ visible: true });
const cards = (page: Page) => section(page).getByRole("listitem");
const suggestButton = (page: Page) => page.getByRole("button", { name: "Föreslå rätter med AI" }).filter({ visible: true });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Spara AI-förslag" });
const tab = (page: Page, name: "Recept" | "Matvaror") =>
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

  // The job takes 3 s, so "Letar efter idéer …" stays until Avbryt, which stops the job.
  const started = page.waitForResponse((response) => isStart(response.request()));
  await suggestButton(page).click();
  expect((await started).status()).toBe(202);
  await expect(visible(page).getByRole("status").getByText("Letar efter idéer …").first()).toBeVisible();
  await expect(visible(page).getByText("Du kan göra annat under tiden.")).toBeVisible();
  await visible(page).getByRole("button", { name: "Avbryt" }).click();
  await expect(suggestButton(page)).toBeFocused();
  await expect(visible(page).getByText("Letar efter idéer …")).toHaveCount(0);
  await expect(visible(page).getByRole("alert")).toHaveCount(0);
  await expect.poll(latestJobStatus).toBe("cancelled");
  // Nothing comes for the job that was stopped, however long the mock waits.
  await page.waitForTimeout(4_000);
  await expect(section(page)).toHaveCount(0);
  await expect(visible(page).getByRole("alert")).toHaveCount(0);

  // The mock answers.
  const answered = page.waitForResponse((response) => isStart(response.request()));
  await suggestButton(page).click();
  expect((await answered).status()).toBe(202);
  await expect(cards(page)).toHaveCount(3, jobTime);
  await expect(section(page).getByRole("heading", { level: 2, name: "AI-förslag" })).toBeFocused();
  await expect(section(page).getByRole("heading", { level: 3 })).toHaveText(titles);
  await expect(cards(page).first().getByText("35 min · 4 portioner")).toBeVisible();
  for (const card of await cards(page).all()) await expect(card.getByText("AI-förslag", { exact: true })).toBeVisible();
  await expect(cards(page).first().getByText(/^Med:(?:\s|$)/)).toBeVisible();
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
  const again = page.waitForRequest(isStart);
  await visible(page).getByRole("button", { name: "Föreslå andra rätter" }).click();
  expect((await again).postDataJSON()).toEqual({
    kind: "suggest",
    clientKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
    avoidTitles: [...titles.slice(1), first.title],
  });
  await expect(section(page).getByRole("heading", { level: 3 })).toHaveText(
    others.map((recipe) => recipe.title),
    jobTime,
  );

  // Story 12.3: the line with `new` is proposed as a new catalog ingredient; the lines from the pantry are matched.
  await section(page).getByRole("button", { name: `Spara ${soup.title}` }).click();
  await expect(sheet(page)).toBeVisible();
  const lines = sheet(page).getByTestId("recipe-line");
  await expect(lines).toHaveCount(soup.ingredients.length);
  const proposed = lines.filter({ hasText: newLine.text });
  await expect(proposed.getByText("Ny", { exact: true })).toBeVisible();
  await expect(lines.filter({ hasNotText: newLine.text }).getByText("Ny", { exact: true })).toHaveCount(0);
  await sheet(page).getByRole("button", { name: "Spara recept" }).click();
  await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: soup.title })).toBeVisible();
  // Saving made the catalog ingredient with the section, place and unit from `new`.
  const made = await adminClient()
    .from("ingredient")
    .select("section, location, default_unit")
    .eq("user_id", userId)
    .eq("normalized_name", normalizeIngredientText(newLine.name))
    .single();
  if (made.error) throw made.error;
  expect(made.data).toEqual({
    section: newLine.new!.section,
    location: newLine.new!.location,
    default_unit: newLine.new!.defaultUnit,
  });
  expect(errors.filter((error) => !error.includes("Failed to load resource"))).toEqual([]);
});

test("the AI out of reach: the text and Försök igen, while the library works", async ({ page }) => {
  const errors = watchErrors(page);
  const ids = await seedIngredients([reservedUnavailable]);
  await seedPantry([{ ingredientId: ids.get(reservedUnavailable)!, amount: null, unit: null }]);

  await page.goto("/recept");
  await pill(page, "Kan lagas nu").click();
  const answered = page.waitForResponse((response) => isStart(response.request()));
  await suggestButton(page).click();
  // The job is made, and fails: the answer comes with the job, not with the request.
  expect((await answered).status()).toBe(202);
  const alert = visible(page).getByRole("alert");
  await expect(alert).toHaveText("AI-tjänsten svarar inte just nu. Är datorn med modellen igång?", jobTime);
  await expect(visible(page).getByRole("button", { name: "Försök igen" })).toBeVisible();
  await expect(section(page)).toHaveCount(0);

  // Försök igen starts another job, with the same answer.
  const again = page.waitForResponse((response) => isStart(response.request()));
  await visible(page).getByRole("button", { name: "Försök igen" }).click();
  expect((await again).status()).toBe(202);
  await expect(alert).toHaveCount(0);
  await expect(alert).toBeVisible(jobTime);

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

test("an empty pantry: the text with Öppna Matvaror, and the AI is not asked", async ({ page }) => {
  const { error } = await adminClient().from("pantry_item").delete().eq("user_id", userId);
  if (error) throw error;

  await page.goto("/recept");
  await pill(page, "Kan lagas nu").click();
  const answered = page.waitForResponse((response) => isStart(response.request()));
  await suggestButton(page).click();
  // Nothing is queued for an empty pantry: the answer is at once.
  expect((await answered).status()).toBe(422);
  expect(await latestJobStatus()).toBeNull();
  await expect(visible(page).getByRole("alert")).toHaveText(
    "Matvarorna är tomma. Lägg till varor i Matvaror, så kan AI:n föreslå rätter.",
  );
  await expect(visible(page).getByRole("button", { name: "Försök igen" })).toHaveCount(0);
  await visible(page).getByRole("link", { name: "Öppna Matvaror" }).click();
  await expect(page).toHaveURL(/\/hemma$/);
});
