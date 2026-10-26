import { expect, type Page, test } from "@playwright/test";
import { adminClient, cardTitles, e2eUserId, inventoryEmail, inventoryStorageState } from "./support";

// Story 6.4: a photo of a place that already has items is compared with it,
// with AI_PROVIDER=mock: kyl.png gives grädde, gurka, ketchup, mjölk 1 förp,
// smör and ägg 6 st (kyl.analyze.json). The spec has an E2E user of its own
// (inventoryEmail): before each test the service role empties its pantry and
// makes the catalog ingredients "mjölk", "smör", "ägg" (st), "yoghurt" and
// "senap", and "grädde", "gurka" and "ketchup" (so no item of the photo is a
// new catalog ingredient and the comparison is complete), and the pantry
// items "mjölk 2 förp", "smör" (unlimited), "ägg 6 st", "yoghurt 2 förp" and
// "senap" (unlimited) in Kyl. Frys is empty. The tests run in order, since
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
        { user_id: userId, name: "mjölk", normalized_name: "mjölk", section: "Mejeri", location: "Kyl", default_unit: "förp" },
        { user_id: userId, name: "smör", normalized_name: "smör", section: "Mejeri", location: "Kyl", default_unit: "förp" },
        { user_id: userId, name: "ägg", normalized_name: "ägg", section: "Mejeri", location: "Kyl", default_unit: "st" },
        { user_id: userId, name: "yoghurt", normalized_name: "yoghurt", section: "Mejeri", location: "Kyl", default_unit: "förp" },
        { user_id: userId, name: "senap", normalized_name: "senap", section: "Skafferi", location: "Kyl", default_unit: "förp" },
        // In the catalog but not at home, so the photo has no new catalog ingredient and the comparison is complete.
        { user_id: userId, name: "grädde", normalized_name: "grädde", section: "Mejeri", location: "Kyl", default_unit: "förp" },
        { user_id: userId, name: "gurka", normalized_name: "gurka", section: "Frukt och grönt", location: "Kyl", default_unit: "st" },
        { user_id: userId, name: "ketchup", normalized_name: "ketchup", section: "Skafferi", location: "Skafferi", default_unit: "förp" },
      ],
      { onConflict: "user_id,normalized_name" },
    )
    .select("id, name");
  if (catalog.error) throw catalog.error;
  const id = (name: string) => catalog.data.find((row) => row.name === name)!.id;
  const inserted = await admin.from("pantry_item").insert([
    { user_id: userId, ingredient_id: id("mjölk"), location: "Kyl", amount: 2, unit: "förp" },
    { user_id: userId, ingredient_id: id("smör"), location: "Kyl", amount: null, unit: null },
    { user_id: userId, ingredient_id: id("ägg"), location: "Kyl", amount: 6, unit: "st" },
    { user_id: userId, ingredient_id: id("yoghurt"), location: "Kyl", amount: 2, unit: "förp" },
    { user_id: userId, ingredient_id: id("senap"), location: "Kyl", amount: null, unit: null },
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
const rows = (page: Page) => page.getByTestId("pantry-row").filter({ visible: true });
const tags = (page: Page) => page.getByTestId("pantry-tag").filter({ visible: true });
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
  await expect(group(page, "Nytt")).toHaveText(cardTitles(["Vispgrädde 3 dl", "gurka", "ketchup"]));
  await expect(group(page, "Ändrat")).toHaveText(cardTitles(["Mellanmjölk 1,5 %"]));
  await expect(section(page).getByText("nu: 2 förp → bilden: 1 förp")).toBeVisible();
  await expect(group(page, "Syns inte längre")).toHaveText(["senap", "yoghurt"]);
  const missing = section(page).getByTestId("pantry-missing");
  await expect(missing.filter({ hasText: "senap" })).toContainText("I kylen nu: finns hemma");
  await expect(missing.filter({ hasText: "yoghurt" })).toContainText("I kylen nu: 2 förp");
  for (const name of ["senap", "yoghurt"]) {
    for (const verb of ["Ta bort", "Behåll"]) {
      const button = section(page).getByRole("button", { name: `${verb} ${name}`, exact: true });
      await expect(button).toBeVisible();
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  }
  // No cards for smör and ägg, which match the fridge.
  await expect(section(page).getByRole("heading", { name: "smör" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await pantry()).toEqual(before);
  expect(errors).toEqual([]);
});

test("Behåll takes a card out without writing, and Ångra puts it back", async ({ page }) => {
  const before = await pantry();
  await photographFridge(page);
  await section(page).getByRole("button", { name: "Behåll senap" }).click();
  await expect(toast(page)).toContainText("senap står kvar i kylen.");
  await expect(group(page, "Syns inte längre")).toHaveText(["yoghurt"]);
  await toast(page).getByRole("button", { name: "Ångra" }).click();
  await expect(group(page, "Syns inte längre")).toHaveText(["senap", "yoghurt"]);
  await expect(section(page).getByRole("button", { name: "Ta bort senap" })).toBeFocused();
  expect(await pantry()).toEqual(before);
});

test("Bekräfta alla adds, changes and removes in one go, and Ångra puts back the removed rows with their ids", async ({
  page,
}) => {
  const errors = watchErrors(page);
  const before = await pantry();
  const removedBefore = before.filter((row) => row.name === "senap" || row.name === "yoghurt");
  await photographFridge(page);

  await section(page).getByRole("button", { name: "Bekräfta alla" }).click();
  await expect(toast(page)).toContainText("Kylen är uppdaterad: 3 nya, 1 ändrad och 2 borttagna.");
  await expect(section(page)).toHaveCount(0);
  await expect(camera(page).getByRole("button", { name: "Fotografera kylen" })).toBeFocused();
  await expect(placeCard(page, "Kyl")).toHaveText(/^Kyl\s*6 varor$/);
  await expect(rows(page).filter({ hasText: "mjölk" })).toHaveText([/^mjölk\s*1 förp$/]);
  await expect(page.getByText("yoghurt").filter({ visible: true })).toHaveCount(0);
  await expect(tags(page)).toHaveText(["ketchup", "smör"]);
  const after = await pantry();
  expect(after.map(({ name, amount, unit }) => [name, amount, unit])).toEqual([
    ["grädde", 1, "förp"],
    ["gurka", 2, "st"],
    ["ketchup", null, null],
    ["mjölk", 1, "förp"],
    ["smör", null, null],
    ["ägg", 6, "st"],
  ]);
  // mjölk is changed in its own row.
  expect(after.find((row) => row.name === "mjölk")!.id).toBe(before.find((row) => row.name === "mjölk")!.id);

  // The undo puts back the removals only, and says so.
  await toast(page).getByRole("button", { name: "Ångra borttagning" }).click();
  await expect(placeCard(page, "Kyl")).toHaveText(/^Kyl\s*8 varor$/);
  await expect(group(page, "Syns inte längre")).toHaveText(["senap", "yoghurt"]);
  await expect(tags(page)).toHaveText(["ketchup", "senap", "smör"]);
  await expect(rows(page).filter({ hasText: "yoghurt" })).toHaveText([/^yoghurt\s*2 förp$/]);
  await expect(rows(page).filter({ hasText: "mjölk" })).toHaveText([/^mjölk\s*1 förp$/]);
  await expect
    .poll(async () => (await pantry()).filter((row) => row.name === "senap" || row.name === "yoghurt"))
    .toEqual(removedBefore);
  expect(errors).toEqual([]);
});

test("Ta bort removes one item at once, and Ångra puts the row back with the same id", async ({ page }) => {
  const errors = watchErrors(page);
  const yoghurt = (await pantry()).find((row) => row.name === "yoghurt")!;
  await photographFridge(page);

  await section(page).getByRole("button", { name: "Ta bort yoghurt" }).click();
  await expect(toast(page)).toContainText("yoghurt är borttagen.");
  await expect(group(page, "Syns inte längre")).toHaveText(["senap"]);
  await expect(placeCard(page, "Kyl")).toHaveText(/^Kyl\s*4 varor$/);
  expect((await pantry()).some((row) => row.name === "yoghurt")).toBe(false);

  await toast(page).getByRole("button", { name: "Ångra" }).click();
  await expect(placeCard(page, "Kyl")).toHaveText(/^Kyl\s*5 varor$/);
  await expect(rows(page).filter({ hasText: "yoghurt" })).toHaveText([/^yoghurt\s*2 förp$/]);
  // The card is back too, while the suggestions are the same.
  await expect(group(page, "Syns inte längre")).toHaveText(["senap", "yoghurt"]);
  await expect.poll(async () => (await pantry()).find((row) => row.name === "yoghurt")).toEqual(yoghurt);
  expect(errors).toEqual([]);
});

test("a photo of the empty freezer gives the plain list, without groups", async ({ page }) => {
  await page.goto("/hemma?plats=frys");
  await expect(placeCard(page, "Frys")).toHaveText(/^Frys\s*0 varor$/);
  await photograph(page, "Fotografera frysen");
  await expect(section(page).getByRole("heading", { level: 2, name: "Lagerförslag från frysen" })).toBeVisible();
  await expect(section(page).getByTestId("pantry-suggestion").getByRole("heading", { level: 3 })).toHaveText(cardTitles([
    "Vispgrädde 3 dl",
    "gurka",
    "ketchup",
    "Mellanmjölk 1,5 %",
    "Smör 500 g",
    "ägg",
  ]));
  await expect(section(page).getByRole("heading", { name: "Nytt" })).toHaveCount(0);
  await expect(section(page).getByTestId("pantry-missing")).toHaveCount(0);
  await expect(section(page).getByText(/stämmer med lagret/)).toHaveCount(0);
});
