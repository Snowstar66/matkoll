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
//
// Story 3.2: Tidigare matsedlar. Earlier plans are made with the service role
// (Vecka 42 with a dish whose recipe is deleted, and an empty Vecka 41 from
// last year); "Använd igen", "Ny matsedel" and "Ta bort matsedel" with its
// question follow.

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

/** Answers "Ta bort <rätt> från matsedeln?" with "Ta bort". */
async function confirmRemoval(page: Page) {
  await removalQuestion(page).getByRole("button", { name: "Ta bort", exact: true }).click();
}
const removalQuestion = (page: Page) => page.getByRole("dialog", { name: "Ta bort från matsedeln" });

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
  await expect(dish(page, gryta).getByTestId("dish-meta")).toContainText("Allt finns hemma");
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
  await expect(dish(page, soppa).getByTestId("dish-meta")).toContainText("0 av 1 hemma");
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
  await expect(first.getByTestId("dish-meta")).toContainText("0 av 1 hemma");

  await page.reload();
  await expect(dish(page, gryta).first().getByText("5 portioner")).toBeVisible();
  await expect(dish(page, gryta).nth(1).getByText("4 portioner")).toBeVisible();
  // Fewer again: never below 1.
  await actionsAnswered(page, 1, () =>
    dish(page, gryta).first().getByRole("button", { name: `Färre portioner, ${gryta}` }).click(),
  );
  await expect(dish(page, gryta).first().getByTestId("dish-meta")).toContainText("Allt finns hemma");
  expect(errors).toEqual([]);
});

test("Ta bort removes a dish at once, and Ångra puts it back with the same id", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/matsedel");
  const id = await dish(page, soppa).getAttribute("data-dish");

  await dish(page, soppa).getByRole("button", { name: `Ta bort ${soppa} från matsedeln` }).click();
  await confirmRemoval(page);
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
  await confirmRemoval(page);
  await expect(dish(page, soppa)).toHaveCount(0);
  await expect(toast(page)).toContainText(`${soppa} är borttagen från matsedeln.`);
  await expect.poll(dishCount).toBe(2);
  expect(errors).toEqual([]);
});

// Story 13.3: the trash asks first, then removes within a minute without
// asking, and the shopping list follows. Servings were covered above; moving
// a dish to another day waits, since the plan has no days (see the spec).
test("the trash asks before it removes, the next removals go at once and the list follows", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/lista");
  await expect(page.getByTestId("shopping-line").filter({ visible: true }).filter({ hasText: "Grädde" })).toHaveCount(1);

  await page.goto("/matsedel");
  const trash = (index: number) => dishes(page).nth(index).getByRole("button", { name: `Ta bort ${gryta} från matsedeln` });
  const box = (await trash(0).boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await trash(0).click();
  await expect(removalQuestion(page)).toContainText(`Ta bort ${gryta} från matsedeln?`);
  await removalQuestion(page).getByRole("button", { name: "Avbryt" }).click();
  await expect(dishes(page)).toHaveCount(2);
  expect(await dishCount()).toBe(2);

  await trash(0).click();
  await confirmRemoval(page);
  await expect(dishes(page)).toHaveCount(1);
  // Within a minute the next one goes without a question.
  await trash(0).click();
  await expect(removalQuestion(page)).toHaveCount(0);
  await expect(dishes(page)).toHaveCount(0);
  await expect.poll(dishCount).toBe(0);

  await page.goto("/lista");
  await expect(page.getByText("Lägg rätter på matsedeln så räknas listan fram.").filter({ visible: true })).toBeVisible();

  // Put the dishes back for the tests that follow.
  const admin = adminClient();
  const plan = await admin.from("meal_plan").select("id").eq("user_id", userId).eq("is_current", true).single();
  if (plan.error) throw plan.error;
  const restored = await admin.from("meal_plan_recipe").insert(
    [0, 1].map((position) => ({
      user_id: userId,
      meal_plan_id: (plan.data as { id: string }).id,
      recipe_id: recipeIds[gryta],
      recipe_title: gryta,
      servings: 4,
      position,
    })),
  );
  if (restored.error) throw restored.error;
  expect(errors).toEqual([]);
});

