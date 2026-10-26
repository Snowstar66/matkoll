import { expect, type Locator, type Page, type Response, test } from "@playwright/test";
import { adminClient, e2eUserId, mealplanEmail, mealplanStorageState } from "./support";

// Story 3.1: Matsedel with its dishes, Lägg till rätt with the favourites
// first and a search of the library, "Lägg på matsedeln" in the recipe view,
// the portion selector with the status for the chosen servings, and removing
// a dish with "Ångra". The spec has an E2E user of its own (mealplanEmail):
// two recipes are made with the service role before the tests, Krämig
// kycklinggryta (a favourite, 4 portions, 2 dl grädde) and Linssoppa (3 dl
// röda linser), with 2 dl grädde in the pantry, and the meal plan starts
// empty. The tests build on each other and run in order.

const mobile = { width: 375, height: 812 };
const gryta = "Krämig kycklinggryta";
const soppa = "Linssoppa";

test.use({ storageState: mealplanStorageState, viewport: mobile });
test.describe.configure({ mode: "serial" });

let userId = "";
const recipeIds: Record<string, string> = {};

/** Upserts the catalog ingredients (they are never deleted) and returns their ids by name. */
async function seedIngredients(names: string[]): Promise<Map<string, string>> {
  const { data, error } = await adminClient()
    .from("ingredient")
    .upsert(
      names.map((name) => ({
        user_id: userId,
        name,
        normalized_name: name.toLocaleLowerCase("sv-SE"),
        section: "Övrigt",
        location: "Kyl",
      })),
      { onConflict: "user_id,normalized_name" },
    )
    .select("id, name");
  if (error) throw error;
  return new Map((data as { id: string; name: string }[]).map((row) => [row.name, row.id]));
}

async function seedRecipe(title: string, isFavorite: boolean, line: { text: string; ingredientId: string; amount: number }) {
  const admin = adminClient();
  const recipe = await admin
    .from("recipe")
    .insert({ user_id: userId, title, original_servings: 4, total_minutes: 30, source_kind: "text", is_favorite: isFavorite })
    .select("id")
    .single();
  if (recipe.error) throw recipe.error;
  const id = (recipe.data as { id: string }).id;
  const inserted = await admin.from("recipe_ingredient").insert({
    user_id: userId,
    recipe_id: id,
    position: 0,
    original_text: line.text,
    amount: line.amount,
    unit: "dl",
    is_vague: false,
    ingredient_id: line.ingredientId,
  });
  if (inserted.error) throw inserted.error;
  recipeIds[title] = id;
}

