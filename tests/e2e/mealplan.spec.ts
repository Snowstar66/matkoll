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

/** The weekday (1 Monday to 7 Sunday) in Stockholm, as the page counts it. */
function todayWeekday(): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Stockholm", weekday: "short" }).format(new Date());
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(name) + 1;
}

/** Opens the ⋯ sheet of a dish row and returns it. */
async function openMore(page: Page, row: Locator, title: string) {
  await row.getByRole("button", { name: `Fler val för ${title}` }).click();
  const sheet = page.getByRole("dialog", { name: title });
  await expect(sheet).toBeVisible();
  return sheet;
}

/** "Ta bort från matsedeln" in the row's ⋯ sheet. */
async function removeVia(page: Page, row: Locator, title: string) {
  const sheet = await openMore(page, row, title);
  await sheet.getByRole("button", { name: "Ta bort från matsedeln" }).click();
}

/** Answers "Ta bort <rätt> från matsedeln?" with "Ta bort". */
async function confirmRemoval(page: Page) {
  await removalQuestion(page).getByRole("button", { name: "Ta bort", exact: true }).click();
}
const removalQuestion = (page: Page) => page.getByRole("dialog", { name: "Ta bort" });

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
  await expect(dish(page, gryta).getByTestId("dish-meta")).toContainText("4 port.");
  await expect(dish(page, gryta).getByTestId("dish-meta")).toContainText("✓ Allt hemma");
  // Everything at home: no meter.
  await expect(dish(page, gryta).getByTestId("meter")).toHaveCount(0);
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
  await expect(dish(page, soppa).getByTestId("meter")).toHaveCount(1);
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
  const sheet = await openMore(page, first, gryta);
  await actionsAnswered(page, 1, () => sheet.getByRole("button", { name: `Fler portioner, ${gryta}` }).click());
  await expect(sheet.getByText("5 portioner")).toBeVisible();
  // 2 dl grädde is enough for 4 portions, not for 5.
  await expect(first.getByTestId("dish-meta")).toContainText("0 av 1 hemma");

  await page.reload();
  await expect(dish(page, gryta).first().getByTestId("dish-meta")).toContainText("5 port.");
  await expect(dish(page, gryta).nth(1).getByTestId("dish-meta")).toContainText("4 port.");
  // Fewer again: never below 1.
  const again = await openMore(page, dish(page, gryta).first(), gryta);
  await actionsAnswered(page, 1, () => again.getByRole("button", { name: `Färre portioner, ${gryta}` }).click());
  await expect(dish(page, gryta).first().getByTestId("dish-meta")).toContainText("✓ Allt hemma");
  expect(errors).toEqual([]);
});

