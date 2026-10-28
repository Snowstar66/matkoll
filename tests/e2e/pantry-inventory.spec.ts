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
      { onConflict: "user_id,normalized_name" },
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
/** The cards' names under a group heading ("Nytt", "Ändrat", "Syns inte längre"). */
const group = (page: Page, title: string) =>
  section(page)
    .locator("div")
    .filter({ has: page.getByRole("heading", { level: 3, name: title, exact: true }) })
    .getByRole("heading", { level: 4 });

async function photograph(page: Page, button: string) {
  const chooser = page.waitForEvent("filechooser");
  await camera(page).getByRole("button", { name: button }).click();
  await (await chooser).setFiles(kyl);
}

async function photographFridge(page: Page) {
  await page.goto("/hemma");
  await expect(placeCard(page, "Kyl")).toHaveText(/^Kyl\s*5 varor$/);
  await photograph(page, "Fotografera kylen");
  await expect(section(page).getByRole("heading", { level: 2, name: "Lagerförslag från kylen" })).toBeVisible();
}

test("a photo of the fridge is grouped against what it has, and nothing is changed", async ({ page }) => {
  const errors = watchErrors(page);
  const before = await pantry();
  await photographFridge(page);

  await expect(section(page).getByText("2 varor stämmer med lagret.")).toBeVisible();
  await expect(section(page).getByRole("heading", { level: 3 })).toHaveText(["Nytt", "Ändrat", "Syns inte längre"]);
  // Story 6.5: the titles are the labels on the packages.
  await expect(group(page, "Nytt")).toHaveText(cardTitles(["Vispgrädde 3 dl", "Gurka", "Ketchup"]));
  await expect(group(page, "Ändrat")).toHaveText(cardTitles(["Mellanmjölk 1,5 %"]));
  await expect(section(page).getByText("nu: 2 förp → bilden: 1 förp")).toBeVisible();
  await expect(group(page, "Syns inte längre")).toHaveText(["Senap", "Yoghurt"]);
  const missing = section(page).getByTestId("pantry-missing");
  await expect(missing.filter({ hasText: "Senap" })).toContainText("I kylen nu: finns hemma");
  await expect(missing.filter({ hasText: "Yoghurt" })).toContainText("I kylen nu: 2 förp");
  for (const name of ["Senap", "Yoghurt"]) {
    for (const verb of ["Ta bort", "Behåll"]) {
      const button = section(page).getByRole("button", { name: `${verb} ${name}`, exact: true });
      await expect(button).toBeVisible();
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  }
  // No cards for smör and ägg, which match the fridge.
  await expect(section(page).getByRole("heading", { name: "Smör" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await pantry()).toEqual(before);
  expect(errors).toEqual([]);
});

test("Behåll takes a card out without writing, and Ångra puts it back", async ({ page }) => {
  const before = await pantry();
  await photographFridge(page);
  await section(page).getByRole("button", { name: "Behåll Senap" }).click();
  await expect(toast(page)).toContainText("Senap står kvar i kylen.");
  await expect(group(page, "Syns inte längre")).toHaveText(["Yoghurt"]);
  await toast(page).getByRole("button", { name: "Ångra" }).click();
  await expect(group(page, "Syns inte längre")).toHaveText(["Senap", "Yoghurt"]);
  await expect(section(page).getByRole("button", { name: "Ta bort Senap" })).toBeFocused();
  expect(await pantry()).toEqual(before);
});

test("Bekräfta alla adds, changes and removes in one go, and Ångra puts back the removed rows with their ids", async ({
  page,
}) => {
  const errors = watchErrors(page);
  const before = await pantry();
  const removedBefore = before.filter((row) => row.name === "Senap" || row.name === "Yoghurt");
  await photographFridge(page);

  await section(page).getByRole("button", { name: "Bekräfta alla" }).click();
  await expect(toast(page)).toContainText("Kylen är uppdaterad: 3 nya, 1 ändrad och 2 borttagna.");
  await expect(section(page)).toHaveCount(0);
  await expect(camera(page).getByRole("button", { name: "Fotografera kylen" })).toBeFocused();
  await expect(placeCard(page, "Kyl")).toHaveText(/^Kyl\s*6 varor$/);
  await expect.poll(() => rowNames(page)).toEqual(["Gurka", "Grädde", "Mjölk", "Smör", "Ägg", "Ketchup"]);
  await expect(page.getByText("Yoghurt").filter({ visible: true })).toHaveCount(0);
  const after = await pantry();
  expect(after.map(({ name, amount, unit }) => [name, amount, unit])).toEqual([
    ["Grädde", 1, "förp"],
    ["Gurka", 2, "st"],
    ["Ketchup", null, null],
    ["Mjölk", 1, "förp"],
    ["Smör", null, null],
    ["Ägg", 6, "st"],
  ]);
  // mjölk is changed in its own row.
  expect(after.find((row) => row.name === "Mjölk")!.id).toBe(before.find((row) => row.name === "Mjölk")!.id);

  // The undo puts back the removals only, and says so.
  await toast(page).getByRole("button", { name: "Ångra borttagning" }).click();
  await expect(placeCard(page, "Kyl")).toHaveText(/^Kyl\s*8 varor$/);
  await expect(group(page, "Syns inte längre")).toHaveText(["Senap", "Yoghurt"]);
  await expect
    .poll(() => rowNames(page))
    .toEqual(["Gurka", "Grädde", "Mjölk", "Smör", "Yoghurt", "Ägg", "Ketchup", "Senap"]);
  await expect
    .poll(async () => (await pantry()).filter((row) => row.name === "Senap" || row.name === "Yoghurt"))
    .toEqual(removedBefore);
  expect(errors).toEqual([]);
});

test("Ta bort removes one item at once, and Ångra puts the row back with the same id", async ({ page }) => {
  const errors = watchErrors(page);
  const yoghurt = (await pantry()).find((row) => row.name === "Yoghurt")!;
  await photographFridge(page);

  await section(page).getByRole("button", { name: "Ta bort Yoghurt" }).click();
  await expect(toast(page)).toContainText("Yoghurt är borttagen.");
  await expect(group(page, "Syns inte längre")).toHaveText(["Senap"]);
  await expect(placeCard(page, "Kyl")).toHaveText(/^Kyl\s*4 varor$/);
  expect((await pantry()).some((row) => row.name === "Yoghurt")).toBe(false);

  await toast(page).getByRole("button", { name: "Ångra" }).click();
  await expect(placeCard(page, "Kyl")).toHaveText(/^Kyl\s*5 varor$/);
  await expect(rows(page).filter({ hasText: /^Yoghurt / })).toHaveCount(1);
  // The card is back too, while the suggestions are the same.
  await expect(group(page, "Syns inte längre")).toHaveText(["Senap", "Yoghurt"]);
  await expect.poll(async () => (await pantry()).find((row) => row.name === "Yoghurt")).toEqual(yoghurt);
  expect(errors).toEqual([]);
});

test("a photo of the empty freezer gives the plain list, without groups", async ({ page }) => {
  await page.goto("/hemma?plats=frys");
  await expect(placeCard(page, "Frys")).toHaveText(/^Frys\s*0 varor$/);
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
  await expect(section(page).getByText(/stämmer med lagret/)).toHaveCount(0);
});