// Story 3.2: Tidigare matsedlar.

const previousPlans = (page: Page) => page.getByTestId("previous-plan").filter({ visible: true });
const previousDishes = (page: Page) => page.getByTestId("previous-dish").filter({ visible: true });
const planIds: Record<string, string> = {};

async function plansOfUser() {
  const { data, error } = await adminClient()
    .from("meal_plan")
    .select("id, name, is_current")
    .eq("user_id", userId)
    .order("created_at");
  if (error) throw error;
  return data as { id: string; name: string; is_current: boolean }[];
}

async function seedEarlierPlan(name: string, createdAt: string, dishes: { recipeId: string | null; title: string; servings: number }[]) {
  const admin = adminClient();
  const plan = await admin
    .from("meal_plan")
    .insert({ user_id: userId, name, is_current: false, created_at: createdAt })
    .select("id")
    .single();
  if (plan.error) throw plan.error;
  const id = (plan.data as { id: string }).id;
  if (dishes.length > 0) {
    const inserted = await admin.from("meal_plan_recipe").insert(
      dishes.map((dish, position) => ({
        user_id: userId,
        meal_plan_id: id,
        recipe_id: dish.recipeId,
        recipe_title: dish.title,
        servings: dish.servings,
        position,
      })),
    );
    if (inserted.error) throw inserted.error;
  }
  planIds[name] = id;
}

