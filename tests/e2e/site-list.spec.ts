import { expect, type Page, test } from "@playwright/test";
import { adminClient, e2eUserId, siteListEmail, siteListStorageState, thisMonday } from "./support";

// Story 8.5: Inköpslista before a trip to Stugan (UJ-6, Flöde 6). Under the
// title "Boende: Hemma" and "Byt"; "Byt" opens the sheet "Räkna listan mot",
// and a place chosen there is the same selection as in Hemma. The spec has
// an E2E user of its own (siteListEmail). Before each test the service role
// makes:
//
// - the catalog ingredients "Ketchup", "Senap" (Skafferi) and "Korv" (Kyl);
// - the recipe "Korv med bröd": 1 förp ketchup, 1 förp senap and 4 st korv,
//   on the current meal plan;
// - the place Stugan beside Hemma, with Hemma selected;
// - 1 förp ketchup on Hemma, and 1 förp senap on Stugan;
// - Maxi ICA Stormarknad Östersund as the selected store, for "Kopiera till ICA-varukorgen";
// - no checks, corrected amounts, hidden lines or own items.
//
// So against Hemma the list has senap and korv, and against Stugan ketchup
// and korv: two ketchup bottles and no senap is what the story prevents.

const mobile = { width: 375, height: 812 };
const title = "Korv med bröd";
const maxi = "Maxi ICA Stormarknad Östersund";

test.use({ storageState: siteListStorageState, viewport: mobile });
// One user for all the tests: each seeds it again, so they must not run at the same time.
test.describe.configure({ mode: "serial" });

let userId = "";
let ids = new Map<string, string>();
let planId = "";
let hemma = "";
let stugan = "";

const catalog = [
  { name: "Ketchup", section: "Skafferi", location: "Skafferi" },
  { name: "Senap", section: "Skafferi", location: "Skafferi" },
  { name: "Korv", section: "Chark", location: "Kyl" },
];

type SiteRow = { id: string; user_id: string; name: string; normalized_name: string; is_selected: boolean };