test("Ta bort removes a dish at once, and Ångra puts it back with the same id", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/matsedel");
  const id = await dish(page, soppa).getAttribute("data-dish");

  await removeVia(page, dish(page, soppa), soppa);
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

test("a row opens the recipe and ⋯ opens the sheet with the seldom used buttons (Story 3.11)", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/matsedel");
  const row = dish(page, soppa);
  const more = row.getByRole("button", { name: `Fler val för ${soppa}` });
  const box = (await more.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  // No big buttons under the list; the quiet shopping row is above it.
  await expect(page.getByRole("link", { name: "Visa inköpslistan" })).toHaveCount(0);
  await expect(page.getByTestId("shopping-row").filter({ visible: true })).toHaveText(/^🛒Inköpslista för vecka \d{1,2}›$/);

  const sheet = await openMore(page, row, soppa);
  await expect(sheet.getByRole("link", { name: "Öppna receptet ›" })).toHaveAttribute("href", `/recept/${recipeIds[soppa]}`);
  await expect(sheet.getByText("Portioner", { exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Markera som lagad" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^Flytta till annan dag/ })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Ta bort från matsedeln" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await sheet.getByRole("button", { name: "Klar" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(more).toBeFocused();

  // A tap on the row itself, here on the image, opens the recipe: the title's link covers the row.
  await row.click({ position: { x: 90, y: 20 } });
  await expect(page).toHaveURL(new RegExp(`/recept/${recipeIds[soppa]}$`));
  expect(errors).toEqual([]);
});

// Story 13.3: the trash asks first, then removes within a minute without
// asking, and the shopping list follows. Servings were covered above; moving
// a dish to another day waits, since the plan has no days (see the spec).
test("the trash asks before it removes, the next removals go at once and the list follows", async ({ page }) => {
  const errors = watchErrors(page);
  // Linssoppa has been on the plan since the tests above; leave the two gryta dishes.
  const dropped = await adminClient().from("meal_plan_recipe").delete().eq("user_id", userId).eq("recipe_title", soppa);
  if (dropped.error) throw dropped.error;
  await page.goto("/lista");
  await expect(page.getByTestId("shopping-line").filter({ visible: true }).filter({ hasText: "Grädde" })).toHaveCount(1);

  await page.goto("/matsedel");
  const trash = (index: number) => removeVia(page, dishes(page).nth(index), gryta);
  await trash(0);
  await expect(removalQuestion(page)).toContainText(`Ta bort ${gryta} från matsedeln?`);
  await removalQuestion(page).getByRole("button", { name: "Avbryt" }).click();
  await expect(dishes(page)).toHaveCount(2);
  expect(await dishCount()).toBe(2);

  await trash(0);
  await confirmRemoval(page);
  await expect(dishes(page)).toHaveCount(1);
  // Within a minute the next one goes without a question.
  await trash(0);
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

test("Tidigare veckor says when there are no earlier plans", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/matsedel");
  await page.getByRole("link", { name: "Tidigare veckor" }).filter({ visible: true }).click();
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
  await expect(dishes(page).nth(0).getByTestId("dish-meta")).toContainText("2 port.");
  await expect(dishes(page).nth(1)).toContainText(gryta);
  await expect(dishes(page).nth(1).getByTestId("dish-meta")).toContainText("6 port.");
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

// Story 13.4: "Markera som lagad" deducts from the pantry and marks the dish
// in one go; the list drops the dish; "Ångra" restores both; unmarking leaves
// the pantry alone. Linssoppa for 8 needs 6 dl röda linser with 5 dl at home
// (so the list asks for 1 dl, and the deduction goes to 0 with a note);
// Krämig kycklinggryta needs 2 dl grädde of the 5 dl at home.
test("Markera som lagad deducts from the pantry, drops the dish from the list and Ångra restores both", async ({ page }) => {
  const errors = watchErrors(page);
  const admin = adminClient();
  const ids = await seedIngredients(["Grädde", "Röda linser"]);
  for (const table of ["meal_plan_recipe", "pantry_item"] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  const plan = await admin.from("meal_plan").select("id").eq("user_id", userId).eq("is_current", true).single();
  if (plan.error) throw plan.error;
  const planId = (plan.data as { id: string }).id;
  const seeded = await admin.from("meal_plan_recipe").insert([
    { user_id: userId, meal_plan_id: planId, recipe_id: recipeIds[soppa], recipe_title: soppa, servings: 8, position: 0 },
    { user_id: userId, meal_plan_id: planId, recipe_id: recipeIds[gryta], recipe_title: gryta, servings: 4, position: 1 },
  ]);
  if (seeded.error) throw seeded.error;
  const stocked = await admin.from("pantry_item").insert([
    { user_id: userId, ingredient_id: ids.get("Röda linser"), location: "Skafferi", amount: 5, unit: "dl" },
    { user_id: userId, ingredient_id: ids.get("Grädde"), location: "Kyl", amount: 5, unit: "dl" },
  ]);
  if (stocked.error) throw stocked.error;
  const amountOf = async (name: string) => {
    const { data, error } = await admin.from("pantry_item").select("amount").eq("user_id", userId).eq("ingredient_id", ids.get(name)!);
    if (error) throw error;
    return (data as { amount: number }[]).map((row) => Number(row.amount));
  };
  const listLine = (name: string) => page.getByTestId("shopping-line").filter({ visible: true }).filter({ hasText: name });
  const sheet = page.getByRole("dialog", { name: "Markera som lagad" });

  await page.goto("/lista");
  await expect(listLine("Röda linser")).toHaveCount(1);

  await page.goto("/matsedel");
  const card = dish(page, soppa);
  const open = (await openMore(page, card, soppa)).getByRole("button", { name: "Markera som lagad" });
  expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await open.click();
  await expect(sheet).toBeVisible();
  const line = sheet.getByTestId("cooked-line").filter({ hasText: "Röda linser" });
  await expect(line.getByTestId("cooked-line-text")).toHaveText("5 dl − 5 dl → 0 dl");
  await expect(line).toContainText("så det blir 0");
  await sheet.getByRole("button", { name: "Dra från matvarorna och markera lagad" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(toast(page)).toContainText(`${soppa} är lagad. Matvarorna är uppdaterade.`);
  await expect(card.getByTestId("dish-cooked")).toHaveText("✓ Lagad");
  expect(await amountOf("Röda linser")).toEqual([]);
  await page.goto("/lista");
  await expect(listLine("Röda linser")).toHaveCount(0);

  // "Ångra" restores the pantry and the dish.
  await page.goto("/matsedel");
  await (await openMore(page, dish(page, gryta), gryta)).getByRole("button", { name: "Markera som lagad" }).click();
  const cream = sheet.getByTestId("cooked-line").filter({ hasText: "Grädde" });
  await expect(cream.getByTestId("cooked-line-text")).toHaveText("5 dl − 2 dl → 3 dl");
  await sheet.getByRole("textbox", { name: "Ny mängd Grädde" }).fill("4");
  await expect(cream.getByTestId("cooked-line-text")).toHaveText("5 dl − 1 dl → 4 dl");
  await sheet.getByRole("button", { name: "Dra från matvarorna och markera lagad" }).click();
  await expect(dish(page, gryta).getByTestId("dish-cooked")).toBeVisible();
  expect(await amountOf("Grädde")).toEqual([4]);
  await toast(page).getByRole("button", { name: "Ångra" }).click();
  await expect(dish(page, gryta).getByTestId("dish-cooked")).toHaveCount(0);
  expect(await amountOf("Grädde")).toEqual([5]);

  // Unmarking leaves the pantry alone, and the dish counts in the list again.
  await (await openMore(page, dish(page, soppa), soppa)).getByRole("button", { name: `Ta bort markeringen lagad, ${soppa}` }).click();
  await expect(toast(page)).toContainText("Matvarorna är inte ändrade.");
  await expect(dish(page, soppa).getByTestId("dish-cooked")).toHaveCount(0);
  expect(await amountOf("Röda linser")).toEqual([]);
  await page.goto("/lista");
  await expect(listLine("Röda linser")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("dishes lie on days: Flytta till dag, adding to a free day, and the list does not care", async ({ page }) => {
  const errors = watchErrors(page);
  const admin = adminClient();
  await seedIngredients(["Grädde", "Röda linser"]);
  for (const table of ["meal_plan_recipe", "pantry_item"] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  const plan = await admin.from("meal_plan").select("id").eq("user_id", userId).eq("is_current", true).single();
  if (plan.error) throw plan.error;
  const planId = (plan.data as { id: string }).id;
  const seeded = await admin.from("meal_plan_recipe").insert([
    { user_id: userId, meal_plan_id: planId, recipe_id: recipeIds[soppa], recipe_title: soppa, servings: 4, position: 0 },
    { user_id: userId, meal_plan_id: planId, recipe_id: recipeIds[gryta], recipe_title: gryta, servings: 4, position: 1 },
  ]);
  if (seeded.error) throw seeded.error;
  const day = (n: number | "none") => page.locator(`[data-testid="plan-day"][data-day="${n}"]`).filter({ visible: true });
  const listLines = async () => {
    await page.goto("/lista");
    await expect(page.getByTestId("shopping-line").filter({ visible: true }).first()).toBeVisible();
    return page.getByTestId("shopping-line").filter({ visible: true }).count();
  };
  const before = await listLines();
  // Days that have passed with nothing on them are left out, so the free day to add to is today or later.
  const today = todayWeekday();
  const dayNames = ["måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag", "söndag"];
  const target = today === 5 ? 4 : 5;

  // Existing dishes have no day: today and the days after show, the dishes under "Ingen dag än".
  await page.goto("/matsedel");
  await expect(page.getByTestId("plan-day").filter({ visible: true })).toHaveCount(7 - today + 1 + 1);
  await expect(day("none")).toContainText(soppa);
  await expect(day("none")).toContainText(gryta);
  await expect(day(today).getByTestId("day-free")).toContainText("+ Lägg till");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Move Linssoppa to another day from the ⋯ sheet.
  const more = await openMore(page, dish(page, soppa), soppa);
  await expect(more.getByRole("button", { name: /^Flytta till annan dag/ })).toContainText("Ingen dag");
  const move = more.getByRole("button", { name: /^Flytta till annan dag/ });
  expect((await move.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await move.click();
  const sheet = page.getByRole("dialog", { name: "Flytta till dag" });
  await expect(sheet.getByTestId("day-choice")).toHaveCount(8);
  expect((await sheet.getByTestId("day-choice").first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await sheet.getByRole("button", { name: dayNames[target - 1]!.replace(/^./, (c) => c.toUpperCase()) }).click();
  await expect(toast(page)).toContainText(`${soppa} ligger på ${dayNames[target - 1]}.`);
  await expect(day(target)).toContainText(soppa);
  await expect(day("none")).not.toContainText(soppa);
  await expect
    .poll(async () => {
      const { data } = await admin.from("meal_plan_recipe").select("weekday").eq("user_id", userId).eq("recipe_title", soppa).single();
      return (data as { weekday: number | null }).weekday;
    })
    .toBe(target);

  // A tap on a free day opens Lägg till rätt on that day.
  await day(today).getByTestId("day-free").click();
  await expect(addSheet(page).getByRole("combobox", { name: "Dag" })).toHaveValue(String(today));
  await addSheet(page).getByRole("region", { name: "Favoriter" }).getByRole("button", { name: new RegExp(gryta) }).click();
  await expect(toast(page)).toContainText(`Lagt på matsedeln, ${dayNames[today - 1]}.`);
  await expect(day(today)).toContainText(gryta);
  await expect(day(today).getByTestId("day-free")).toHaveCount(0);
  expect(await dishCount()).toBe(3);

  // The list ignores days: the same lines as before the moves and the new dish (same recipes).
  expect(await listLines()).toBe(before);
  expect(errors).toEqual([]);
});

test("days show their date and today is marked (Story 13.6)", async ({ page }) => {
  const admin = adminClient();
  const update = await admin.from("meal_plan_recipe").update({ weekday: 1 }).eq("user_id", userId).eq("recipe_title", soppa);
  if (update.error) throw update.error;
  await page.goto("/matsedel");
  const monday = page.locator('[data-testid="plan-day"][data-day="1"]').filter({ visible: true });
  await expect(monday).toContainText(/Måndag \d{1,2} \S+/);
  await expect(monday.getByText("Mån", { exact: true })).toBeVisible();
  const today = page.locator('[data-testid="plan-day"][aria-current="date"]').filter({ visible: true });
  await expect(today).toHaveCount(1);
  await expect(today).toContainText("Idag");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("plans next week: a dish added there shows only there, and its list is a week picker away (Story 13.7)", async ({ page }) => {
  const errors = watchErrors(page);
  const ids = await seedIngredients(["Mjölk"]);
  await seedRecipe("Våffelsmet", false, { text: "5 dl mjölk", ingredientId: ids.get("Mjölk")!, amount: 5 });
  await page.goto("/matsedel");
  const thisWeekDishes = await dishCount();
  const nav = page.getByTestId("week-nav").filter({ visible: true });
  await expect(nav.locator(`[aria-current="page"]`)).toContainText("Denna vecka");
  await expect(nav.getByRole("link", { name: "Föregående vecka" })).toHaveCount(0);

  // Next week: an empty week with a free row for every day, and its dates from that week's Monday.
  await nav.getByRole("link", { name: "Nästa vecka" }).click();
  await expect(page).toHaveURL(/\/matsedel\?vecka=\d{4}-W\d{2}$/);
  await expect(nav.locator(`[aria-current="page"]`)).toContainText("Nästa");
  await expect(page.getByTestId("day-free").filter({ visible: true })).toHaveCount(7);
  await expect(dishes(page)).toHaveCount(0);
  await expect(page.locator('[data-testid="plan-day"][aria-current="date"]').filter({ visible: true })).toHaveCount(0);
  await expect(page.locator('[data-testid="plan-day"][data-day="1"]').filter({ visible: true })).toContainText(/Måndag \d{1,2} \S+/);

  await page.getByTestId("day-free").filter({ visible: true }).nth(2).click();
  await addSheet(page).getByRole("searchbox", { name: "Sök recept" }).fill("mjölk");
  await addSheet(page).getByRole("region", { name: "Sökresultat" }).getByRole("button", { name: /Våffelsmet/ }).click();
  await expect(addSheet(page)).toHaveCount(0);
  await expect(dish(page, "Våffelsmet")).toHaveCount(1);
  await expect(page.locator('[data-testid="plan-day"][data-day="3"]').filter({ visible: true })).toContainText("Våffelsmet");

  // A reload keeps the week; the "Denna vecka" tile goes back to this week, which did not get the dish.
  await page.reload();
  await expect(nav.locator(`[aria-current="page"]`)).toContainText("Nästa");
  await expect(dish(page, "Våffelsmet")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await nav.getByRole("link", { name: /denna vecka/i }).click();
  await expect(page).toHaveURL(/\/matsedel$/);
  await expect(dishes(page)).toHaveCount(thisWeekDishes);
  await expect(dish(page, "Våffelsmet")).toHaveCount(0);

  // Inköpslista counts this week by default; its week tiles (Story 3.10) move it to next week.
  await page.goto("/lista");
  const listTiles = page.getByTestId("week-nav").filter({ visible: true });
  await expect(listTiles.locator(`[aria-current="page"]`)).toContainText("Denna vecka");
  await expect(listTiles.getByRole("link", { name: "Tidigare veckor" })).toHaveCount(0);
  await expect(page.getByText("Mjölk", { exact: true })).toHaveCount(0);
  await listTiles.getByRole("link", { name: /nästa vecka/i }).click();
  await expect(page).toHaveURL(/\/lista\?vecka=\d{4}-W\d{2}$/);
  await expect(page.getByText("Mjölk", { exact: true }).filter({ visible: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("an empty week in Inköpslista offers the week that has dishes (Story 3.10)", async ({ page }) => {
  const errors = watchErrors(page);
  // A dish on next week, so a week with dishes is among the tiles; a week five ahead, reached by its address, has none.
  const ids = await seedIngredients(["Mjölk"]);
  await seedRecipe("Pannkaksmet", false, { text: "5 dl mjölk", ingredientId: ids.get("Mjölk")!, amount: 5 });
  await page.goto("/matsedel");
  await page.getByTestId("week-nav").filter({ visible: true }).getByRole("link", { name: "Nästa vecka" }).click();
  await page.getByTestId("day-free").filter({ visible: true }).nth(2).click();
  await addSheet(page).getByRole("searchbox", { name: "Sök recept" }).fill("pannkaks");
  await addSheet(page).getByRole("region", { name: "Sökresultat" }).getByRole("button", { name: /Pannkaksmet/ }).click();
  await expect(dish(page, "Pannkaksmet")).toHaveCount(1);
  // The ISO week of today plus 35 days: the Thursday of that week decides its year and number.
  const ahead = new Date(Date.now() + 35 * 86_400_000);
  const thursday = new Date(Date.UTC(ahead.getFullYear(), ahead.getMonth(), ahead.getDate() + 3 - ((ahead.getDay() + 6) % 7)));
  const week = Math.floor((thursday.getTime() - Date.UTC(thursday.getUTCFullYear(), 0, 1)) / 604_800_000) + 1;
  await page.goto(`/lista?vecka=${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`);
  await expect(page.getByText(/^Vecka \d{1,2} har inga rätter än\.$/).filter({ visible: true })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(`^Visa vecka \\d{1,2} \\(\\d+ rätt(er)?\\)$`) }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/lista(\?vecka=\d{4}-W\d{2})?$/);
  await expect(page.getByText(/har inga rätter än/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("picks a day, then a recipe: Välj recept opens Recept for that day and adds the dish there (Story 13.8)", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/matsedel");
  const nav = page.getByTestId("week-nav").filter({ visible: true });
  await nav.getByRole("link", { name: "Nästa vecka" }).click();
  await expect(nav.locator(`[aria-current="page"]`)).toContainText("Nästa");
  const wednesday = page.locator('[data-testid="plan-day"][data-day="3"]').filter({ visible: true });
  await expect(wednesday).not.toContainText("Linssoppa");

  // A free day: its sheet offers Välj recept; Avbryt leaves the mode and stays in Recept.
  await page.getByTestId("day-free").filter({ visible: true }).nth(1).click();
  await addSheet(page).getByRole("link", { name: "Välj recept" }).click();
  await expect(page).toHaveURL(/\/recept\?planera=\d{4}-\d{2}-\d{2}$/);
  const bar = page.getByTestId("planning-bar");
  await expect(bar).toContainText(/^Lägger på \S+ \d{1,2} \S+/);
  await expect(page.getByRole("button", { name: /^Lägg på \S+: / }).first()).toBeVisible();
  await bar.getByRole("link", { name: "Avbryt" }).click();
  await expect(page).toHaveURL(/\/recept$/);
  await expect(page.getByTestId("planning-bar")).toHaveCount(0);

  // A day with a dish has no Välj recept of its own any more: "+" in the header opens the sheet, whose Dag is set to onsdag.
  // The mode follows into the recipe, whose button names the day.
  await page.goto("/matsedel");
  await nav.getByRole("link", { name: "Nästa vecka" }).click();
  await expect(nav.locator(`[aria-current="page"]`)).toContainText("Nästa");
  await expect(wednesday).toBeVisible();
  await expect(wednesday.getByRole("link", { name: /Välj recept/ })).toHaveCount(0);
  await openAddSheet(page);
  await addSheet(page).getByRole("combobox", { name: "Dag" }).selectOption("3");
  await addSheet(page).getByRole("link", { name: "Välj recept" }).click();
  await expect(page.getByTestId("planning-bar")).toContainText(/^Lägger på onsdag \d{1,2} \S+$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("link", { name: soppa }).first().click();
  await expect(page).toHaveURL(/\/recept\/[0-9a-f-]+\?planera=\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByRole("button", { name: "Lägg på matsedeln" })).toHaveCount(0);
  await page.getByRole("button", { name: "Lägg på onsdag" }).click();

  // The mode ends: Matsedel opens on next week with Wednesday lit and the dish on it.
  await expect(page).toHaveURL(/\/matsedel\?vecka=\d{4}-W\d{2}&dag=3$/);
  await expect(wednesday).toHaveAttribute("data-highlight", "true");
  await expect(page.getByTestId("toast")).toContainText("Lagt på matsedeln, onsdag.");
  await expect(nav.locator(`[aria-current="page"]`)).toContainText("Nästa");
  await expect(wednesday).toContainText(soppa);
  await expect(wednesday).not.toHaveAttribute("data-highlight", "true", { timeout: 8000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

// Story 13.9: the week overview and "Kopiera till …".
test("the week tiles show counts and switch week, and an earlier week is copied to next week", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/matsedel");
  const nav = page.getByTestId("week-nav").filter({ visible: true });
  const tiles = nav.getByTestId("week-tile");
  await expect(tiles).toHaveCount(3);
  await expect(tiles.nth(0)).toHaveAttribute("aria-current", "page");
  const countOf = async (index: number) => {
    const text = (await tiles.nth(index).getByTestId("week-count").textContent()) ?? "";
    const digits = /\d+/.exec(text);
    return digits ? Number(digits[0]) : 0;
  };
  const thisWeekCount = await countOf(0);
  expect(thisWeekCount).toBeGreaterThan(0);
  await expect(tiles.nth(0)).toHaveAttribute("aria-label", new RegExp(`^Vecka \\d+, denna vecka, ${thisWeekCount} rätt`));
  const nextBefore = await countOf(1);
  for (let index = 0; index < 3; index += 1) {
    const box = await tiles.nth(index).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Tapping a tile shows that week and keeps it in the address.
  await tiles.nth(1).click();
  await expect(page).toHaveURL(/\/matsedel\?vecka=\d{4}-W\d{2}$/);
  await expect(nav.locator(`[aria-current="page"]`)).toContainText("Nästa");
  await expect(dishes(page)).toHaveCount(nextBefore);

  // An earlier week is copied to next week, with its weekdays.
  await seedEarlierPlan("Vecka 38", "2026-09-14T08:00:00Z", [
    { recipeId: recipeIds[soppa], title: soppa, servings: 2 },
    { recipeId: recipeIds[gryta], title: gryta, servings: 6 },
  ]);
  const rows = await adminClient()
    .from("meal_plan_recipe")
    .select("id, position")
    .eq("meal_plan_id", planIds["Vecka 38"])
    .order("position");
  if (rows.error) throw rows.error;
  for (const [index, row] of (rows.data as { id: string }[]).entries()) {
    const updated = await adminClient()
      .from("meal_plan_recipe")
      .update({ weekday: index === 0 ? 2 : 4 })
      .eq("id", row.id);
    if (updated.error) throw updated.error;
  }
  await page.goto(`/matsedel/tidigare/${planIds["Vecka 38"]}`);
  await page
    .getByRole("button", { name: /Kopiera till/ })
    .filter({ visible: true })
    .click();
  const targets = page.getByTestId("copy-target").filter({ visible: true });
  await expect(targets).toHaveCount(3);
  // Each week says what it already has, like the week tiles.
  await expect(targets.nth(1)).toContainText(nextBefore === 0 ? "· Tom" : nextBefore === 1 ? "· 1 rätt" : `· ${nextBefore} rätter`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await targets.nth(1).click();

  await expect(page).toHaveURL(/\/matsedel\?vecka=\d{4}-W\d{2}$/);
  await expect(toast(page)).toHaveText(/^Kopierade 2 rätter till vecka \d+$/);
  await expect(dishes(page)).toHaveCount(nextBefore + 2);
  await expect(page.locator('[data-testid="plan-day"][data-day="2"]').filter({ visible: true })).toContainText(soppa);
  await expect(page.locator('[data-testid="plan-day"][data-day="4"]').filter({ visible: true })).toContainText(gryta);
  await expect(tiles.nth(1).getByTestId("week-count")).toContainText(String(nextBefore + 2));

  await tiles.nth(0).click();
  await expect(page).toHaveURL(/\/matsedel$/);
  await expect(dishes(page)).toHaveCount(thisWeekCount);
  expect(errors).toEqual([]);
});