test("Tidigare in the header says when there are no earlier plans", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/matsedel");
  await page.locator("header").filter({ visible: true }).getByRole("link", { name: "Tidigare" }).click();
  await expect(page).toHaveURL(/\/matsedel\/tidigare$/);
  await expect(page.getByRole("heading", { name: "Tidigare matsedlar", level: 1 })).toBeVisible();
  await expect(page.getByText("Inga tidigare matsedlar än.").filter({ visible: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the earlier plans show newest first with their dishes and the date they were made", async ({ page }) => {
  const errors = watchErrors(page);
  await seedEarlierPlan("Vecka 41", "2025-10-06T08:00:00Z", []);
  await seedEarlierPlan("Vecka 42", "2026-10-12T08:00:00Z", [
    { recipeId: recipeIds[soppa], title: soppa, servings: 2 },
    { recipeId: null, title: "Gammal paj", servings: 4 },
    { recipeId: recipeIds[gryta], title: gryta, servings: 6 },
  ]);
  await page.goto("/matsedel/tidigare");
  await expect(previousPlans(page)).toHaveCount(2);
  await expect(previousPlans(page).nth(0)).toContainText("Vecka 42");
  await expect(previousPlans(page).nth(0)).toContainText("3 rätter · skapad 12 okt 2026");
  await expect(previousPlans(page).nth(1)).toContainText("Vecka 41");
  await expect(previousPlans(page).nth(1)).toContainText("0 rätter · skapad 6 okt 2025");

  await previousPlans(page).nth(0).getByRole("link", { name: "Vecka 42" }).click();
  await expect(page).toHaveURL(new RegExp(`/matsedel/tidigare/${planIds["Vecka 42"]}$`));
  await expect(previousDishes(page)).toHaveCount(3);
  await expect(previousDishes(page).nth(0)).toContainText(`${soppa}2 portioner`);
  await expect(previousDishes(page).nth(1)).toContainText("Borttaget recept: Gammal paj");
  await expect(previousDishes(page).nth(2)).toContainText(`${gryta}6 portioner`);
  await expect(page.getByTestId("reuse-note").filter({ visible: true })).toHaveText(
    "1 rätt med borttaget recept följer inte med.",
  );
  expect(errors).toEqual([]);
});

test("Använd igen makes a new current plan with the same dishes and servings, without the deleted recipe", async ({ page }) => {
  const errors = watchErrors(page);
  const before = await plansOfUser();
  const current = before.find(({ is_current }) => is_current);
  await page.goto(`/matsedel/tidigare/${planIds["Vecka 42"]}`);
  await page.getByRole("button", { name: "Använd igen" }).click();

  await expect(page).toHaveURL(/\/matsedel$/);
  await expect(toast(page)).toHaveText("Matsedeln är skapad.");
  await expect(dishes(page)).toHaveCount(2);
  await expect(dishes(page).nth(0)).toContainText(soppa);
  await expect(dishes(page).nth(0).getByText("2 portioner")).toBeVisible();
  await expect(dishes(page).nth(1)).toContainText(gryta);
  await expect(dishes(page).nth(1).getByText("6 portioner")).toBeVisible();
  await expect(page.getByTestId("plan-name").filter({ visible: true })).toHaveText(/^Vecka \d{1,2}$/);

  // One current plan; the one that was current is an earlier plan now.
  const after = await plansOfUser();
  expect(after).toHaveLength(before.length + 1);
  expect(after.filter(({ is_current }) => is_current)).toHaveLength(1);
  expect(after.find(({ id }) => id === current?.id)?.is_current).toBe(false);
  await page.goto("/matsedel/tidigare");
  await expect(previousPlans(page)).toHaveCount(3);
  expect(errors).toEqual([]);
});

test("Ny matsedel makes an empty current plan", async ({ page }) => {
  const errors = watchErrors(page);
  const before = await plansOfUser();
  await page.goto("/matsedel/tidigare");
  await page.getByRole("button", { name: "Ny matsedel" }).click();
  await expect(page).toHaveURL(/\/matsedel$/);
  await expect(toast(page)).toHaveText("Matsedeln är skapad.");
  await expect(page.getByText("Ingen rätt på matsedeln än.").filter({ visible: true })).toBeVisible();
  const after = await plansOfUser();
  expect(after).toHaveLength(before.length + 1);
  expect(after.filter(({ is_current }) => is_current)).toHaveLength(1);
  expect(after.at(-1)?.is_current).toBe(true);
  expect(errors).toEqual([]);
});

test("Ta bort matsedel asks first; Avbryt keeps the plan, Ta bort deletes it with its dishes", async ({ page }) => {
  const errors = watchErrors(page);
  const id = planIds["Vecka 42"];
  await page.goto(`/matsedel/tidigare/${id}`);
  const question = page.getByRole("dialog", { name: "Ta bort matsedel" });

  await page.getByRole("button", { name: "Ta bort matsedel" }).click();
  await expect(question).toContainText("Ta bort Vecka 42? Det går inte att ångra.");
  await question.getByRole("button", { name: "Avbryt" }).click();
  await expect(question).toHaveCount(0);
  expect((await plansOfUser()).some((plan) => plan.id === id)).toBe(true);

  await page.getByRole("button", { name: "Ta bort matsedel" }).click();
  await question.getByRole("button", { name: "Ta bort", exact: true }).click();
  await expect(page).toHaveURL(/\/matsedel\/tidigare$/);
  await expect(toast(page)).toHaveText("Matsedeln är borttagen.");
  await expect(previousPlans(page).filter({ hasText: "Vecka 42" })).toHaveCount(0);
  expect((await plansOfUser()).some((plan) => plan.id === id)).toBe(false);
  const { count, error } = await adminClient()
    .from("meal_plan_recipe")
    .select("*", { count: "exact", head: true })
    .eq("meal_plan_id", id);
  if (error) throw error;
  expect(count).toBe(0);
  expect(errors).toEqual([]);
});

test("an unknown plan is Sidan finns inte, and the current plan's address leads to Matsedel", async ({ page }) => {
  for (const id of ["00000000-0000-4000-8000-000000000000", "inte-ett-id"]) {
    await page.goto(`/matsedel/tidigare/${id}`);
    await expect(page.getByText("Sidan finns inte.").filter({ visible: true })).toBeVisible();
  }
  const current = (await plansOfUser()).find(({ is_current }) => is_current);
  if (!current) throw new Error("no current plan");
  await page.goto(`/matsedel/tidigare/${current.id}`);
  await expect(page).toHaveURL(/\/matsedel$/);
  await expect(page.getByRole("heading", { name: "Matsedel", level: 1 })).toBeVisible();
});
