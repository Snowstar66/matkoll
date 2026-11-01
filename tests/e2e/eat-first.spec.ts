import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { normalizeIngredientText } from "@/features/catalog/domain/normalize";
import { adminClient, e2eUserId, eatFirstEmail, eatFirstStorageState } from "./support";

// Story 16.13: Ät det här först, with AI_PROVIDER=mock (the server answers the
// dishes in tests/fixtures/ai/suggest-dishes-lagt-lange.response.json when the
// message lists items that have lain long). The spec has an E2E user of its
// own (eatFirstEmail). Before each test the service role empties the user's
// pantry, jobs and recipes and stocks the fridge: lime 9 days old, koriander
// 10 days old, the rest from today.

type FixtureRecipe = { title: string; ingredients: { name: string }[] };
const fixtures = join(process.cwd(), "tests", "fixtures", "ai");
const dishes = (JSON.parse(readFileSync(join(fixtures, "suggest-dishes-lagt-lange.response.json"), "utf8")) as { suggestions: FixtureRecipe[] })
  .suggestions;
const [oldDish, , freshDish] = dishes;
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
  for (const table of ["ai_job", "pantry_item", "recipe_ingredient", "recipe_step", "recipe"] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  const recipe = await admin
    .from("recipe")
    .insert({ user_id: userId, title: "Linssoppa", original_servings: 4, total_minutes: 30, source_kind: "text" });
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
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

const row = (page: Page) => page.getByTestId("eat-first-row");

test("Matvaror has no row when nothing has lain long", async ({ page }) => {
  await seed({ old: false });
  await page.goto("/hemma");
  await expect(page.getByRole("heading", { name: "Matvaror" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sök i kylen" }).or(page.getByRole("searchbox"))).toBeVisible();
  await expect(row(page)).toHaveCount(0);
});

test("the row at the top starts suggestions that use what has lain long, and say so", async ({ page }) => {
  const errors = watchErrors(page);
  await seed({ old: true });
  const bodies: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/ai/jobs") bodies.push(request.postData() ?? "");
  });

  await page.goto("/hemma");
  await expect(row(page)).toHaveText(/2 varor har legat länge – föreslå rätter med dem/);
  if (shots) await page.screenshot({ path: join(shots, "matvaror-rad.png") });
  await row(page).click();

  // Only the flag goes from the client: never the items.
  await expect.poll(() => bodies.length).toBe(1);
  expect(JSON.parse(bodies[0])).toMatchObject({ kind: "suggest", eatFirst: true });
  expect(bodies[0]).not.toMatch(/lime|koriander/);

  await page.getByTestId("toast").getByRole("button", { name: "Visa" }).click(jobTime);
  const cards = page.getByTestId("ai-suggestions").getByTestId("ai-suggestion");
  await expect(cards).toHaveCount(3, jobTime);
  const card = cards.filter({ hasText: oldDish.title });
  await expect(card.getByTestId("ai-suggestion-old")).toHaveText("Använder koriander och lime som legat en vecka");
  await expect(cards.filter({ hasText: freshDish.title }).getByTestId("ai-suggestion-old")).toHaveCount(0);
  if (shots) {
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(shots, "forslag-orsak.png") });
  }
  expect(errors).toEqual([]);
});
