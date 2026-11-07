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
// "Senap" (unlimited) in Kyl, all added ten days ago (UX-08: items from the last 3 days are never "syntes inte"). Frys is empty. The tests run in order, since
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
  const added = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const inserted = await admin.from("pantry_item").insert([
    { user_id: userId, ingredient_id: id("Mjölk"), location: "Kyl", amount: 2, unit: "förp", created_at: added },
    { user_id: userId, ingredient_id: id("Smör"), location: "Kyl", amount: null, unit: null, created_at: added },
    { user_id: userId, ingredient_id: id("Ägg"), location: "Kyl", amount: 6, unit: "st", created_at: added },
    { user_id: userId, ingredient_id: id("Yoghurt"), location: "Kyl", amount: 2, unit: "förp", created_at: added },
    { user_id: userId, ingredient_id: id("Senap"), location: "Kyl", amount: null, unit: null, created_at: added },
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
/** UX-08: the card after a photo, "2 varor syntes inte på fotot. Ta bort dem?". */
const notSeen = (page: Page) => page.getByTestId("pantry-not-seen").filter({ visible: true });

async function photograph(page: Page, button: string) {
  const chooser = page.waitForEvent("filechooser");
  await camera(page).getByRole("button", { name: button }).click();
  await (await chooser).setFiles(kyl);
}

async function photographFridge(page: Page) {
  await page.goto("/hemma");
  await expect(placeCard(page, "Kyl")).toHaveText(/^\S*Kyl\s*5 varor$/);
  await photograph(page, "Fota");
  await expect(section(page).getByRole("heading", { level: 2, name: "Förslag från fotot av kylen" })).toBeVisible();
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
  // UX-08: no "Syns inte längre" in the review: what the photo did not show is asked about afterwards.
  await expect(section(page).getByTestId("pantry-missing-toggle")).toHaveCount(0);
  await expect(section(page).getByText(/Syns inte längre/)).toHaveCount(0);
  await expect(notSeen(page)).toHaveCount(0);
  // No cards for smör and ägg, which match the fridge.
  await expect(section(page).getByRole("heading", { name: "Smör" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await pantry()).toEqual(before);
  expect(errors).toEqual([]);
});

test("Lägg till closes the review, asks about what the photo did not show, and leaves it alone", async ({
  page,
}) => {
  const errors = watchErrors(page);
  const before = await pantry();
  const missingBefore = before.filter((row) => row.name === "Senap" || row.name === "Yoghurt");
  await photographFridge(page);

  await section(page).getByRole("button", { name: "Lägg till 4 varor" }).click();
  await expect(toast(page)).toContainText("Kylen är uppdaterad: 3 nya och 1 ändrad.");
  await expect(section(page)).toHaveCount(0);
  // UX-08: the card, with the names, and no "Förslag klara" on Kyl.
  await expect(notSeen(page)).toContainText("2 varor syntes inte på fotot. Ta bort dem?");
  await expect(notSeen(page)).toContainText("Senap och Yoghurt");
  await expect(placeCard(page, "Kyl")).toHaveText(/^\S*Kyl\s*8 varor$/);
  await notSeen(page).getByRole("button", { name: "Behåll" }).click();
  await expect(notSeen(page)).toHaveCount(0);
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

test("Välj vilka removes the ticked items, and Ångra puts the row back with the same id", async ({ page }) => {
  const errors = watchErrors(page);
  const yoghurt = (await pantry()).find((row) => row.name === "Yoghurt")!;
  await photographFridge(page);
  await section(page).getByRole("button", { name: "Lägg till 4 varor" }).click();
  await expect(notSeen(page)).toContainText("2 varor syntes inte på fotot");

  await notSeen(page).getByRole("button", { name: "Välj vilka" }).click();
  const sheet = page.getByRole("dialog").filter({ visible: true });
  await expect(sheet.getByRole("checkbox")).toHaveCount(2);
  await expect(sheet.getByRole("button", { name: "Ta bort 0 varor" })).toBeDisabled();
  await sheet.getByRole("checkbox", { name: "Ta bort Yoghurt", exact: true }).click();
  await sheet.getByRole("button", { name: "Ta bort 1 vara" }).click();
  await expect(toast(page).filter({ hasText: "Tog bort Yoghurt." })).toBeVisible();
  await expect(notSeen(page)).toHaveCount(0);
  await expect(placeCard(page, "Kyl")).toHaveText(/^\S*Kyl\s*7 varor$/);
  expect((await pantry()).some((row) => row.name === "Yoghurt")).toBe(false);

  await toast(page).getByRole("button", { name: "Ångra" }).click();
  await expect(placeCard(page, "Kyl")).toHaveText(/^\S*Kyl\s*8 varor$/);
  await expect(rows(page).filter({ hasText: /^Yoghurt(?:\s|$)/ })).toHaveCount(1);
  await expect.poll(async () => (await pantry()).find((row) => row.name === "Yoghurt")).toEqual(yoghurt);
  expect(errors).toEqual([]);
});

test("Ångra after Lägg till takes the new rows out again", async ({ page }) => {
  const errors = watchErrors(page);
  await photographFridge(page);
  await section(page).getByRole("button", { name: "Lägg till 4 varor" }).click();
  await expect(toast(page)).toContainText("Kylen är uppdaterad: 3 nya och 1 ändrad.");
  await expect(placeCard(page, "Kyl")).toHaveText(/^\S*Kyl\s*8 varor$/);
  await toast(page).getByRole("button", { name: "Ångra" }).click();
  await expect(placeCard(page, "Kyl")).toHaveText(/^\S*Kyl\s*5 varor$/);
  const names = (await pantry()).map((row) => row.name);
  expect(names).not.toEqual(expect.arrayContaining(["Grädde"]));
  expect(names).not.toEqual(expect.arrayContaining(["Gurka"]));
  expect(names).not.toEqual(expect.arrayContaining(["Ketchup"]));
  expect(errors).toEqual([]);
});

test("a photo of the empty freezer gives the plain list, without groups", async ({ page }) => {
  await page.goto("/hemma?plats=frys");
  await expect(placeCard(page, "Frys")).toHaveText(/^\S*Frys\s*0 varor$/);
  await photograph(page, "Fota");
  await expect(section(page).getByRole("heading", { level: 2, name: "Förslag från fotot av frysen" })).toBeVisible();
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
