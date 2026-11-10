import { expect, type Locator, type Page, type Response, test } from "@playwright/test";
import { adminClient, clearFoodProfiles, seedFoodProfile, dayWords, e2eUserId, firstFree, mealplanEmail, mealplanStorageState, openLibrary, todayDay } from "./support";

// Story 3.1 and 25.3: Matsedel as the place to plan the week: "Veckans rätter"
// with their day chip and ✕ (with "Ångra"), and "Lägg till rätter" with
// Favoriter, På erbjudande and Alla recept, where "+" puts a dish on the week
// with no day. "Lägg på matsedeln" in the recipe view adds the same recipe
// once more. The spec has an E2E user of its own (mealplanEmail):
// two recipes are made with the service role before the tests, Krämig
// kycklinggryta (a favourite, 4 portions, 2 dl grädde) and Linssoppa (3 dl
// röda linser), with 2 dl grädde in the pantry, and the meal plan starts
// empty. The tests build on each other and run in order.
//
// Story 3.2: Tidigare matsedlar. Earlier plans are made with the service role
// (Vecka 42 with a dish whose recipe is deleted, and an empty Vecka 41 from
// last year, without a week: pushed aside); "Kopiera till …" and "Ta bort
// matsedel" with its question follow. Story 16.16: no "Ny matsedel" or
// "Använd igen"; a plan without a week says "undanlagd".

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
      { onConflict: "household_id,normalized_name" },
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
const toast = (page: Page) => page.getByTestId("toast");
const tab = (page: Page, name: "Recept" | "Matsedel" | "Inköpslista") =>
  page.getByRole("navigation", { name: "Huvudmeny" }).getByRole("link", { name });
const bar = (page: Page) => page.getByTestId("week-bar-count").filter({ visible: true });
const chip = (row: Locator) => row.getByTestId("dish-day");
const addTab = async (page: Page, name: "Favoriter" | "På erbjudande" | "Alla recept") => {
  await openLibrary(page);
  await page.getByRole("radio", { name }).filter({ visible: true }).click();
};
const plus = (page: Page, title: string) =>
  page.getByRole("button", { name: `Lägg ${title} på veckan` }).filter({ visible: true });

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

/** ✕ on a dish row: no question, the dish goes at once. */
async function removeVia(_page: Page, row: Locator, title: string) {
  await row.getByRole("button", { name: `Ta bort ${title}` }).click();
}

async function dishCount(): Promise<number> {
  const { count, error } = await adminClient()
    .from("meal_plan_recipe")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

test("an empty week says so, with the library to choose from under it", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/matsedel");
  await expect(page.getByTestId("week-empty")).toHaveText("Inga rätter än. Välj bland dina recept här under.");
  // The library is folded until opened.
  const toggle = page.getByRole("button", { name: "Lägg till nya rätter" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("radio", { name: "Favoriter" })).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("radio", { name: "Favoriter" })).toBeVisible();
  // The choice is kept for the next visit.
  await page.reload();
  await expect(page.getByRole("button", { name: "Lägg till nya rätter" })).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Lägg till nya rätter" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Lägg till nya rätter" })).toHaveAttribute("aria-expanded", "false");
  // An empty week says "Inga rätter än" instead of a count.
  await expect(bar(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the + in the header opens Lägg till nya rätter for the week shown (UX-07)", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/matsedel");
  const toggle = page.getByTestId("add-dishes-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  const header = page.locator("header").filter({ visible: true });
  await header.getByRole("button", { name: "Lägg till rätt" }).click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(plus(page, gryta)).toBeVisible();
  expect(errors).toEqual([]);
});