test.beforeAll(async () => {
  userId = await e2eUserId(siteListEmail);
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
 * of every place), so the user always has exactly one selected place
 * (pantry_site_one_selected at commit; the partial unique index row by row,
 * so the place to select comes last).
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

/** Puts `amount` `unit` of `ingredient` on the place, in the ingredient's location. */
async function addPantry(siteId: string, ingredient: string, amount: number, unit: string) {
  const location = catalog.find((item) => item.name === ingredient)!.location;
  const { error } = await adminClient()
    .from("pantry_item")
    .insert({ user_id: userId, site_id: siteId, ingredient_id: ids.get(ingredient), location, amount, unit });
  if (error) throw error;
}

/** The list key of the recipe line for `ingredient` in `unit` (shopping/domain/lineKey). */
const lineKey = (ingredient: string, unit: string) => `r:${ids.get(ingredient)}:${unit}`;

/** Starts each test from the same recipe, plan, places, pantry and store, with Hemma selected. */
async function seed() {
  const admin = adminClient();
  // The choices first: they keep the stores (on delete restrict). The plan takes its checks,
  // corrections and own items with it; they are cleared by user too, so none is left over.
  for (const table of [
    "product_choice",
    "store",
    "shopping_check",
    "shopping_line_override",
    "shopping_custom_item",
    "meal_plan",
    "pantry_item",
    "recipe",
  ] as const) {
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

  const store = await admin.from("store").insert({
    user_id: userId,
    name: maxi,
    chain: "ICA",
    external_store_id: "1003733",
    address: "Testgatan 1, 123 45 Teststad",
    url: "https://handlaprivatkund.ica.se/stores/1003733",
    is_selected: true,
  });
  if (store.error) throw store.error;

  const recipe = await admin
    .from("recipe")
    .insert({ user_id: userId, title, original_servings: 4, total_minutes: 15, source_kind: "text" })
    .select("id")
    .single();
  if (recipe.error) throw recipe.error;
  const recipeId = (recipe.data as { id: string }).id;
  const lines = await admin.from("recipe_ingredient").insert(
    [
      { text: "1 flaska ketchup", ingredient: "Ketchup", amount: 1, unit: "förp" },
      { text: "1 tub senap", ingredient: "Senap", amount: 1, unit: "förp" },
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
  planId = (plan.data as { id: string }).id;
  const dish = await admin.from("meal_plan_recipe").insert({
    user_id: userId,
    meal_plan_id: planId,
    recipe_id: recipeId,
    recipe_title: title,
    servings: 4,
    position: 0,
  });
  if (dish.error) throw dish.error;
  await addPantry(hemma, "Ketchup", 1, "förp");
  await addPantry(stugan, "Senap", 1, "förp");
}

type PantryRow = { ingredient_id: string; location: string; amount: number | null; unit: string | null };

const byIngredient = (a: PantryRow, b: PantryRow) => `${a.ingredient_id}${a.location}`.localeCompare(`${b.ingredient_id}${b.location}`);

/** The rows on one place, read with the service role, in a fixed order. */
async function pantryOn(siteId: string): Promise<PantryRow[]> {
  const { data, error } = await adminClient()
    .from("pantry_item")
    .select("ingredient_id, location, amount, unit")
    .eq("site_id", siteId);
  if (error) throw error;
  return (data as PantryRow[]).map((row) => ({ ...row, amount: row.amount === null ? null : Number(row.amount) })).sort(byIngredient);
}

/** The current plan's checks, by list key, with the service role. */
async function storedChecks(): Promise<string[]> {
  const { data, error } = await adminClient().from("shopping_check").select("line_key").eq("user_id", userId);
  if (error) throw error;
  return (data as { line_key: string }[]).map((row) => row.line_key).sort();
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
const bytButton = (page: Page) => page.getByRole("button", { name: "Byt boende för listan" }).filter({ visible: true });
const switchSheet = (page: Page) => page.getByRole("dialog", { name: "Räkna listan mot" });
const placeRow = (page: Page, name: "Hemma" | "Stugan") => switchSheet(page).getByRole("button", { name, exact: true });
const lineCheck = (page: Page, label: "Ketchup" | "Senap" | "Korv" | "Kaffe") =>
  page.getByRole("checkbox", { name: new RegExp(`^${label}\\b`) }).filter({ visible: true });
const toast = (page: Page, text: string) => page.getByTestId("toast").filter({ hasText: text });
/** The confirmation strip, whatever it says. */
const anyToast = (page: Page) => page.getByTestId("toast");
const listAnnouncement = (page: Page) => page.getByTestId("list-announcement").filter({ visible: true });
const progress = (page: Page) => page.getByTestId("list-progress").filter({ visible: true });
/** Unfolds I korgen, where the checked lines are (Story 11.4). */
const showBasket = async (page: Page) => {
  // I korgen is open from the start (Story 3.9): "Visa" only when it was folded.
  const show = page.getByRole("button", { name: /^Visa I korgen/ }).filter({ visible: true });
  if ((await show.count()) > 0) await show.click();
};
const putButton = (page: Page) => page.getByRole("button", { name: "Lägg till i Matvaror", exact: true }).filter({ visible: true });
const sendButton = (page: Page) => page.getByRole("button", { name: "Kopiera till ICA-varukorgen", exact: true }).filter({ visible: true });
const tab = (page: Page, name: "Inköpslista" | "Matvaror") =>
  page.getByRole("navigation", { name: "Huvudmeny" }).getByRole("link", { name });
const placePill = (page: Page, name: "Hemma" | "Stugan") =>
  page.getByRole("radiogroup", { name: "Boende" }).filter({ visible: true }).getByRole("radio", { name, exact: true });

/**
 * "Byt", then `name` in "Räkna listan mot": the sheet closes and the
 * confirmation says so. A confirmation from before goes first, so the one
 * seen is this switch's.
 */
async function countAgainst(page: Page, name: "Hemma" | "Stugan") {
  // Only an earlier "Listan räknas nu mot" must be gone; an undo strip ("... i korgen") may linger and is replaced.
  await expect(toast(page, "Listan räknas nu mot")).toHaveCount(0, { timeout: 10_000 });
  await expect(bytButton(page)).toBeEnabled();
  await bytButton(page).click();
  await expect(switchSheet(page)).toBeVisible();
  await placeRow(page, name).click();
  await expect(switchSheet(page)).toHaveCount(0);
  await expect(toast(page, `Listan räknas nu mot ${name}.`)).toBeVisible();
  // Said once, by the confirmation: the list's own announcement stays empty (read at once, no retries).
  expect(await listAnnouncement(page).textContent()).toBe("");
  await expect(siteLine(page)).toHaveText(`Boende: ${name}`);
}

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.beforeEach(async () => {
  await seed();
});

test("Byt counts the list against Stugan: ketchup instead of senap, and Hemma shows Stugan as selected", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/lista");
  await expect(siteLine(page)).toHaveText("Boende: Hemma");
  await expect(bytButton(page)).toHaveText("Byt");
  await expect(lineCheck(page, "Senap")).toBeVisible();
  await expect(lineCheck(page, "Korv")).toBeVisible();
  await expect(lineCheck(page, "Ketchup")).toHaveCount(0);
  // Metadata under the title, never in a live region.
  await expect(page.locator("[aria-live] [data-testid=site-line]")).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  await bytButton(page).click();
  const sheet = switchSheet(page);
  await expect(sheet.getByRole("list", { name: "Räkna listan mot" })).toBeVisible();
  await expect(placeRow(page, "Hemma")).toHaveAttribute("aria-current", "true");
  await expect(placeRow(page, "Stugan")).not.toHaveAttribute("aria-current");
  await placeRow(page, "Stugan").click();
  await expect(sheet).toHaveCount(0);
  await expect(toast(page, "Listan räknas nu mot Stugan.")).toBeVisible();
  // Only the confirmation is said: the list's own recount stays silent for a switch made in the sheet.
  expect(await listAnnouncement(page).textContent()).toBe("");
  await expect(siteLine(page)).toHaveText("Boende: Stugan");
  await expect(lineCheck(page, "Ketchup")).toBeVisible();
  await expect(lineCheck(page, "Korv")).toBeVisible();
  await expect(lineCheck(page, "Senap")).toHaveCount(0);
  // Focus goes back to Byt.
  await expect(bytButton(page)).toBeFocused();
  await expectNoHorizontalScroll(page);
  await expect.poll(async () => (await sites()).find((site) => site.is_selected)?.id).toBe(stugan);

  // The same selection as in Matvaror.
  await tab(page, "Matvaror").click();
  await expect(page.getByRole("heading", { level: 1, name: "Matvaror" })).toBeVisible();
  await expect(placePill(page, "Stugan")).toBeChecked();
  await expect(placePill(page, "Hemma")).not.toBeChecked();
  expect(errors).toEqual([]);
});

test("a check, a corrected amount, a hidden line and an own item stay through a switch", async ({ page }) => {
  const errors = watchErrors(page);
  const admin = adminClient();
  const checks = await admin.from("shopping_check").insert({ user_id: userId, meal_plan_id: planId, line_key: lineKey("Korv", "st") });
  if (checks.error) throw checks.error;
  const overrides = await admin.from("shopping_line_override").insert([
    { user_id: userId, meal_plan_id: planId, line_key: lineKey("Korv", "st"), amount: 8, hidden: false },
    // Covered on Hemma; on Stugan it is short, and stays hidden.
    { user_id: userId, meal_plan_id: planId, line_key: lineKey("Ketchup", "förp"), amount: null, hidden: true },
  ]);
  if (overrides.error) throw overrides.error;
  const own = await admin.from("shopping_custom_item").insert({ user_id: userId, meal_plan_id: planId, label: "Kaffe" });
  if (own.error) throw own.error;

  await page.goto("/lista");
  // The checked korv is in I korgen (Story 11.4), which stays open through the switch.
  await showBasket(page);
  await expect(lineCheck(page, "Korv")).toBeChecked();
  await expect(lineCheck(page, "Korv")).toHaveAccessibleName(/^Korv, 8 st/);
  await expect(lineCheck(page, "Kaffe")).toBeVisible();
  await expect(lineCheck(page, "Senap")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Dolda varor/ }).filter({ visible: true })).toHaveCount(0);

  await countAgainst(page, "Stugan");
  await expect(lineCheck(page, "Korv")).toBeChecked();
  await expect(lineCheck(page, "Korv")).toHaveAccessibleName(/^Korv, 8 st/);
  await expect(lineCheck(page, "Kaffe")).toBeVisible();
  await expect(lineCheck(page, "Kaffe")).not.toBeChecked();
  await expect(lineCheck(page, "Senap")).toHaveCount(0);
  // The ketchup is short at Stugan, but Pontus hid it.
  await expect(lineCheck(page, "Ketchup")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Dolda varor (1)" }).filter({ visible: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("senap checked off against Hemma leaves the list against Stugan, and is checked again back on Hemma", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/lista");
  await lineCheck(page, "Senap").click();
  await showBasket(page);
  await expect(lineCheck(page, "Senap")).toBeChecked();
  // The check is saved once the button is on.
  await expect(putButton(page)).toBeEnabled();
  await expect.poll(storedChecks).toEqual([lineKey("Senap", "förp")]);

  await countAgainst(page, "Stugan");
  await expect(lineCheck(page, "Senap")).toHaveCount(0);
  await expect(progress(page)).toHaveText(/^2 varor kvar\s*0 av 2 i korgen$/);
  // The check stays on the server, under its key without a place.
  expect(await storedChecks()).toEqual([lineKey("Senap", "förp")]);

  await countAgainst(page, "Hemma");
  // Back in I korgen, which folded while it was empty.
  await showBasket(page);
  await expect(lineCheck(page, "Senap")).toBeChecked();
  expect(errors).toEqual([]);
});

test("Lägg till i Matvaror against Stugan puts only what was checked off there, and keeps the senap checked against Hemma", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto("/lista");
  await lineCheck(page, "Senap").click();
  // Moved to I korgen, which is open from the start (Story 3.9): still there, checked.
  await expect(lineCheck(page, "Senap")).toBeChecked();
  await expect.poll(storedChecks).toEqual([lineKey("Senap", "förp")]);

  await countAgainst(page, "Stugan");
  await lineCheck(page, "Korv").click();
  await expect(lineCheck(page, "Korv")).toBeChecked();
  await expect(progress(page)).toHaveText(/1 av 2 i korgen$/);
  await expect(putButton(page)).toBeEnabled();
  await putButton(page).click();
  await expect(toast(page, "Lagt 1 vara i Matvaror för Stugan.")).toBeVisible();
  await expect(lineCheck(page, "Korv")).toHaveCount(0);

  // Exactly the korv went to Stugan, beside the senap that was there; Hemma is untouched.
  await expect.poll(async () => pantryOn(stugan)).toEqual(
    (
      [
        { ingredient_id: ids.get("Korv"), location: "Kyl", amount: 4, unit: "st" },
        { ingredient_id: ids.get("Senap"), location: "Skafferi", amount: 1, unit: "förp" },
      ] as PantryRow[]
    ).sort(byIngredient),
  );
  expect(await pantryOn(hemma)).toEqual([{ ingredient_id: ids.get("Ketchup"), location: "Skafferi", amount: 1, unit: "förp" }]);
  // The senap's check, counted against Hemma, stays for when the list is counted there again.
  expect(await storedChecks()).toEqual([lineKey("Senap", "förp")]);
  expect(errors).toEqual([]);
});

test("a place removed elsewhere while the sheet is open is gone when tapped: a toast says so and the list is counted against Hemma", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto("/lista");
  await expect(bytButton(page)).toBeEnabled();
  await bytButton(page).click();
  await expect(placeRow(page, "Stugan")).toBeVisible();
  // Another device empties Stugan and removes it, with Hemma selected.
  await removeStugan();
  await placeRow(page, "Stugan").click();
  await expect(toast(page, "Boendet finns inte längre. Välj ett annat boende.")).toBeVisible();
  // Hemma is the only place: no line, no sheet, and focus on the page heading rather than nowhere.
  await expect(switchSheet(page)).toHaveCount(0);
  await expect(siteLine(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Inköpslista" }).filter({ visible: true })).toBeFocused();
  await expect(lineCheck(page, "Senap")).toBeVisible();
  expect((await sites()).map((site) => site.id)).toEqual([hemma]);
  expect(errors.filter((text) => !text.includes("pantry_site_gone"))).toEqual([]);
});

test("the empty list names Stugan when everything is in stock there", async ({ page }) => {
  const errors = watchErrors(page);
  await addPantry(stugan, "Ketchup", 1, "förp");
  await addPantry(stugan, "Korv", 8, "st");
  await page.goto("/lista");
  await expect(lineCheck(page, "Senap")).toBeVisible();
  await countAgainst(page, "Stugan");
  await expect(page.getByText("Allt finns i Matvaror för Stugan.").filter({ visible: true })).toBeVisible();
  await expect(progress(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Kopiera till ICA-varukorgen against Stugan copies the export of Stugan's list, in the same format", async ({ page, context, baseURL }) => {
  const errors = watchErrors(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
  await page.goto("/lista");
  await countAgainst(page, "Stugan");
  await expect(lineCheck(page, "Ketchup")).toBeVisible();
  await sendButton(page).click();
  await expect(toast(page, "Inköpslistan är kopierad. Klistra in den i Claude i Chrome på ICA Handla.")).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text.startsWith("Matkoll varukorgsexport v1\n")).toBe(true);
  expect(text).toContain("- Ketchup\n");
  expect(text).toContain("- Korv\n");
  expect(text).not.toMatch(/senap/i);
  // The place is never part of the export.
  expect(text).not.toContain("Stugan");
  expect(errors).toEqual([]);
});

test("with Stugan removed there is no line, and the empty list says Allt finns hemma. as in 1.0", async ({ page }) => {
  const errors = watchErrors(page);
  await removeStugan();
  await addPantry(hemma, "Senap", 1, "förp");
  await addPantry(hemma, "Korv", 8, "st");
  await page.goto("/lista");
  await expect(page.getByText("Allt finns hemma.").filter({ visible: true })).toBeVisible();
  await expect(siteLine(page)).toHaveCount(0);
  await expect(bytButton(page)).toHaveCount(0);
  await expect(page.getByText(/^Boende:/)).toHaveCount(0);
  expect(errors).toEqual([]);
});