test.beforeAll(async () => {
  userId = await e2eUserId(mealplanEmail);
  const admin = adminClient();
  // A retry starts again from an empty plan, no recipes and an empty pantry.
  for (const table of ["meal_plan", "pantry_item", "recipe"] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  const ids = await seedIngredients(["Grädde", "Röda linser"]);
  await seedRecipe(gryta, true, { text: "2 dl grädde", ingredientId: ids.get("Grädde")!, amount: 2 });
  await seedRecipe(soppa, false, { text: "3 dl röda linser", ingredientId: ids.get("Röda linser")!, amount: 3 });
  const pantry = await admin
    .from("pantry_item")
    .insert({ user_id: userId, ingredient_id: ids.get("Grädde"), location: "Kyl", amount: 2, unit: "dl" });
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

// Earlier routes stay mounted but hidden after a client navigation, so every
// locator is scoped to what is visible.
const dishes = (page: Page) => page.getByTestId("plan-dish").filter({ visible: true });
const dish = (page: Page, title: string) => dishes(page).filter({ hasText: title });
const addSheet = (page: Page) => page.getByRole("dialog", { name: "Lägg till rätt" });
const toast = (page: Page) => page.getByTestId("toast");
const tab = (page: Page, name: "Recept" | "Matsedel") =>
  page.getByRole("navigation", { name: "Huvudmeny" }).getByRole("link", { name });
/** The empty plan's "Lägg till rätt"; "+" in the header has the same name but no text. */
const emptyStateAdd = (page: Page) =>
  page.getByRole("button", { name: "Lägg till rätt" }).filter({ visible: true }).filter({ hasText: "Lägg till rätt" });
const openAddSheet = (page: Page) =>
  page.locator("header").filter({ visible: true }).getByRole("button", { name: "Lägg till rätt" }).click();

/** Waits until `count` Server Action calls started after this point have answered. */
async function actionsAnswered(page: Page, count: number, act: () => Promise<void>) {
  let answered = 0;
  const seen = (response: Response) => {
    if (response.request().method() === "POST" && "next-action" in response.request().headers()) answered += 1;
  };
  page.on("response", seen);
  await act();
  await expect.poll(() => answered).toBeGreaterThanOrEqual(count);
  page.off("response", seen);
}

/** Swipes the card to the left from its top row with the mouse, which sends the same pointer events as a finger. */
async function swipeLeft(page: Page, card: Locator, distance = 150) {
  const box = await card.boundingBox();
  if (!box) throw new Error("no card");
  const x = box.x + box.width * 0.8;
  const y = box.y + 24;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - distance, y + 4, { steps: 12 });
  await page.mouse.up();
}

async function dishCount(): Promise<number> {
  const { count, error } = await adminClient()
    .from("meal_plan_recipe")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

test("an empty meal plan says so and offers Lägg till rätt", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/matsedel");
  await expect(page.getByText("Ingen rätt på matsedeln än.")).toBeVisible();
  await expect(emptyStateAdd(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test("a favourite is on the plan after two taps, with its own servings", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/matsedel");
  // Tap 1: Lägg till rätt; the sheet shows Favoriter first.
  await emptyStateAdd(page).click();
  const favorites = addSheet(page).getByRole("region", { name: "Favoriter" });
  await expect(favorites.getByTestId("dish-choice")).toHaveCount(1);
  // Tap 2: the favourite.
  await favorites.getByRole("button", { name: new RegExp(gryta) }).click();
  await expect(addSheet(page)).toHaveCount(0);

  await expect(dishes(page)).toHaveCount(1);
  await expect(page.getByTestId("plan-name")).toHaveText(/^Vecka \d{1,2}$/);
  await expect(dish(page, gryta).getByText("4 portioner")).toBeVisible();
  await expect(dish(page, gryta).getByText("Kan lagas nu", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a search in Lägg till rätt finds a recipe by its ingredient and adds it", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/matsedel");
  await openAddSheet(page);
  await addSheet(page).getByRole("searchbox", { name: "Sök recept" }).fill("linser");
  const results = addSheet(page).getByRole("region", { name: "Sökresultat" });
  await results.getByRole("button", { name: new RegExp(soppa) }).click();
  await expect(addSheet(page)).toHaveCount(0);

  await expect(dishes(page)).toHaveCount(2);
  await expect(dish(page, soppa).getByText("Saknar 1 vara", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Lägg på matsedeln in the recipe view adds the same recipe once more", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(`/recept/${recipeIds[gryta]}`);
  await page.getByRole("button", { name: "Lägg på matsedeln" }).click();
  await expect(toast(page)).toHaveText("Lagt på matsedeln.");
  expect(await dishCount()).toBe(3);

  // A client navigation shows the plan the action revalidated.
  await tab(page, "Matsedel").click();
  await expect(page).toHaveURL(/\/matsedel$/);
  await expect(dishes(page)).toHaveCount(3);
  await expect(dish(page, gryta)).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("more servings are saved and the status follows them", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/matsedel");
  const first = dish(page, gryta).first();
  await actionsAnswered(page, 1, () =>
    first.getByRole("button", { name: `Fler portioner, ${gryta}` }).click(),
  );
  await expect(first.getByText("5 portioner")).toBeVisible();
  // 2 dl grädde is enough for 4 portions, not for 5.
  await expect(first.getByText("Saknar 1 vara", { exact: true })).toBeVisible();

  await page.reload();
  await expect(dish(page, gryta).first().getByText("5 portioner")).toBeVisible();
  await expect(dish(page, gryta).nth(1).getByText("4 portioner")).toBeVisible();
  // Fewer again: never below 1.
  await actionsAnswered(page, 1, () =>
    dish(page, gryta).first().getByRole("button", { name: `Färre portioner, ${gryta}` }).click(),
  );
  await expect(dish(page, gryta).first().getByText("Kan lagas nu", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Ta bort removes a dish at once, and Ångra puts it back with the same id", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/matsedel");
  const id = await dish(page, soppa).getAttribute("data-dish");

  await dish(page, soppa).getByRole("button", { name: `Ta bort ${soppa} från matsedeln` }).click();
  await expect(dish(page, soppa)).toHaveCount(0);
  await expect(toast(page)).toContainText(`${soppa} är borttagen från matsedeln.`);
  await expect.poll(dishCount).toBe(2);

  await actionsAnswered(page, 1, () => toast(page).getByRole("button", { name: "Ångra" }).click());
  await expect(dish(page, soppa)).toHaveCount(1);
  await page.reload();
  await expect(dishes(page)).toHaveCount(3);
  expect(await dish(page, soppa).getAttribute("data-dish")).toBe(id);
  expect(errors).toEqual([]);
});

test("a swipe to the left shows Ta bort", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/matsedel");
  const card = dish(page, soppa);
  await swipeLeft(page, card);
  await expect(card.getByTestId("swipe-row-front")).toHaveCSS("transform", "matrix(1, 0, 0, 1, -96, 0)");
  await card.getByRole("button", { name: `Ta bort ${soppa}`, exact: true }).click();
  await expect(dish(page, soppa)).toHaveCount(0);
  await expect(toast(page)).toContainText(`${soppa} är borttagen från matsedeln.`);
  await expect.poll(dishCount).toBe(2);
  expect(errors).toEqual([]);
});