test("a free day tapped in the week gets the next dish added with +", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/matsedel");
  // Sunday is free from any day of the week on.
  await page.getByRole("button", { name: "Lägg till en rätt på söndag" }).click();
  // A free day opens the folded library.
  await expect(page.getByTestId("add-dishes-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("target-day")).toHaveText(/Läggs på söndag/);
  await plus(page, gryta).click();
  await expect(dishes(page)).toHaveCount(1);
  await expect(chip(dish(page, gryta))).toHaveText(/^Sön\d/);
  await expect(toast(page)).toContainText(`${gryta} på söndag.`);
  await expect(page.getByTestId("target-day")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Lägg till en rätt på söndag" })).toHaveCount(0);
  const saved = await adminClient().from("meal_plan_recipe").select("weekday").eq("user_id", userId);
  expect(saved.data).toEqual([{ weekday: 7 }]);
  // The tests after this one start from an empty week.
  const cleared = await adminClient().from("meal_plan").delete().eq("user_id", userId);
  if (cleared.error) throw cleared.error;
  expect(errors).toEqual([]);
});

test("a favourite is on the first free day after one tap on +, with its own servings", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/matsedel");
  await openLibrary(page);
  await expect(page.getByRole("radio", { name: "Favoriter" })).toBeChecked();
  await expect(page.getByTestId("plan-option")).toHaveCount(1);
  await plus(page, gryta).click();
  await expect(dishes(page)).toHaveCount(1);
  const day = firstFree([]);
  expect(day).toBe(todayDay());
  await expect(chip(dish(page, gryta))).toHaveText(new RegExp(`^${dayWords[day! - 1]!.slice(0, 3).replace(/^./, (c) => c.toUpperCase())}\\d`));
  await expect(toast(page)).toContainText(`${gryta} på ${dayWords[day! - 1]}. Inget att köpa.`);
  await expect(toast(page).getByRole("button", { name: "Byt dag" })).toBeVisible();
  // A dish on the week leaves the library list.
  await expect(page.getByTestId("plan-option").filter({ hasText: gryta })).toHaveCount(0);
  await expect(page.getByTestId("options-empty")).toHaveText("Alla dina favoriter ligger redan på veckan.");
  await expect(bar(page)).toHaveText("1 rätt · 0 varor att köpa");
  const saved = await adminClient().from("meal_plan_recipe").select("servings, weekday").eq("user_id", userId);
  expect(saved.data).toEqual([{ servings: 4, weekday: day }]);
  await page.reload();
  await expect(dish(page, gryta).getByTestId("dish-note")).toHaveText("Allt finns hemma");
  expect(errors).toEqual([]);
});

test("hushållets preferenser: a planned dish with grädde is flagged for a laktos allergy, never hidden; no profile, no notes", async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => localStorage.setItem("livskoll-option-showFit", "text"));
  await clearFoodProfiles(userId);
  await page.goto("/matsedel");
  await expect(dish(page, gryta)).toBeVisible();
  await expect(page.getByTestId("preference-notes")).toHaveCount(0);
  await expect(page.getByTestId("week-allergy-line")).toHaveCount(0);

  await seedFoodProfile(userId, { allergies: ["laktos"] });
  await page.reload();
  const note = dish(page, gryta).getByTestId("preference-notes").locator('[data-kind="allergy"]');
  await expect(note).toHaveText(/^Kan innehålla laktos \(/);
  await expect(note).toHaveCSS("font-weight", "600");
  await expect(page.getByTestId("week-allergy-line").filter({ visible: true })).toContainText("1 rätt på veckan kan innehålla en allergen");
  await expect(dishes(page)).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/preferenser-matsedel.png` });

  await clearFoodProfiles(userId);
  expect(errors).toEqual([]);
});

test("Visa vem rätten passar: a planned dish gets a red ring and the word for an allergy, and the notes return when it is off", async ({ page }) => {
  const errors = watchErrors(page);
  await seedFoodProfile(userId, { allergies: ["laktos"] });
  await page.goto("/matsedel");
  const fit = dish(page, gryta).getByTestId("fit-row");
  await expect(fit.getByTestId("fit-dot")).toHaveAttribute("data-kind", "allergy");
  await expect(fit.getByTestId("fit-allergy-word")).toHaveText("Laktos");
  await expect(dish(page, gryta).getByTestId("preference-notes")).toHaveCount(0);
  await expect(page.getByTestId("week-allergy-line").filter({ visible: true })).toContainText("kan innehålla en allergen");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/passar-matsedel.png` });

  await page.evaluate(() => localStorage.setItem("livskoll-option-showFit", "text"));
  await page.reload();
  await expect(dish(page, gryta).getByTestId("fit-dot")).toHaveCount(0);
  await expect(dish(page, gryta).getByTestId("preference-notes")).toContainText("Kan innehålla laktos");

  await page.evaluate(() => localStorage.removeItem("livskoll-option-showFit"));
  await clearFoodProfiles(userId);
  expect(errors).toEqual([]);
});

