import { expect, type Page, test } from "@playwright/test";
import { adminClient, e2eUserId, siteStatusEmail, siteStatusStorageState, thisMonday } from "./support";

// Story 8.3: the cooking status, the line "Boende: Stugan" and "Lägg i
// förrådet" follow the selected place. The spec has an E2E user of its own
// (siteStatusEmail). Before each test the service role makes:
//
// - the catalog ingredients "Ketchup" (Skafferi) and "Korv" (Kyl);
// - the recipe "Korv med ketchup" for 4: 1 förp ketchup and 4 st korv;
// - the place Stugan beside Hemma, with Hemma selected;
// - ketchup and korv on Hemma, and only korv on Stugan;
// - a meal plan with the dish.
//
// So against Hemma the recipe can be cooked now, and against Stugan it
// misses the ketchup. Most tests select the place with the service role,
// since the place selected before a page loads is what they look at. One
// selects it with the picker in Hemma (Story 8.2) and goes back with the
// app's own links, to see the views follow without a reload.

const mobile = { width: 375, height: 812 };
const title = "Korv med ketchup";

test.use({ storageState: siteStatusStorageState, viewport: mobile });
// One user for all the tests: each seeds it again, so they must not run at the same time.
test.describe.configure({ mode: "serial" });

let userId = "";
let ids = new Map<string, string>();
let recipeId = "";
let hemma = "";
let stugan = "";

const catalog = [
  { name: "Ketchup", section: "Skafferi", location: "Skafferi" },
  { name: "Korv", section: "Chark", location: "Kyl" },
];

type SiteRow = { id: string; user_id: string; name: string; normalized_name: string; is_selected: boolean };

test.beforeAll(async () => {
  userId = await e2eUserId(siteStatusEmail);
  // Catalog ingredients are never deleted: upserted, so a retry finds the same ones.
  const { data, error } = await adminClient()
    .from("ingredient")
    .upsert(
      catalog.map((item) => ({ user_id: userId, normalized_name: item.name.toLocaleLowerCase("sv-SE"), ...item })),
      { onConflict: "user_id,normalized_name" },
    )
    .select("id, name");
  if (error) throw error;
  ids = new Map((data as { id: string; name: string }[]).map((row) => [row.name, row.id]));
});

async function sites(): Promise<SiteRow[]> {
  const { data, error } = await adminClient()
    .from("pantry_site")
    .select("id, user_id, name, normalized_name, is_selected")
    .eq("user_id", userId)
    .order("created_at");
  if (error) throw error;
  return data as SiteRow[];
}

/**
 * Selects the place `id` with the service role, in one statement (an upsert
 * of every place), so the user always has exactly one selected place:
 * pantry_site_one_selected checks it at commit, and the partial unique index
 * row by row, so the place to select comes last.
 */
