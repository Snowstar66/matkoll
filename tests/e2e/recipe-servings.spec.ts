import { expect, type Locator, type Page, test } from "@playwright/test";
import { normalizeIngredientText } from "@/features/catalog/domain/normalize";
import { adminClient, e2eUserId, recipeViewEmail, recipeViewStorageState } from "./support";

// Story 4.1: the portion selector and "X av Y hemma" in the recipe view. The
// spec has an E2E user of its own (recipeViewEmail). Before each test the
// meal plan, the pantry and the recipes are emptied, and Krämig
// kycklinggryta (4 portions, 35 min) is made with the service role: 2 dl
// grädde, 1 st gul lök, 2 dl vetemjöl, "salt efter smak" (vague) and "2
// citroner" (no catalog ingredient). At home: 4 dl grädde, 5 st gul lök,
// vetemjöl only in kg, and salt without amount. So, for 4 portions, the flour
// is short and three of the four catalog ingredients are at home; from 10
// portions the cream is short too.

const mobile = { width: 375, height: 812 };
const desktop = { width: 1280, height: 900 };
const title = "Krämig kycklinggryta";

test.use({ storageState: recipeViewStorageState, viewport: mobile });
// One user for all the tests: each seeds it again, so they must not run at the same time.
test.describe.configure({ mode: "serial" });

let userId = "";
let recipeId = "";

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
  return new Map((data as { id: string; name: string }[]).map((row) => [row.name, row.id]));
}

