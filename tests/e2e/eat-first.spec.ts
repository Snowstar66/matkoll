import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { normalizeIngredientText } from "@/features/catalog/domain/normalize";
import { adminClient, clearFoodProfiles, e2eUserId, eatFirstEmail, eatFirstStorageState, seedFoodProfile } from "./support";

// Story 16.13 and Story 25.2: "Vad kan jag laga nu?" on Matvaror and its sheet
// "Kan lagas nu", with AI_PROVIDER=mock. What has lain long is the tip line of
// the sheet (it was the row "Ät det här först"). The spec has an E2E user of
// its own (eatFirstEmail). Before each test the service role empties the
// user's pantry, jobs and recipes, stocks the fridge (lime 9 days old, koriander
// 10 days old, the rest from today) and saves one recipe that uses lime.

type FixtureRecipe = { title: string; ingredients: { name: string }[] };
const fixtures = join(process.cwd(), "tests", "fixtures", "ai");
const dishes = (JSON.parse(readFileSync(join(fixtures, "suggest-dishes-lagt-lange.response.json"), "utf8")) as { suggestions: FixtureRecipe[] })
  .suggestions;
const names = [...new Set(dishes.flatMap((dish) => dish.ingredients.map((line) => line.name)))];
/** Days since each old item was added. */
const oldAges: Record<string, number> = { lime: 9, koriander: 10 };

const jobTime = { timeout: 20_000 };
const shots = process.env.SCREENSHOT_DIR;

test.use({ storageState: eatFirstStorageState, viewport: { width: 390, height: 844 } });
test.describe.configure({ mode: "serial" });

let userId = "";

async function seed({ old }: { old: boolean }) {
  userId = await e2eUserId(eatFirstEmail);
  const admin = adminClient();
  // Nobody has preferences unless a test says so.
  await clearFoodProfiles(userId);
  for (const table of ["ai_job", "pantry_item", "recipe_ingredient", "recipe_step", "recipe"] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  const recipe = await admin
    .from("recipe")
    .insert({ user_id: userId, title: "Linssoppa", original_servings: 4, total_minutes: 30, source_kind: "text" })
    .select("id")
    .single();
  if (recipe.error) throw recipe.error;
  const upsert = await admin
    .from("ingredient")
    .upsert(
      names.map((name) => ({
        user_id: userId,
        name,
        normalized_name: normalizeIngredientText(name),
        section: "Övrigt",
        location: "Kyl",
      })),
      { onConflict: "household_id,normalized_name" },
    )
    .select("id, normalized_name");
  if (upsert.error) throw upsert.error;
  const ids = new Map((upsert.data as { id: string; normalized_name: string }[]).map((row) => [row.normalized_name, row.id]));
  const dayMs = 24 * 60 * 60 * 1000;
  const pantry = await admin.from("pantry_item").insert(
    names.map((name) => ({
      user_id: userId,
      ingredient_id: ids.get(normalizeIngredientText(name))!,
      location: "Kyl",
      amount: null,
      unit: null,
      created_at: new Date(Date.now() - (old ? (oldAges[name] ?? 0) : 0) * dayMs).toISOString(),
    })),
  );
  if (pantry.error) throw pantry.error;
  // The library's recipe uses lime, which is at home: it can be cooked now.
  const line = await admin.from("recipe_ingredient").insert({
    user_id: userId,
    recipe_id: (recipe.data as { id: string }).id,
    position: 0,
    original_text: "2 lime",
    amount: 2,
    unit: null,
    is_vague: false,
    ingredient_id: ids.get(normalizeIngredientText("lime"))!,
  });
  if (line.error) throw line.error;
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

const card = (page: Page) => page.getByTestId("find-dishes");
const sheet = (page: Page) => page.getByTestId("cook-now-sheet");

test("Matvaror has no row for what has lain long, and no tip in the sheet when nothing has", async ({ page }) => {
  await seed({ old: false });
  await page.goto("/hemma");
  await expect(page.getByRole("heading", { name: "Matvaror" })).toBeVisible();
  await expect(page.getByTestId("eat-first-row")).toHaveCount(0);
  await card(page).click();
  await expect(sheet(page)).toBeVisible();
  await expect(page.getByTestId("cook-now-own").first()).toBeVisible();
  await expect(page.getByTestId("cook-now-tip")).toHaveCount(0);
});

test("Vad kan jag laga nu? opens the sheet in place with a library recipe that is Allt hemma", async ({ page }) => {
  const errors = watchErrors(page);
  await seed({ old: false });
  await page.goto("/hemma");
  await card(page).click();
  await expect(page).toHaveURL(/\/hemma/);
  await expect(page.getByRole("dialog", { name: "Vad kan jag laga nu?" })).toBeVisible();
  const own = page.getByTestId("cook-now-own").filter({ hasText: "Linssoppa" });
  await expect(own).toBeVisible();
  await expect(own).toContainText("Allt hemma");
  await own.getByRole("button").click();
  await expect(own.getByRole("link", { name: "Öppna receptet" })).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, "25-2-laga-nu.png") });
  expect(errors).toEqual([]);
});