async function selectSite(id: string) {
  const rows = (await sites()).map((site) => ({ ...site, is_selected: site.id === id }));
  rows.sort((a, b) => Number(a.is_selected) - Number(b.is_selected));
  const { error } = await adminClient().from("pantry_site").upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

/** Removes Stugan, emptied first, as Pontus can in Hemma (Story 8.2): Hemma is selected. */
async function removeStugan() {
  await selectSite(hemma);
  const items = await adminClient().from("pantry_item").delete().eq("site_id", stugan);
  if (items.error) throw items.error;
  const site = await adminClient().from("pantry_site").delete().eq("id", stugan);
  if (site.error) throw site.error;
}

/** Starts each test from the same recipe, plan, places and pantry, with Hemma selected. */
async function seed() {
  const admin = adminClient();
  for (const table of ["shopping_custom_item", "shopping_check", "meal_plan", "pantry_item", "recipe"] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  // Hemma comes with the sign-in (ensure_pantry_defaults); Stugan is made again.
  const home = (await sites()).find((site) => site.normalized_name === "hemma");
  if (!home) throw new Error("Hemma is missing; the sign-in in global-setup creates it");
  hemma = home.id;
  await selectSite(hemma);
  const others = await admin.from("pantry_site").delete().eq("user_id", userId).neq("id", hemma);
  if (others.error) throw others.error;
  const created = await admin
    .from("pantry_site")
    .insert({ user_id: userId, name: "Stugan", normalized_name: "stugan", is_selected: false })
    .select("id")
    .single();
  if (created.error) throw created.error;
  stugan = (created.data as { id: string }).id;

  const recipe = await admin
    .from("recipe")
    .insert({ user_id: userId, title, original_servings: 4, total_minutes: 15, source_kind: "text" })
    .select("id")
    .single();
  if (recipe.error) throw recipe.error;
  recipeId = (recipe.data as { id: string }).id;
  const lines = await admin.from("recipe_ingredient").insert(
    [
      { text: "1 flaska ketchup", ingredient: "Ketchup", amount: 1, unit: "förp" },
      { text: "4 korvar", ingredient: "Korv", amount: 4, unit: "st" },
    ].map((line, position) => ({
      user_id: userId,
      recipe_id: recipeId,
      position,
      original_text: line.text,
      amount: line.amount,
      unit: line.unit,
      is_vague: false,
      ingredient_id: ids.get(line.ingredient),
    })),
  );
  if (lines.error) throw lines.error;
  const plan = await admin.from("meal_plan").insert({ user_id: userId, name: "Vecka 44", is_current: true, week_start: thisMonday() }).select("id").single();
  if (plan.error) throw plan.error;
  const dish = await admin.from("meal_plan_recipe").insert({
    user_id: userId,
    meal_plan_id: (plan.data as { id: string }).id,
    recipe_id: recipeId,
    recipe_title: title,
    servings: 4,
    position: 0,
  });
  if (dish.error) throw dish.error;
  const pantry = await admin.from("pantry_item").insert([
    { user_id: userId, site_id: hemma, ingredient_id: ids.get("Ketchup"), location: "Skafferi", amount: 1, unit: "förp" },
    { user_id: userId, site_id: hemma, ingredient_id: ids.get("Korv"), location: "Kyl", amount: 8, unit: "st" },
    { user_id: userId, site_id: stugan, ingredient_id: ids.get("Korv"), location: "Kyl", amount: 8, unit: "st" },
  ]);
  if (pantry.error) throw pantry.error;
}

type PantryRow = { ingredient_id: string; location: string; amount: number | null; unit: string | null };

/** The rows on one place, read with the service role, in a fixed order. */
async function pantryOn(siteId: string): Promise<PantryRow[]> {
  const { data, error } = await adminClient()
    .from("pantry_item")
    .select("ingredient_id, location, amount, unit")
    .eq("site_id", siteId);
  if (error) throw error;
  return (data as PantryRow[])
    .map((row) => ({ ...row, amount: row.amount === null ? null : Number(row.amount) }))
    .sort((a, b) => `${a.ingredient_id}${a.location}`.localeCompare(`${b.ingredient_id}${b.location}`));
}

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
const siteLine = (page: Page) => page.getByTestId("site-line").filter({ visible: true });
const view = (page: Page) => page.getByRole("article").filter({ visible: true });
const rows = (page: Page) => page.getByTestId("recipe-card").filter({ visible: true });
const pill = (page: Page, name: "Alla" | "Favoriter" | "Kan lagas nu") =>
  page.getByRole("radio", { name }).filter({ visible: true });
const dish = (page: Page) => page.getByTestId("plan-dish").filter({ visible: true });
const ketchupCheck = (page: Page) => page.getByRole("checkbox", { name: /^Ketchup/ }).filter({ visible: true });
const putButton = (page: Page) => page.getByRole("button", { name: "Lägg i förrådet", exact: true }).filter({ visible: true });
/** Unfolds I korgen, where the checked lines are (Story 11.4). */
const showBasket = async (page: Page) => {
  // I korgen is open from the start (Story 3.9): "Visa" only when it was folded.
  const show = page.getByRole("button", { name: /^Visa I korgen/ }).filter({ visible: true });
  if ((await show.count()) > 0) await show.click();
};
const toast = (page: Page) => page.getByTestId("toast");
const tab = (page: Page, name: "Recept" | "Matsedel" | "Inköpslista" | "Förråd") =>
  page.getByRole("navigation", { name: "Huvudmeny" }).getByRole("link", { name });
const placePill = (page: Page, name: "Hemma" | "Stugan") =>
  page.getByRole("radiogroup", { name: "Boende" }).filter({ visible: true }).getByRole("radio", { name, exact: true });

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.beforeEach(async () => {
  await seed();
});

test("with Stugan selected, the recipe view, the library with Kan lagas nu and the meal plan count against Stugan and say so", async ({
  page,
}) => {
  const errors = watchErrors(page);
  // Two places, Hemma selected: the line names Hemma, and the recipe can be cooked now.
  await page.goto(`/recept/${recipeId}`);
  await expect(view(page).getByText("Kan lagas nu", { exact: true })).toBeVisible();
  await expect(siteLine(page)).toHaveText("Boende: Hemma");

  await selectSite(stugan);
  await page.goto(`/recept/${recipeId}`);
  await expect(view(page).getByText(/^Saknar: [^,+]+$/)).toBeVisible();
  await expect(view(page).getByTestId("recipe-at-home")).toHaveText("1 av 2 hemma");
  await expect(siteLine(page)).toHaveText("Boende: Stugan");
  // Under "X av Y hemma", as metadata, and never in a live region.
  await expect(page.locator("[aria-live] [data-testid=site-line]")).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  await page.goto("/recept");
  await pill(page, "Kan lagas nu").click();
  await expect(siteLine(page)).toHaveText("Boende: Stugan");
  await expect(rows(page).filter({ hasText: title }).getByText("Saknar 1 vara", { exact: true })).toBeVisible();
  await pill(page, "Alla").click();
  await expect(siteLine(page)).toHaveCount(0);
  // The badges are counted against Stugan all the same.
  await expect(rows(page).filter({ hasText: title }).getByText("Saknar 1 vara", { exact: true })).toBeVisible();

  await page.goto("/matsedel");
  await expect(siteLine(page)).toHaveText("Boende: Stugan");
  await expect(dish(page).getByTestId("dish-meta")).toContainText("1 av 2 hemma");
  await expectNoHorizontalScroll(page);

  // Back to Hemma: everything follows.
  await selectSite(hemma);
  await page.goto("/matsedel");
  await expect(siteLine(page)).toHaveText("Boende: Hemma");
  await expect(dish(page).getByTestId("dish-meta")).toContainText("✓ Allt hemma");
  await page.goto(`/recept/${recipeId}`);
  await expect(view(page).getByText("Kan lagas nu", { exact: true })).toBeVisible();
  await expect(siteLine(page)).toHaveText("Boende: Hemma");
  expect(errors).toEqual([]);
});

test("a switch with the picker in Förråd reaches the recipe view, Kan lagas nu and Matsedel without a reload", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await selectSite(stugan);
  await page.goto(`/recept/${recipeId}`);
  await expect(view(page).getByText(/^Saknar: [^,+]+$/)).toBeVisible();
  await expect(siteLine(page)).toHaveText("Boende: Stugan");
  // Set once; a reload would clear it.
  await page.evaluate(() => Object.assign(window, { siteStatusNoReload: true }));

  await tab(page, "Recept").click();
  await expect(page).toHaveURL(/\/recept$/);
  await pill(page, "Kan lagas nu").click();
  await expect(siteLine(page)).toHaveText("Boende: Stugan");
  await expect(rows(page).filter({ hasText: title }).getByText("Saknar 1 vara", { exact: true })).toBeVisible();
  await tab(page, "Matsedel").click();
  await expect(siteLine(page)).toHaveText("Boende: Stugan");
  await expect(dish(page).getByTestId("dish-meta")).toContainText("1 av 2 hemma");

  // Förråd with the real picker (Story 8.2).
  await tab(page, "Förråd").click();
  await expect(page.getByRole("heading", { level: 1, name: "Förråd" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hantera boenden", exact: true }).filter({ visible: true })).toBeEnabled();
  await placePill(page, "Hemma").click();
  await expect(page.getByTestId("site-announcement").filter({ visible: true })).toHaveText("Valt boende: Hemma.");
  await expect(page.getByTestId("site-content").filter({ visible: true })).not.toHaveAttribute("aria-busy");
  await expect.poll(async () => (await sites()).find((site) => site.is_selected)?.id).toBe(hemma);

  // Back with the app's links: the library, still on Kan lagas nu, counts against Hemma.
  await tab(page, "Recept").click();
  await expect(page).toHaveURL(/\/recept$/);
  await expect(pill(page, "Kan lagas nu")).toBeChecked();
  await expect(siteLine(page)).toHaveText("Boende: Hemma");
  await expect(rows(page).filter({ hasText: title }).getByText("Kan lagas nu", { exact: true })).toBeVisible();
  await rows(page).filter({ hasText: title }).getByRole("link").first().click();
  await expect(page).toHaveURL(new RegExp(`/recept/${recipeId}$`));
  await expect(view(page).getByText("Kan lagas nu", { exact: true })).toBeVisible();
  await expect(view(page).getByTestId("recipe-at-home")).toHaveText("2 av 2 hemma");
  await expect(siteLine(page)).toHaveText("Boende: Hemma");

  await tab(page, "Matsedel").click();
  await expect(page).toHaveURL(/\/matsedel$/);
  await expect(siteLine(page)).toHaveText("Boende: Hemma");
  await expect(dish(page).getByTestId("dish-meta")).toContainText("✓ Allt hemma");

  expect(await page.evaluate(() => (window as unknown as { siteStatusNoReload?: boolean }).siteStatusNoReload)).toBe(true);
  expect(errors).toEqual([]);
});

test("with one place there is no line Lager anywhere, as in 1.0", async ({ page }) => {
  const errors = watchErrors(page);
  await removeStugan();
  await page.goto(`/recept/${recipeId}`);
  await expect(view(page).getByText("Kan lagas nu", { exact: true })).toBeVisible();
  await expect(siteLine(page)).toHaveCount(0);
  await page.goto("/recept");
  await pill(page, "Kan lagas nu").click();
  await expect(rows(page)).toHaveCount(1);
  await expect(siteLine(page)).toHaveCount(0);
  await page.goto("/matsedel");
  await expect(dish(page)).toHaveCount(1);
  await expect(siteLine(page)).toHaveCount(0);
  await expect(page.getByText(/^Boende:/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Lägg i förrådet with Stugan selected puts the ketchup on Stugan and says so", async ({ page }) => {
  const errors = watchErrors(page);
  await selectSite(stugan);
  const hemmaBefore = await pantryOn(hemma);
  await page.goto("/lista");
  await ketchupCheck(page).click();
  await showBasket(page);
  await expect(ketchupCheck(page)).toBeChecked();
  await putButton(page).click();
  await expect(toast(page)).toHaveText("Lagt 1 vara i förrådet för Stugan.");
  await expect(ketchupCheck(page)).toHaveCount(0);

  await expect
    .poll(async () => (await pantryOn(stugan)).filter((row) => row.ingredient_id === ids.get("Ketchup")))
    .toEqual([{ ingredient_id: ids.get("Ketchup"), location: "Skafferi", amount: 1, unit: "förp" }]);
  expect(await pantryOn(hemma)).toEqual(hemmaBefore);
  expect(errors).toEqual([]);
});

test("Lägg i förrådet for a place removed elsewhere writes nothing, keeps the check, counts the list against Hemma, and a second tap puts it there", async ({
  page,
}) => {
  const errors = watchErrors(page);
  // Hemma without ketchup and korv, so the list against Hemma differs from Stugan's and keeps the ketchup.
  const cleared = await adminClient()
    .from("pantry_item")
    .delete()
    .eq("site_id", hemma)
    .in("ingredient_id", [ids.get("Ketchup"), ids.get("Korv")]);
  if (cleared.error) throw cleared.error;
  await selectSite(stugan);
  await page.goto("/lista");
  const korvCheck = page.getByRole("checkbox", { name: /^Korv/ }).filter({ visible: true });
  await expect(korvCheck).toHaveCount(0);
  await ketchupCheck(page).click();
  await showBasket(page);
  await expect(ketchupCheck(page)).toBeChecked();
  await expect(putButton(page)).toBeEnabled();

  // Another device selects Hemma, empties Stugan and removes it.
  await removeStugan();
  const hemmaBefore = await pantryOn(hemma);
  await putButton(page).click();
  // The list's notice (not Next's route announcer, also an alert).
  await expect(page.getByRole("alert").filter({ visible: true, hasText: "Boendet" })).toHaveText(
    "Boendet finns inte längre. Listan har räknats om. Tryck Lägg i förrådet igen.",
  );
  // The list is read again against Hemma: the korv is missing there; the ketchup keeps its check.
  await expect(korvCheck).toBeVisible();
  await expect(ketchupCheck(page)).toBeChecked();
  expect(await pantryOn(hemma)).toEqual(hemmaBefore);
  const receipts = await adminClient()
    .from("pantry_addition")
    .select("key", { count: "exact", head: true })
    .eq("user_id", userId);
  expect(receipts.count).toBe(0);

  // A second tap puts the ketchup on Hemma, the only place now.
  await putButton(page).click();
  await expect(toast(page)).toHaveText("Lagt 1 vara i förrådet.");
  await expect
    .poll(async () => (await pantryOn(hemma)).filter((row) => row.ingredient_id === ids.get("Ketchup")))
    .toEqual([{ ingredient_id: ids.get("Ketchup"), location: "Skafferi", amount: 1, unit: "förp" }]);
  expect(errors).toEqual([]);
});

test("Lägg i förrådet puts the ketchup on the list's place when Hemma is selected elsewhere after the list was shown", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await selectSite(stugan);
  const hemmaBefore = await pantryOn(hemma);
  await page.goto("/lista");
  await ketchupCheck(page).click();
  await showBasket(page);
  await expect(ketchupCheck(page)).toBeChecked();
  // The check is saved (and the list read again, against Stugan) once the button is on.
  await expect(putButton(page)).toBeEnabled();
  // Another device selects Hemma before the tap.
  await selectSite(hemma);
  await putButton(page).click();
  await expect(toast(page)).toHaveText("Lagt 1 vara i förrådet för Stugan.");

  await expect
    .poll(async () => (await pantryOn(stugan)).some((row) => row.ingredient_id === ids.get("Ketchup")))
    .toBe(true);
  expect(await pantryOn(hemma)).toEqual(hemmaBefore);
  expect(errors).toEqual([]);
});