test.beforeEach(async () => {
  userId = await e2eUserId(recipeViewEmail);
  const admin = adminClient();
  for (const table of ["meal_plan", "pantry_item", "recipe"] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  const ids = await seedIngredients(["Grädde", "Gul lök", "Vetemjöl", "Salt"]);
  const id = (name: string) => ids.get(name)!;

  const recipe = await admin
    .from("recipe")
    .insert({ user_id: userId, title, original_servings: 4, total_minutes: 35, source_kind: "text" })
    .select("id")
    .single();
  if (recipe.error) throw recipe.error;
  recipeId = (recipe.data as { id: string }).id;

  const lines = await admin.from("recipe_ingredient").insert(
    [
      { original_text: "2 dl grädde", amount: 2, unit: "dl", is_vague: false, ingredient_id: id("Grädde") },
      { original_text: "1 gul lök", amount: 1, unit: "st", is_vague: false, ingredient_id: id("Gul lök") },
      { original_text: "2 dl vetemjöl", amount: 2, unit: "dl", is_vague: false, ingredient_id: id("Vetemjöl") },
      { original_text: "salt efter smak", amount: null, unit: null, is_vague: true, ingredient_id: id("Salt") },
      { original_text: "2 citroner", amount: 2, unit: null, is_vague: false, ingredient_id: null },
    ].map((line, position) => ({ ...line, user_id: userId, recipe_id: recipeId, position })),
  );
  if (lines.error) throw lines.error;

  const steps = await admin.from("recipe_step").insert(
    ["Fräs löken.", "Häll i grädden och låt puttra."].map((text, position) => ({
      user_id: userId,
      recipe_id: recipeId,
      position,
      text,
    })),
  );
  if (steps.error) throw steps.error;

  const pantry = await admin.from("pantry_item").insert(
    [
      { ingredient_id: id("Grädde"), location: "Kyl", amount: 4, unit: "dl" },
      { ingredient_id: id("Gul lök"), location: "Skafferi", amount: 5, unit: "st" },
      { ingredient_id: id("Vetemjöl"), location: "Skafferi", amount: 1, unit: "kg" },
      { ingredient_id: id("Salt"), location: "Skafferi", amount: null, unit: null },
    ].map((item) => ({ ...item, user_id: userId })),
  );
  if (pantry.error) throw pantry.error;
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

/**
 * Counts the requests to the server the page makes from now on that are
 * Server Action calls or RSC fetches (a refresh or a navigation); prefetches
 * of links are left out.
 */
function countServerCalls(page: Page): () => number {
  let calls = 0;
  page.on("request", (request) => {
    const headers = request.headers();
    const action = request.method() === "POST" && "next-action" in headers;
    const rsc = (request.url().includes("_rsc=") || "rsc" in headers) && !("next-router-prefetch" in headers);
    if (action || rsc) calls += 1;
  });
  return () => calls;
}

// Earlier routes stay mounted but hidden after a client navigation, so every
// locator is scoped to what is visible.
const view = (page: Page) => page.getByRole("article").filter({ visible: true });
const line = (page: Page, text: string) => view(page).getByTestId("recipe-view-line").filter({ hasText: text });
const mark = (row: Locator) => row.getByRole("img");
const fewer = (page: Page) => view(page).getByRole("button", { name: "Färre portioner" });
const more = (page: Page) => view(page).getByRole("button", { name: "Fler portioner" });
const atHome = (page: Page) => view(page).getByTestId("recipe-at-home");

async function tap(button: Locator, times: number) {
  for (let i = 0; i < times; i++) await button.click();
}

test("the portion selector scales the amounts and the status at once, without calling the server", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(`/recept/${recipeId}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(view(page).getByTestId("recipe-meta")).toHaveText("35 min");
  await expect(view(page).getByText("4 portioner", { exact: true })).toBeVisible();
  await expect(view(page).getByText("Saknar 1 vara", { exact: true })).toBeVisible();
  await expect(atHome(page)).toHaveText("3 av 4 hemma");
  await expect(mark(line(page, "grädde"))).toHaveAccessibleName("finns hemma");
  await expect(line(page, "grädde").getByText("2 dl", { exact: true })).not.toHaveClass(/text-sky-ink/);
  await expect(mark(line(page, "vetemjöl"))).toHaveAccessibleName("saknas");
  await expect(line(page, "vetemjöl").getByText("hemma: 1 kg")).toBeVisible();
  await expect(mark(line(page, "citroner"))).toHaveAccessibleName("jämförs inte med lagret");

  await page.waitForLoadState("networkidle");
  const serverCalls = countServerCalls(page);
  // 10 portions need 5 dl cream, where 4 dl is at home.
  await tap(more(page), 6);
  await expect(view(page).getByText("10 portioner", { exact: true })).toBeVisible();
  await expect(line(page, "grädde").getByText("5 dl", { exact: true })).toHaveClass(/text-sky-ink/);
  await expect(mark(line(page, "grädde"))).toHaveAccessibleName("saknas");
  await expect(line(page, "grädde").getByText("hemma: 4 dl")).toBeVisible();
  await expect(view(page).getByText("Saknar 2 varor", { exact: true })).toBeVisible();
  await expect(atHome(page)).toHaveText("2 av 4 hemma");
  await expect(line(page, "gul lök").getByText("2,5 st", { exact: true })).toBeVisible();
  // Not scaled: the vague line and the text of the line without ingredient, which shows the factor.
  await expect(line(page, "salt")).toHaveText("salt efter smak");
  await expect(line(page, "citroner")).toHaveText(/^2 citroner\s*×2,5$/);

  // Down to 1: no rounding to whole pieces, and − stops there.
  await tap(fewer(page), 9);
  await expect(view(page).getByText("1 portion", { exact: true })).toBeVisible();
  await expect(line(page, "gul lök").getByText("0,25 st", { exact: true })).toBeVisible();
  await expect(fewer(page)).toHaveAttribute("aria-disabled", "true");
  // Playwright will not click an aria-disabled button; it stays in the tab order, so press it.
  await fewer(page).press("Enter");
  await expect(view(page).getByText("1 portion", { exact: true })).toBeVisible();
  await expect(mark(line(page, "grädde"))).toHaveAccessibleName("finns hemma");
  await expect(atHome(page)).toHaveText("3 av 4 hemma");
  expect(serverCalls()).toBe(0);

  // The choice is kept only while the page is open.
  await page.reload();
  await expect(view(page).getByText("4 portioner", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("on a phone the ingredients come above the steps, and the selector fits without scrolling sideways", async ({ page }) => {
  await page.goto(`/recept/${recipeId}`);
  const ingredients = view(page).getByRole("region", { name: "Ingredienser" });
  const steps = view(page).getByRole("region", { name: "Steg" });
  const [top, bottom] = await Promise.all([ingredients.boundingBox(), steps.boundingBox()]);
  expect(top && bottom && top.y + top.height <= bottom.y).toBe(true);
  const box = await more(page).boundingBox();
  expect(box && box.width >= 44 && box.height >= 44).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(mobile.width);
});

test.describe("on a computer", () => {
  test.use({ viewport: desktop });

  test("the ingredients and the steps are side by side", async ({ page }) => {
    await page.goto(`/recept/${recipeId}`);
    const ingredients = view(page).getByRole("region", { name: "Ingredienser" });
    const steps = view(page).getByRole("region", { name: "Steg" });
    const [left, right] = await Promise.all([ingredients.boundingBox(), steps.boundingBox()]);
    expect(left && right && left.x + left.width <= right.x).toBe(true);
    expect(left && right && Math.abs(left.y - right.y) < 1).toBe(true);
  });
});

test("the heart keeps the chosen servings, and Lägg på matsedeln adds the dish with them", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(`/recept/${recipeId}`);
  await tap(more(page), 2);
  await expect(view(page).getByText("6 portioner", { exact: true })).toBeVisible();

  // The save bumps the recipe's updated_at, and the page's next render brings it again.
  const saved = page.waitForResponse(
    (response) => response.request().method() === "POST" && "next-action" in response.request().headers(),
  );
  await view(page).getByRole("button", { name: "Favorit", pressed: false }).click();
  await saved;
  await expect(view(page).getByRole("button", { name: "Favorit", pressed: true })).toBeVisible();
  const { data, error } = await adminClient().from("recipe").select("is_favorite").eq("id", recipeId).single();
  if (error) throw error;
  expect((data as { is_favorite: boolean }).is_favorite).toBe(true);
  await expect(view(page).getByText("6 portioner", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Lägg på matsedeln" }).filter({ visible: true }).click();
  await expect(page.getByTestId("toast")).toHaveText("Lagt på matsedeln.");

  // A client navigation shows the plan the action revalidated.
  await page.getByRole("navigation", { name: "Huvudmeny" }).getByRole("link", { name: "Matsedel" }).click();
  await expect(page).toHaveURL(/\/matsedel$/);
  const dish = page.getByTestId("plan-dish").filter({ visible: true }).filter({ hasText: title });
  await expect(dish).toHaveCount(1);
  await expect(dish.getByText("6 portioner", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