test("the tip line says what has lain longest, and the job asks in the mode ideas without sending the items", async ({ page }) => {
  await seed({ old: true });
  const bodies: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/ai/jobs") bodies.push(request.postData() ?? "");
  });

  await page.goto("/hemma");
  await card(page).click();
  await expect(page.getByTestId("cook-now-tip")).toHaveText(/koriander har legat i 10 dagar\. Rätterna med den står först\./i);

  await expect.poll(() => bodies.length).toBe(1);
  expect(JSON.parse(bodies[0])).toMatchObject({ kind: "suggest", mode: "ideas" });
  expect(bodies[0]).not.toMatch(/lime|koriander/);
});

test("IDÉER answers like a friend: an intro, text rows, one thing missing apart, and a recipe only on request @flaky", async ({ page }) => {
  const errors = watchErrors(page);
  await seed({ old: false });
  const bodies: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/ai/jobs") bodies.push(request.postData() ?? "");
  });
  await page.goto("/hemma");
  await card(page).click();

  await expect(page.getByTestId("cook-now-intro")).toContainText("Det är tunt hemma, men du har det som behövs", jobTime);
  await expect(page.getByRole("heading", { name: "IDÉER" })).toBeVisible();
  // The mock gives three ideas: one at home, one that misses a thing (apart) and one that misses two (left out).
  const rows = page.getByTestId("cook-now-idea");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Enkel dipp");
  await expect(rows.first()).toContainText("sås");
  await expect(rows.first().getByTestId("cook-now-why")).toHaveText("Använder det du har mest av.");
  await expect(page.getByTestId("cook-now-one-missing")).toContainText("Macka med pålägg");
  await expect(page.getByTestId("cook-now-one-missing")).toContainText("Saknar surdegsbröd");
  await expect(sheet(page)).not.toContainText("Festmiddag");
  if (shots) await page.screenshot({ path: join(shots, "25-4-ideer.png") });

  // Nothing is written until Spara: the recipe job is its own, and the library keeps its one recipe.
  await rows.first().getByRole("button", { name: "Gör ett recept av den" }).click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(JSON.parse(bodies[1])).toMatchObject({ kind: "suggest", mode: "now" });
  expect(JSON.parse(bodies[1]).dish).toMatch(/^Enkel dipp: /);
  await expect(page.getByTestId("cook-now-recipe")).toBeVisible();
  // The run is over when the draft or the calm sentence is there (the mock's dish may or may not pass the check).
  await expect(page.getByTestId("cook-now-recipe")).toContainText(/Spara som recept|inget recept|Försök igen/, jobTime);
  const recipes = await adminClient().from("recipe").select("id").eq("user_id", userId);
  expect(recipes.data).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("hushållets preferenser: the sheet notes an Undviker on a recipe and an idea, and an allergy leaves an idea out", async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => localStorage.setItem("livskoll-option-showFit", "text"));
  await seed({ old: false });
  // The recipe has lime, the mock's dip "buljong med lite gul lök" has lök, and its sandwich has surdegsbröd (gluten).
  await seedFoodProfile(userId, { allergies: ["gluten"], dislikes: ["lime", "lök"] });
  const bodies: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/ai/jobs") bodies.push(request.postData() ?? "");
  });
  await page.goto("/hemma");
  await card(page).click();

  const own = page.getByTestId("cook-now-own").filter({ hasText: "Linssoppa" });
  await expect(own.getByTestId("preference-notes")).toContainText(/undviker lime/);
  const dip = page.getByTestId("cook-now-idea").filter({ hasText: "Enkel dipp" });
  await expect(dip).toBeVisible(jobTime);
  await expect(dip.getByTestId("preference-notes")).toContainText(/undviker lök/);
  // The sandwich may hold gluten: the code leaves it out, whatever the model said.
  await expect(page.getByTestId("cook-now-loading")).toHaveCount(0, jobTime);
  await expect(sheet(page)).not.toContainText("Macka med pålägg");
  // The model was told the lists, without a name.
  expect(JSON.parse(bodies[0])).toMatchObject({ kind: "suggest", mode: "ideas" });
  expect(bodies[0]).not.toMatch(/gluten|lime|lök/);
  if (shots) await page.screenshot({ path: join(shots, "preferenser-laga-nu.png") });
  await clearFoodProfiles(userId);
  expect(errors).toEqual([]);
});

test("without preferences the sheet has no notes", async ({ page }) => {
  await seed({ old: false });
  await page.goto("/hemma");
  await card(page).click();
  await expect(page.getByTestId("cook-now-idea").first()).toBeVisible(jobTime);
  await expect(page.getByTestId("preference-notes")).toHaveCount(0);
});

test("the AI's dishes are temporary: closing the sheet leaves nothing in the list of AI jobs", async ({ page }) => {
  await seed({ old: false });
  await page.goto("/hemma");
  await card(page).click();
  // The run is over when the loading row goes (the mock's dishes may or may not pass the check).
  await expect(page.getByTestId("cook-now-loading")).toHaveCount(0, jobTime);
  await page.getByRole("button", { name: "Klar" }).click();
  // The list the AI jobs sheet shows (active jobs and unseen results) stays empty.
  await expect
    .poll(async () => {
      const response = await page.request.get("/api/ai/jobs");
      return ((await response.json()) as { data: { jobs: unknown[] } }).data.jobs.length;
    }, jobTime)
    .toBe(0);
});
