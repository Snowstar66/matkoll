import { expect, type Page, test } from "@playwright/test";
import { normalizeIngredientText } from "@/features/catalog";
import { adminClient, cardTitles, e2eUserId, inventoryEmail, inventoryStorageState } from "./support";

// Story 6.4: a photo of a place that already has items is compared with it,
// with AI_PROVIDER=mock: kyl.png gives grädde, gurka, ketchup, mjölk 1 förp,
// smör and ägg 6 st (kyl.analyze.json). The spec has an E2E user of its own
// (inventoryEmail): before each test the service role empties its pantry and
// makes the catalog ingredients "Mjölk", "Smör", "Ägg" (st), "Yoghurt" and
// "Senap", and "Grädde", "Gurka" and "Ketchup" (so no item of the photo is a
// new catalog ingredient and the comparison is complete), and the pantry
// items "Mjölk 2 förp", "Smör" (unlimited), "Ägg 6 st", "Yoghurt 2 förp" and
// "Senap" (unlimited) in Kyl. Frys is empty. The tests run in order, since
// they share the user.

const kyl = "tests/fixtures/ai/kyl.png";

test.use({ storageState: inventoryStorageState, viewport: { width: 375, height: 812 } });
test.describe.configure({ mode: "serial" });

let userId = "";
test.beforeAll(async () => {
  userId = await e2eUserId(inventoryEmail);
});

test.beforeEach(async () => {
  const admin = adminClient();
  for (const table of ["pantry_item", "pantry_removal", "ingredient_synonym"] as const) {
    const removed = await admin.from(table).delete().eq("user_id", userId);
    if (removed.error) throw removed.error;
  }
  const catalog = await admin
    .from("ingredient")
    .upsert(
      [
        { user_id: userId, name: "Mjölk", normalized_name: "mjölk", section: "Mejeri", location: "Kyl", default_unit: "förp" },
        { user_id: userId, name: "Smör", normalized_name: "smör", section: "Mejeri", location: "Kyl", default_unit: "förp" },
        { user_id: userId, name: "Ägg", normalized_name: "ägg", section: "Mejeri", location: "Kyl", default_unit: "st" },
        { user_id: userId, name: "Yoghurt", normalized_name: "yoghurt", section: "Mejeri", location: "Kyl", default_unit: "förp" },
        { user_id: userId, name: "Senap", normalized_name: "senap", section: "Skafferi", location: "Kyl", default_unit: "förp" },
        // In the catalog but not at home, so the photo has no new catalog ingredient and the comparison is complete.
        { user_id: userId, name: "Grädde", normalized_name: "grädde", section: "Mejeri", location: "Kyl", default_unit: "förp" },
        { user_id: userId, name: "Gurka", normalized_name: "gurka", section: "Frukt och grönt", location: "Kyl", default_unit: "st" },
        { user_id: userId, name: "Ketchup", normalized_name: "ketchup", section: "Skafferi", location: "Skafferi", default_unit: "förp" },
      ],
      { onConflict: "household_id,normalized_name" },
    )
    .select("id, name");
  if (catalog.error) throw catalog.error;
  // Story 10.4: the catalog stores the name with a capital, so it is found normalised.
  const id = (name: string) =>
    catalog.data.find((row) => normalizeIngredientText(row.name) === normalizeIngredientText(name))!.id;
  const inserted = await admin.from("pantry_item").insert([
    { user_id: userId, ingredient_id: id("Mjölk"), location: "Kyl", amount: 2, unit: "förp" },
    { user_id: userId, ingredient_id: id("Smör"), location: "Kyl", amount: null, unit: null },
    { user_id: userId, ingredient_id: id("Ägg"), location: "Kyl", amount: 6, unit: "st" },
    { user_id: userId, ingredient_id: id("Yoghurt"), location: "Kyl", amount: 2, unit: "förp" },
    { user_id: userId, ingredient_id: id("Senap"), location: "Kyl", amount: null, unit: null },
  ]);
  if (inserted.error) throw inserted.error;
});

type Row = { id: string; name: string; location: string; amount: number | null; unit: string | null };

