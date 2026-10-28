import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { normalizeIngredientText } from "@/features/catalog/domain/normalize";
import { adminClient, aiStreamEmail, aiStreamStorageState, e2eUserId } from "./support";

// Story 12.7: the first suggested dish shows as soon as it is ready
// (AI_PROVIDER=mock, and AI_MOCK_DELAY_MS=3000 from playwright.config.ts: the
// mock gives its three dishes one second apart, so the whole takes 3 s and the
// page, which polls every 2 s, sees the first before the third). The spec has
// an E2E user of its own (aiStreamEmail); each test empties its AI jobs,
// recipes and pantry and seeds the catalog and pantry with the service role.

type FixtureLine = { name: string; new: unknown };
const fixtures = join(process.cwd(), "tests", "fixtures", "ai");
const suggested = (JSON.parse(readFileSync(join(fixtures, "suggest-dishes.response.json"), "utf8")) as { suggestions: { title: string; ingredients: FixtureLine[] }[] }).suggestions;
const titles = suggested.map((recipe) => recipe.title);
const names = [...new Set(suggested.flatMap((recipe) => recipe.ingredients.filter((line) => line.new === null).map((line) => line.name)))];


test.use({ storageState: aiStreamStorageState, viewport: { width: 375, height: 812 } });
// One user for all the tests: each seeds it again, so they must not run at the same time.
test.describe.configure({ mode: "serial" });

let userId = "";

test.beforeEach(async () => {
  userId = await e2eUserId(aiStreamEmail);
  const admin = adminClient();
  // Children before parents, so nothing relies on the cascades.
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

  const ingredients = await admin
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
    .select("id");
  if (ingredients.error) throw ingredients.error;
  const pantry = await admin.from("pantry_item").insert(
    (ingredients.data as { id: string }[]).map(({ id }) => ({
      user_id: userId,
      ingredient_id: id,
      location: "Skafferi",
      amount: null,
      unit: null,
    })),
  );
  if (pantry.error) throw pantry.error;
});


const section = (page: Page) => page.getByRole("region", { name: "AI-förslag" }).filter({ visible: true });
const cards = (page: Page) => section(page).getByRole("listitem");
const suggestButton = (page: Page) => page.getByRole("button", { name: "Föreslå rätter med AI" }).filter({ visible: true });
const pill = (page: Page, name: "Alla" | "Kan lagas nu") => page.getByRole("radio", { name }).filter({ visible: true });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Spara AI-förslag" });

async function openSuggestions(page: Page) {
  await page.goto("/recept");
  await pill(page, "Kan lagas nu").click();
  await expect(suggestButton(page)).toBeVisible();
}

test("shows the first dish with Letar efter fler … before the last one has come", async ({ page }) => {
  await openSuggestions(page);
  await suggestButton(page).click();

  await expect(cards(page).first()).toBeVisible({ timeout: 20_000 });
  // The job is not done yet: fewer than three, Letar efter fler … and Avbryt are there.
  expect(await cards(page).count()).toBeLessThan(3);
  await expect(page.getByText("Letar efter fler …").filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Avbryt" }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText(`Ny rätt: ${titles[0]}.`)).toBeAttached();

  // Then all three, with the first one still first and the progress gone.
  await expect(cards(page)).toHaveCount(3, { timeout: 20_000 });
  await expect(cards(page).first()).toContainText(titles[0]);
  await expect(page.getByText("Letar efter fler …")).toHaveCount(0);
});

test("saves the first dish before the others have come", async ({ page }) => {
  await openSuggestions(page);
  await suggestButton(page).click();
  await expect(cards(page).first()).toBeVisible({ timeout: 20_000 });

  await section(page).getByRole("button", { name: `Spara ${titles[0]}` }).click();
  await sheet(page).getByRole("button", { name: "Spara recept" }).click();

  // Saving opens the recipe; the job goes on, and the other dishes are there when Pontus is back in the library.
  await expect(page.getByRole("heading", { level: 1, name: titles[0] })).toBeVisible();
  await page.goto("/recept");
  await pill(page, "Kan lagas nu").click();
  await expect(section(page).getByRole("button", { name: `Spara ${titles[1]}` })).toBeVisible({ timeout: 20_000 });
  await expect(section(page).getByRole("button", { name: `Spara ${titles[2]}` })).toBeVisible({ timeout: 20_000 });
});