test("Alla recept lists every recipe not yet on the week, and what is not at home counts in the bar", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/matsedel");
  await addTab(page, "Alla recept");
  // Gryta is on the week from the test before, so only soppa is left to add.
  await expect(page.getByTestId("plan-option")).toHaveCount(1);
  await plus(page, soppa).click();
  await expect(dishes(page)).toHaveCount(2);
  await expect(page.getByTestId("plan-option")).toHaveCount(0);
  await expect(page.getByTestId("options-empty")).toHaveText("Alla dina recept ligger redan på veckan.");
  // The first day from today that gryta did not take, or none on a Sunday.
  const soppaDay = firstFree([todayDay()]);
  // The toast names what went on the list.
  await expect(toast(page)).toContainText(
    soppaDay ? `${soppa} på ${dayWords[soppaDay - 1]}. Röda linser står på inköpslistan.` : `${soppa} på veckan. Alla dagar har en rätt. Röda linser står på inköpslistan.`,
    { ignoreCase: true },
  );
  // Veckans rätter are in day order: gryta (first free day) before soppa (the next, or none).
  await expect(dishes(page).first()).toContainText(gryta);
  await expect(dish(page, soppa).getByTestId("dish-note")).toHaveText("1 vara att köpa");
  // The pantry never ranks: the rows are by title. The bar counts the list's lines for the week.
  await expect(bar(page)).toHaveText("2 rätter · 1 vara att köpa");
  // The list is a tab away; Matsedel has no button of its own for it.
  await expect(page.getByRole("link", { name: "Inköpslistan" })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Huvudmeny" }).getByRole("link", { name: /^Inköpslista/ }).click();
  await expect(page).toHaveURL(/\/lista$/);
  await expect(page.getByTestId("shopping-line").filter({ visible: true })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("Lägg på matsedeln in the recipe view is one tap without a day, and Ångra takes it back (UX-05)", async ({ page }) => {
  const errors = watchErrors(page);
  const admin = adminClient();
  // Start with the recipe off the plan; the duplicate is put back at the end, as the next tests expect it.
  const before = await admin.from("meal_plan_recipe").select("id").eq("user_id", userId).eq("recipe_title", gryta);
  if (before.error) throw before.error;
  for (const row of before.data) {
    const removed = await admin.from("meal_plan_recipe").delete().eq("id", row.id);
    if (removed.error) throw removed.error;
  }
  const rowsOf = async () => {
    const rows = await admin.from("meal_plan_recipe").select("id, weekday, servings, position, meal_plan_id").eq("user_id", userId).eq("recipe_title", gryta);
    if (rows.error) throw rows.error;
    return rows.data;
  };
  await page.goto(`/recept/${recipeIds[gryta]}`);
  // No week buttons and no "Matsedel för vecka N": the dish goes on the week last viewed, this week when none was.
  await expect(page.getByTestId("recipe-week-option")).toHaveCount(0);
  await expect(page.getByText(/Matsedel för vecka/)).toHaveCount(0);
  await page.getByRole("button", { name: "Lägg på matsedeln" }).click();
  await expect(toast(page)).toContainText(/^Lagd på matsedeln v\. \d+\./);
  await expect(toast(page).getByRole("button", { name: "Byt vecka" })).toBeVisible();
  await expect(toast(page).getByRole("button", { name: "Ångra" })).toBeVisible();
  const planned = page.getByTestId("recipe-planned");
  await expect(planned).toHaveText(/^På matsedeln v\. \d+$/);
  // No "Byt dag" anywhere, and nothing pinned at the bottom.
  await expect(page.getByRole("button", { name: /^(Byt|Välj) dag$/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Lägg på matsedeln" })).toHaveCount(0);
  const added = await rowsOf();
  expect(added).toHaveLength(1);
  expect(added[0]!.weekday).toBeNull();
  expect(await dishCount()).toBe(2);

  // Ångra takes it off again and brings the button back.
  await toast(page).getByRole("button", { name: "Ångra" }).click();
  await expect(page.getByRole("button", { name: "Lägg på matsedeln" })).toBeVisible();
  await expect(planned).toHaveCount(0);
  await expect.poll(async () => (await rowsOf()).length).toBe(0);

  // Add it again; the pill opens Matsedel on that week.
  await page.getByRole("button", { name: "Lägg på matsedeln" }).click();
  await expect(planned).toBeVisible();
  const again = await rowsOf();
  expect(again).toHaveLength(1);
  await planned.click();
  await expect(page).toHaveURL(/\/matsedel\?vecka=\d{4}-W\d{2}$/);

  // Put the second dish of the same recipe back for the tests that follow.
  const copy = await admin.from("meal_plan_recipe").insert({
    user_id: userId,
    meal_plan_id: again[0]!.meal_plan_id,
    recipe_id: recipeIds[gryta],
    recipe_title: gryta,
    servings: again[0]!.servings,
    position: again[0]!.position + 1,
  });
  if (copy.error) throw copy.error;

  await tab(page, "Matsedel").click();
  await expect(dishes(page)).toHaveCount(3);
  await expect(dish(page, gryta)).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("Lägg på matsedeln in the recipe view uses the week last viewed, and Byt vecka moves the dish (UX-04, UX-05)", async ({ page }) => {
  const errors = watchErrors(page);
  const admin = adminClient();
  // The dishes and the plans of the coming weeks go: a coming week's plan is current too, and the later tests expect one.
  const clearNextWeek = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const plans = await admin.from("meal_plan").select("id").eq("user_id", userId).gt("week_start", today);
    if (plans.error) throw plans.error;
    for (const plan of plans.data) {
      const dishes = await admin.from("meal_plan_recipe").delete().eq("meal_plan_id", plan.id);
      if (dishes.error) throw dishes.error;
      const removed = await admin.from("meal_plan").delete().eq("id", plan.id);
      if (removed.error) throw removed.error;
    }
  };
  const comingRows = async () => {
    const rows = await admin
      .from("meal_plan_recipe")
      .select("id, weekday, meal_plan_id, meal_plan!inner(week_start)")
      .eq("user_id", userId)
      .eq("recipe_title", gryta)
      .gt("meal_plan.week_start", new Date().toISOString().slice(0, 10));
    if (rows.error) throw rows.error;
    return rows.data;
  };
  await clearNextWeek();
  const dishesBefore = await dishCount();

  // View next week on Matsedel; the week is remembered on this device.
  await page.goto("/matsedel");
  const nav = page.getByTestId("week-nav").filter({ visible: true });
  await nav.getByRole("link", { name: "Nästa vecka" }).click();
  await expect(page).toHaveURL(/\/matsedel\?vecka=\d{4}-W\d{2}$/);
  await expect(nav.locator(`[aria-current="page"]`)).toContainText("Nästa");
  const nextParam = new URL(page.url()).searchParams.get("vecka")!;
  const nextNumber = Number(nextParam.slice(-2));

  // Inköpslista opens on the same week, with Matsedel's segment (UX-04).
  await tab(page, "Inköpslista").click();
  const listNav = page.getByTestId("week-nav").filter({ visible: true });
  await expect(listNav.locator(`[aria-current="page"]`)).toContainText("Nästa");
  await expect(listNav.getByTestId("week-range")).toContainText(`v. ${nextNumber} · `);

  await page.goto(`/recept/${recipeIds[gryta]}`);
  await page.getByRole("button", { name: "Lägg på matsedeln" }).click();
  await expect(toast(page)).toContainText(`Lagd på matsedeln v. ${nextNumber}.`);
  await expect(page.getByTestId("recipe-planned")).toHaveText(`På matsedeln v. ${nextNumber}`);
  await expect.poll(async () => (await comingRows()).map((row) => row.weekday)).toEqual([null]);
  // dishCount counts every plan: only this one dish was added.
  expect(await dishCount()).toBe(dishesBefore + 1);

  // Byt vecka: the sheet names the weeks, and a tap moves the dish.
  await toast(page).getByRole("button", { name: "Byt vecka" }).click();
  const sheet = page.getByRole("dialog", { name: "Vilken vecka?" });
  await expect(sheet).toContainText(gryta);
  await expect(sheet.getByTestId("week-choice")).toHaveCount(3);
  await expect(sheet.getByTestId("week-choice").nth(1)).toContainText(`v. ${nextNumber} · 1 rätt`);
  await expect(sheet).toContainText("Dag väljer du på Matsedel, om du vill.");
  await sheet.getByTestId("week-choice").nth(2).click();
  await expect(page.getByTestId("recipe-planned")).toHaveText(`På matsedeln v. ${nextNumber + 1}`);
  await expect.poll(async () => (await comingRows()).map((row) => row.weekday)).toEqual([null]);
  await expect
    .poll(async () => (await comingRows()).map((row) => (row.meal_plan as unknown as { week_start: string }).week_start))
    .toEqual([expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)]);
  const moved = (await comingRows())[0]!.meal_plan as unknown as { week_start: string };
  const nextMonday = new Date(`${moved.week_start}T12:00:00Z`);
  nextMonday.setUTCDate(nextMonday.getUTCDate() - 7);
  // It is on the week after next now, not on next week.
  expect(nextMonday.getTime()).toBeGreaterThan(Date.now());

  await clearNextWeek();
  expect(errors).toEqual([]);
});

test("✕ removes a dish at once, and Ångra puts it back with the same id", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/matsedel");
  // The header's Erbjudanden streams in last; the page is interactive once it is there.
  await expect(page.getByRole("button", { name: "Erbjudanden", exact: true })).toBeVisible();
  const id = await dish(page, soppa).getAttribute("data-dish");

  await removeVia(page, dish(page, soppa), soppa);
  await expect(dish(page, soppa)).toHaveCount(0);
  await expect(toast(page)).toContainText(`Tog bort ${soppa}.`);
  await expect.poll(dishCount).toBe(2);

  await actionsAnswered(page, 1, () => toast(page).getByRole("button", { name: "Ångra" }).click());
  await expect(dish(page, soppa)).toHaveCount(1);
  await page.reload();
  await expect(dishes(page)).toHaveCount(3);
  expect(await dish(page, soppa).getAttribute("data-dish")).toBe(id);
  expect(errors).toEqual([]);
});

test("Ta bort never asks, every removal goes at once and the list follows", async ({ page }) => {
  const errors = watchErrors(page);
  // Linssoppa has been on the plan since the tests above; leave the two gryta dishes.
  const dropped = await adminClient().from("meal_plan_recipe").delete().eq("user_id", userId).eq("recipe_title", soppa);
  if (dropped.error) throw dropped.error;
  await page.goto("/lista");
  await expect(page.getByTestId("shopping-line").filter({ visible: true }).filter({ hasText: "Grädde" })).toHaveCount(1);

  await page.goto("/matsedel");
  const trash = (index: number) => removeVia(page, dishes(page).nth(index), gryta);
  await trash(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(dishes(page)).toHaveCount(1);
  // A second press on a bin within 400 ms is ignored (trashPressGuardMs).
  await page.waitForTimeout(500);
  await trash(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(dishes(page)).toHaveCount(0);
  await expect.poll(dishCount).toBe(0);

  await page.goto("/lista");
  await expect(page.getByText("Inga rätter på matsedeln den här veckan.").filter({ visible: true })).toBeVisible();

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

async function seedEarlierPlan(
  name: string,
  createdAt: string,
  dishes: { recipeId: string | null; title: string; servings: number }[],
  weekStart: string | null = null,
) {
  const admin = adminClient();
  const plan = await admin
    .from("meal_plan")
    .insert({ user_id: userId, name, is_current: false, created_at: createdAt, week_start: weekStart })
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
  ], "2026-10-12");
  await page.goto("/matsedel/tidigare");
  await expect(previousPlans(page)).toHaveCount(2);
  await expect(previousPlans(page).nth(0)).toContainText("Vecka 42");
  await expect(previousPlans(page).nth(0)).toContainText("3 rätter · skapad 12 okt 2026");
  await expect(previousPlans(page).nth(1)).toContainText("Vecka 41");
  await expect(previousPlans(page).nth(1)).toContainText("0 rätter · undanlagd · skapad 6 okt 2025");

  await previousPlans(page).nth(0).getByRole("link", { name: "Vecka 42" }).click();
  await expect(page).toHaveURL(new RegExp(`/matsedel/tidigare/${planIds["Vecka 42"]}$`));
  await expect(previousDishes(page)).toHaveCount(3);
  await expect(previousDishes(page).nth(0)).toContainText(`${soppa}2 portioner`);
  await expect(previousDishes(page).nth(1)).toContainText("Borttaget recept: Gammal paj");
  await expect(previousDishes(page).nth(2)).toContainText(`${gryta}6 portioner`);
  await expect(page.getByTestId("copy-note").filter({ visible: true })).toHaveText(
    "1 rätt med borttaget recept följer inte med.",
  );
  expect(errors).toEqual([]);
});

test("Tidigare and an earlier plan have no Ny matsedel or Använd igen", async ({ page }) => {
  const errors = watchErrors(page);
  const before = await plansOfUser();
  await page.goto("/matsedel/tidigare");
  await expect(previousPlans(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Ny matsedel" })).toHaveCount(0);
  await page.goto(`/matsedel/tidigare/${planIds["Vecka 42"]}`);
  await expect(page.getByRole("button", { name: "Använd igen" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Kopiera till/ }).filter({ visible: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Ta bort matsedel" }).filter({ visible: true })).toBeVisible();
  // A past week says "skapad"; the plan without a week says "undanlagd" on its own page too.
  await expect(page.getByText("3 rätter · skapad 12 okt 2026").filter({ visible: true })).toBeVisible();
  await page.goto(`/matsedel/tidigare/${planIds["Vecka 41"]}`);
  await expect(page.getByText("0 rätter · undanlagd · skapad 6 okt 2025").filter({ visible: true })).toBeVisible();
  expect(await plansOfUser()).toHaveLength(before.length);
  expect(errors).toEqual([]);
});

test("Ta bort matsedel asks first; Avbryt keeps the plan, Ta bort deletes it with its dishes", async ({ page }) => {
  const errors = watchErrors(page);
  const id = planIds["Vecka 42"];
  await page.goto(`/matsedel/tidigare/${id}`);
  const question = page.getByRole("dialog", { name: "Ta bort Vecka 42?" });

  await page.getByRole("button", { name: "Ta bort matsedel" }).click();
  await expect(question).toContainText("Det går inte att ångra.");
  await question.getByRole("button", { name: "Avbryt" }).click();
  await expect(question).toHaveCount(0);
  expect((await plansOfUser()).some((plan) => plan.id === id)).toBe(true);

  await page.getByRole("button", { name: "Ta bort matsedel" }).click();
  await question.getByRole("button", { name: "Ta bort", exact: true }).click();
  await expect(page).toHaveURL(/\/matsedel\/tidigare$/);
  await expect(toast(page)).toHaveText("Tog bort matsedeln.");
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

test("dishes lie on days: the chip opens Flytta till dag, and the list does not care", async ({ page }) => {
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
  const listLines = async () => {
    await page.goto("/lista");
    await expect(page.getByTestId("shopping-line").filter({ visible: true }).first()).toBeVisible();
    return page.getByTestId("shopping-line").filter({ visible: true }).count();
  };
  const before = await listLines();
  const dayNames = ["måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag", "söndag"];
  // Sunday is always open, however far into the week it is (days that have passed are left out of the sheet, UX-33).
  const target = 7;

  // Existing dishes have no day.
  await page.goto("/matsedel");
  await expect(chip(dish(page, soppa))).toHaveText("–");
  await expect(chip(dish(page, gryta))).toHaveText("–");
  expect((await chip(dish(page, soppa)).boundingBox())!.height).toBeGreaterThanOrEqual(36);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // The chip opens the day picker: the days still open, each with its date, and Ingen dag last.
  await chip(dish(page, soppa)).click();
  const sheet = page.getByRole("dialog", { name: soppa });
  expect(await sheet.getByTestId("day-choice").count()).toBeGreaterThanOrEqual(2);
  await expect(sheet.getByTestId("day-choice").last()).toHaveText("Ingen dag");
  await expect(sheet.getByTestId("day-choice").nth(await sheet.getByTestId("day-choice").count() - 2)).toHaveText(/^Söndag \d+ [a-z]+/);
  expect((await sheet.getByTestId("day-choice").first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await sheet.getByRole("button", { name: /^Söndag/ }).click();
  await expect(toast(page)).toContainText(`${soppa} ligger på ${dayNames[target - 1]}.`);
  await expect(chip(dish(page, soppa))).toHaveText(/^Sön\d/);
  await expect(chip(dish(page, gryta))).toHaveText("–");
  await expect
    .poll(async () => {
      const { data } = await admin.from("meal_plan_recipe").select("weekday").eq("user_id", userId).eq("recipe_title", soppa).single();
      return (data as { weekday: number | null }).weekday;
    })
    .toBe(target);

  // The list ignores days: the same lines as before the move.
  expect(await listLines()).toBe(before);
  expect(errors).toEqual([]);
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

  // Next week: an empty week to plan, with the library under it.
  await nav.getByRole("link", { name: "Nästa vecka" }).click();
  await expect(page).toHaveURL(/\/matsedel\?vecka=\d{4}-W\d{2}$/);
  await expect(nav.locator(`[aria-current="page"]`)).toContainText("Nästa");
  await expect(page.getByTestId("week-empty")).toBeVisible();
  await expect(dishes(page)).toHaveCount(0);

  await addTab(page, "Alla recept");
  await plus(page, "Våffelsmet").click();
  await expect(dish(page, "Våffelsmet")).toHaveCount(1);
  // A coming week starts from Monday.
  await expect(chip(dish(page, "Våffelsmet"))).toHaveText(/^Mån\d/);
  await expect(toast(page)).toContainText("Våffelsmet på måndag.");
  await expect(bar(page)).toHaveText(/^1 rätt · 1 vara att köpa$/);

  // A reload keeps the week; the "Denna vecka" tile goes back to this week, which did not get the dish.
  await page.reload();
  await expect(nav.locator(`[aria-current="page"]`)).toContainText("Nästa");
  await expect(dish(page, "Våffelsmet")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await nav.getByRole("link", { name: /denna vecka/i }).click();
  await expect(page).toHaveURL(/\/matsedel\?vecka=\d{4}-W\d{2}$/);
  await expect(nav.locator(`[aria-current="page"]`)).toContainText("Denna vecka");
  await expect(dishes(page)).toHaveCount(thisWeekDishes);
  await expect(dish(page, "Våffelsmet")).toHaveCount(0);

  // UX-04: Inköpslista opens on the week last viewed (this week now) and has the same segment, with the items to buy;
  // choosing next week there is remembered by Matsedel too.
  await page.goto("/lista");
  const listNav = page.getByTestId("week-nav").filter({ visible: true });
  await expect(page.getByTestId("week-menu")).toHaveCount(0);
  await expect(listNav.locator(`[aria-current="page"]`)).toContainText("Denna vecka");
  await expect(listNav.getByTestId("week-tile")).toHaveCount(3);
  await expect(listNav.getByTestId("week-tile").nth(1).getByTestId("week-count")).toHaveText(/^\d+ var(a|or)$/);
  await expect(page.getByText("Mjölk", { exact: true })).toHaveCount(0);
  await listNav.getByRole("link", { name: /nästa vecka/i }).click();
  await expect(page).toHaveURL(/\/lista\?vecka=\d{4}-W\d{2}$/);
  await expect(listNav.locator(`[aria-current="page"]`)).toContainText("Nästa");
  await expect(page.getByText("Mjölk", { exact: true }).filter({ visible: true })).toBeVisible();
  await tab(page, "Matsedel").click();
  await expect(nav.locator(`[aria-current="page"]`)).toContainText("Nästa");
  expect(errors).toEqual([]);
});

test("an empty week in Inköpslista says so and offers to plan it; the segment counts the items to buy", async ({ page }) => {
  const errors = watchErrors(page);
  // A dish on next week, so the menu has a week with dishes; a week five ahead, reached by its address, has none.
  const ids = await seedIngredients(["Mjölk"]);
  await seedRecipe("Pannkaksmet", false, { text: "5 dl mjölk", ingredientId: ids.get("Mjölk")!, amount: 5 });
  await page.goto("/matsedel");
  await page.getByTestId("week-nav").filter({ visible: true }).getByRole("link", { name: "Nästa vecka" }).click();
  // The dish must land on next week: wait for the navigation before adding.
  await expect(page).toHaveURL(/\/matsedel\?vecka=\d{4}-W\d{2}$/);
  await addTab(page, "Alla recept");
  await plus(page, "Pannkaksmet").click();
  await expect(dish(page, "Pannkaksmet")).toHaveCount(1);
  // The ISO week of today plus 35 days: the Thursday of that week decides its year and number.
  const ahead = new Date(Date.now() + 35 * 86_400_000);
  const thursday = new Date(Date.UTC(ahead.getFullYear(), ahead.getMonth(), ahead.getDate() + 3 - ((ahead.getDay() + 6) % 7)));
  const week = Math.floor((thursday.getTime() - Date.UTC(thursday.getUTCFullYear(), 0, 1)) / 604_800_000) + 1;
  const param = `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  await page.goto(`/lista?vecka=${param}`);
  await expect(page.getByText("Inga rätter på matsedeln om 5 veckor.").filter({ visible: true })).toBeVisible();
  const listNav = page.getByTestId("week-nav").filter({ visible: true });
  const listTiles = listNav.getByTestId("week-tile");
  await expect(listTiles).toHaveCount(4);
  await expect(listTiles.nth(3)).toHaveAttribute("aria-current", "page");
  await expect(listTiles.nth(3)).toContainText("Om 5 v");
  await expect(listTiles.nth(3).getByTestId("week-count")).toHaveText("Tom");
  await expect(listTiles.nth(1).getByTestId("week-count")).toHaveText(/^\d+ var(a|or)$/);
  await page.getByRole("link", { name: "Planera veckan" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(new RegExp(`/matsedel\\?vecka=${param}$`));
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
  await expect(targets.nth(1)).toContainText(nextBefore === 0 ? "Tom" : nextBefore === 1 ? "1 rätt" : `${nextBefore} rätter`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await targets.nth(1).click();

  await expect(page).toHaveURL(/\/matsedel\?vecka=\d{4}-W\d{2}$/);
  await expect(toast(page)).toHaveText(/^Kopierade 2 rätter till vecka \d+$/);
  await expect(dishes(page)).toHaveCount(nextBefore + 2);
  await expect(chip(dish(page, soppa))).toHaveAttribute("aria-label", /nu tis$/);
  await expect(chip(dish(page, gryta))).toHaveAttribute("aria-label", /nu tor$/);
  await expect(tiles.nth(1).getByTestId("week-count")).toContainText(String(nextBefore + 2));

  await tiles.nth(0).click();
  await expect(page).toHaveURL(/\/matsedel\?vecka=\d{4}-W\d{2}$/);
  await expect(dishes(page)).toHaveCount(thisWeekCount);
  expect(errors).toEqual([]);
});