/** The user's pantry rows with their catalog names, as the database has them, by name and unit. */
async function pantry(): Promise<Row[]> {
  const admin = adminClient();
  const ingredients = await admin.from("ingredient").select("id, name").eq("user_id", userId);
  if (ingredients.error) throw ingredients.error;
  const { data, error } = await admin.from("pantry_item").select("id, ingredient_id, location, amount, unit").eq("user_id", userId);
  if (error) throw error;
  const nameOf = (id: string) => ingredients.data.find((row) => row.id === id)?.name ?? "?";
  return data
    .map((row) => ({
      id: row.id,
      name: nameOf(row.ingredient_id),
      location: row.location,
      amount: row.amount === null ? null : Number(row.amount),
      unit: row.unit,
    }))
    .sort((a, b) => `${a.name} ${a.unit}`.localeCompare(`${b.name} ${b.unit}`, "sv"));
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
const camera = (page: Page) => page.getByTestId("pantry-camera").filter({ visible: true });
const section = (page: Page) => page.getByTestId("pantry-suggestions").filter({ visible: true });
const placeCard = (page: Page, name: "Kyl" | "Frys") =>
  page.getByRole("navigation", { name: "Platser" }).getByRole("link", { name: new RegExp(`^${name}`) });
// Story 11.3: one row per item, with or without an amount, and no amount shown; pantry() reads the amounts.
const rows = (page: Page) => page.getByTestId("pantry-row").filter({ visible: true });
/** The visible rows' names, in the list's order. */
const rowNames = (page: Page) => rows(page).evaluateAll((targets) => targets.map((target) => target.firstElementChild?.textContent));
const toast = (page: Page) => page.getByTestId("toast");
/** Kylfoto D: the names under the folded "Syns inte längre", shown or not. */
const missingNames = (page: Page) => section(page).getByTestId("pantry-missing").locator("h4");
/** Kylfoto D: unfolds "Syns inte längre (N)". */
async function openMissing(page: Page) {
  const toggle = section(page).getByTestId("pantry-missing-toggle");
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
}

async function photograph(page: Page, button: string) {
  const chooser = page.waitForEvent("filechooser");
  await camera(page).getByRole("button", { name: button }).click();
  await (await chooser).setFiles(kyl);
}

async function photographFridge(page: Page) {
  await page.goto("/hemma");
  await expect(placeCard(page, "Kyl")).toHaveText(/^\S*Kyl\s*5 varor(\s?Förslag klara)?$/);
  await photograph(page, "Fotografera kylen");
  await expect(section(page).getByRole("heading", { level: 2, name: "Lagerförslag från kylen" })).toBeVisible();
}

test("a photo of the fridge is grouped against what it has, and nothing is changed", async ({ page }) => {
  const errors = watchErrors(page);
  const before = await pantry();
  await photographFridge(page);

  await expect(section(page).getByText("2 varor stämmer med matvarorna.")).toBeVisible();
  // Kylfoto D: new and changed are one list of rows; Story 6.5: the titles are the labels on the packages.
  await expect(section(page).getByTestId("pantry-suggestion").getByRole("heading", { level: 3 })).toHaveText(
    cardTitles(["Vispgrädde 3 dl", "Gurka", "Ketchup", "Mellanmjölk 1,5 %"]),
  );
  await expect(section(page).getByTestId("pantry-suggestion").filter({ hasText: "Mjölk" })).toContainText(
    "finns redan 2 förp",
  );
  await expect(section(page).getByTestId("pantry-suggestions-summary")).toHaveText("3 nya · 1 uppdateras");
  // Kylfoto D: one folded row; unfolded, each item has an empty tick box (nothing goes without a tick).
  const toggle = section(page).getByRole("button", { name: "Syns inte längre (2)" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(section(page).getByTestId("pantry-missing").first()).toBeHidden();
  await toggle.click();
  await expect(missingNames(page)).toHaveText(["Senap", "Yoghurt"]);
  const missing = section(page).getByTestId("pantry-missing");
  await expect(missing.filter({ hasText: "Senap" })).toContainText("I kylen nu: finns hemma");
  await expect(missing.filter({ hasText: "Yoghurt" })).toContainText("I kylen nu: 2 förp");
  for (const name of ["Senap", "Yoghurt"]) {
    const box = section(page).getByRole("checkbox", { name: `Ta bort ${name}`, exact: true });
    await expect(box).toHaveAttribute("aria-checked", "false");
    expect((await box.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  // No cards for smör and ägg, which match the fridge.
  await expect(section(page).getByRole("heading", { name: "Smör" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await pantry()).toEqual(before);
  expect(errors).toEqual([]);
});

test("Lägg till adds and changes the ticked rows in one go, and leaves Syns inte längre that is not ticked", async ({
  page,
}) => {
  const errors = watchErrors(page);
  const before = await pantry();
  const missingBefore = before.filter((row) => row.name === "Senap" || row.name === "Yoghurt");
  await photographFridge(page);

  await section(page).getByRole("button", { name: "Lägg till 4 varor" }).click();
  await expect(toast(page)).toContainText("Kylen är uppdaterad: 3 nya och 1 ändrad.");
  await expect(section(page).getByTestId("pantry-suggestion")).toHaveCount(0);
  await expect(missingNames(page)).toHaveText(["Senap", "Yoghurt"]);
  await expect(placeCard(page, "Kyl")).toHaveText(/^\S*Kyl\s*8 varor(\s?Förslag klara)?$/);
  await expect
    .poll(() => rowNames(page))
    .toEqual(["Gurka", "Grädde", "Mjölk", "Smör", "Yoghurt", "Ägg", "Ketchup", "Senap"]);
  const after = await pantry();
  expect(
    after.filter((row) => row.name !== "Senap" && row.name !== "Yoghurt").map(({ name, amount, unit }) => [name, amount, unit]),
  ).toEqual([
    ["Grädde", 1, "förp"],
    ["Gurka", 2, "st"],
    ["Ketchup", null, null],
    ["Mjölk", 1, "förp"],
    ["Smör", null, null],
    ["Ägg", 6, "st"],
  ]);
  // mjölk is changed in its own row; nothing is removed.
  expect(after.find((row) => row.name === "Mjölk")!.id).toBe(before.find((row) => row.name === "Mjölk")!.id);
  expect(after.filter((row) => row.name === "Senap" || row.name === "Yoghurt")).toEqual(missingBefore);
  expect(errors).toEqual([]);
});

test("a ticked Syns inte längre item goes with Lägg till, and Ångra borttagning puts the row back with the same id", async ({
  page,
}) => {
  const errors = watchErrors(page);
  const yoghurt = (await pantry()).find((row) => row.name === "Yoghurt")!;
  await photographFridge(page);

  await openMissing(page);
  await section(page).getByRole("checkbox", { name: "Ta bort Yoghurt", exact: true }).click();
  await expect(section(page).getByTestId("pantry-suggestions-summary")).toHaveText("3 nya · 1 uppdateras · 1 tas bort");
  await section(page).getByRole("button", { name: "Lägg till 4 · ta bort 1" }).click();
  await expect(toast(page)).toContainText("Kylen är uppdaterad: 3 nya, 1 ändrad och 1 borttagen.");
  await expect(missingNames(page)).toHaveText(["Senap"]);
  await expect(placeCard(page, "Kyl")).toHaveText(/^\S*Kyl\s*7 varor(\s?Förslag klara)?$/);
  expect((await pantry()).some((row) => row.name === "Yoghurt")).toBe(false);

  await toast(page).getByRole("button", { name: "Ångra borttagning" }).click();
  await expect(placeCard(page, "Kyl")).toHaveText(/^\S*Kyl\s*8 varor(\s?Förslag klara)?$/);
  await expect(rows(page).filter({ hasText: /^Yoghurt(?:\s|$)/ })).toHaveCount(1);
  await expect.poll(async () => (await pantry()).find((row) => row.name === "Yoghurt")).toEqual(yoghurt);
  expect(errors).toEqual([]);
});

test("a photo of the empty freezer gives the plain list, without groups", async ({ page }) => {
  await page.goto("/hemma?plats=frys");
  await expect(placeCard(page, "Frys")).toHaveText(/^\S*Frys\s*0 varor(\s?Förslag klara)?$/);
  await photograph(page, "Fotografera frysen");
  await expect(section(page).getByRole("heading", { level: 2, name: "Lagerförslag från frysen" })).toBeVisible();
  await expect(section(page).getByTestId("pantry-suggestion").getByRole("heading", { level: 3 })).toHaveText(cardTitles([
    "Vispgrädde 3 dl",
    "Gurka",
    "Ketchup",
    "Mellanmjölk 1,5 %",
    "Smör 500 g",
    "Ägg",
  ]));
  await expect(section(page).getByRole("heading", { name: "Nytt" })).toHaveCount(0);
  await expect(section(page).getByTestId("pantry-missing")).toHaveCount(0);
  await expect(section(page).getByText(/stämmer med matvarorna/)).toHaveCount(0);
});
