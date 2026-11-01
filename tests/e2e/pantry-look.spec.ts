import { expect, type Page, test } from "@playwright/test";
import { adminClient, e2eUserId, pantryLookEmail, pickBoende, pantryLookStorageState, expectUnit } from "./support";

// Story 11.3 (FR-40, FR-41): Matvaror in the new look at 375 px. The spec
// has an E2E user of its own (pantryLookEmail). Before each test the service
// role removes the user's pantry items and places, adds Hemma (selected) and
// the places the test needs, and seeds the fridge of the spec's matrix with
// brands and times relative to now. The tests run in order, since they share
// the user. Names are matched as the catalog stores them, with a capital
// first letter (Story 10.4).

test.use({ storageState: pantryLookStorageState, viewport: { width: 375, height: 812 } });
test.describe.configure({ mode: "serial" });

/**
 * Noon in Stockholm `days` calendar days back (11:00 UTC is 12:00 or 13:00
 * there), so the day holds whatever the time of the run and over the change
 * to summer or winter time. Today's noon, if it has not come yet, is now.
 */
function stockholmNoon(days: number): string {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Stockholm" })
    .format(new Date())
    .split("-")
    .map(Number);
  const noon = new Date(Date.UTC(year, month - 1, day - days, 11, 0));
  return (noon.getTime() > Date.now() ? new Date() : noon).toISOString();
}

type Seed = {
  name: string;
  section: string;
  amount: number | null;
  unit: string | null;
  label: string | null;
  days: number;
};

/** The fridge in the spec's matrix. */
const fridge: Seed[] = [
  { name: "Mellanmjölk", section: "Mejeri", amount: 1, unit: "l", label: "Arla laktosfri", days: 3 },
  { name: "Gräddfil", section: "Mejeri", amount: 3, unit: "dl", label: null, days: 6 },
  { name: "Ägg", section: "Mejeri", amount: 6, unit: "st", label: null, days: 0 },
  { name: "Kycklingfilé", section: "Kött och fisk", amount: 500, unit: "g", label: null, days: 1 },
  { name: "Senap", section: "Skafferi", amount: null, unit: null, label: "Johnny's", days: 10 },
  { name: "Gurka", section: "Frukt och grönt", amount: 1, unit: "st", label: null, days: 24 },
];

let userId = "";
test.beforeAll(async () => {
  userId = await e2eUserId(pantryLookEmail);
});

/**
 * Leaves the user with `places` (the first selected) and `items` in the
 * first one's fridge; returns the places' ids by name and the items' ids.
 */
async function reset(places: string[], items: Seed[]): Promise<{ sites: Record<string, string>; ids: Record<string, string> }> {
  const admin = adminClient();
  const removedItems = await admin.from("pantry_item").delete().eq("user_id", userId);
  if (removedItems.error) throw removedItems.error;
  const removedSites = await admin.from("pantry_site").delete().eq("user_id", userId);
  if (removedSites.error) throw removedSites.error;
  const start = Date.now();
  const added = await admin
    .from("pantry_site")
    .insert(
      places.map((name, index) => ({
        user_id: userId,
        name,
        normalized_name: name.toLocaleLowerCase("sv"),
        is_selected: index === 0,
        created_at: new Date(start + index).toISOString(),
      })),
    )
    .select("id, name");
  if (added.error) throw added.error;
  const sites = Object.fromEntries((added.data as { id: string; name: string }[]).map((site) => [site.name, site.id]));
  if (items.length === 0) return { sites, ids: {} };

  const catalog = await admin
    .from("ingredient")
    .upsert(
      items.map((item) => ({
        user_id: userId,
        name: item.name,
        normalized_name: item.name.toLocaleLowerCase("sv"),
        section: item.section,
        location: "Kyl",
        default_unit: item.unit ?? "st",
      })),
      { onConflict: "user_id,normalized_name" },
    )
    .select("id, name");
  if (catalog.error) throw catalog.error;
  const ingredients = new Map((catalog.data as { id: string; name: string }[]).map((row) => [row.name, row.id]));
  const inserted = await admin
    .from("pantry_item")
    .insert(
      items.map((item) => ({
        user_id: userId,
        site_id: sites[places[0]],
        ingredient_id: ingredients.get(item.name),
        location: "Kyl",
        amount: item.amount,
        unit: item.unit,
        label: item.label,
        created_at: stockholmNoon(item.days),
      })),
    )
    .select("id, ingredient_id");
  if (inserted.error) throw inserted.error;
  const names = new Map([...ingredients].map(([name, id]) => [id, name]));
  const ids = Object.fromEntries(
    (inserted.data as { id: string; ingredient_id: string }[]).map((row) => [names.get(row.ingredient_id)!, row.id]),
  );
  return { sites, ids };
}

/** The user's pantry rows by id, with their brand and time. */
async function stored(): Promise<Map<string, { label: string | null; created_at: string }>> {
  const { data, error } = await adminClient().from("pantry_item").select("id, label, created_at").eq("user_id", userId);
  if (error) throw error;
  return new Map(data.map((row) => [row.id, { label: row.label, created_at: row.created_at }]));
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
const categories = (page: Page) => page.getByTestId("pantry-category").filter({ visible: true });
const rows = (page: Page) => page.getByTestId("pantry-row").filter({ visible: true });
const row = (page: Page, name: string) => rows(page).filter({ hasText: new RegExp(`^${name}`) });
const bin = (page: Page, name: string) => page.getByRole("button", { name: `Ta bort ${name}`, exact: true }).filter({ visible: true });

/** Removes a row with its swipe action, reached from the keyboard (Story 14.6): no question, "Ångra" follows. */
async function pressBin(page: Page, name: string) {
  await bin(page, name).focus();
  await page.keyboard.press("Enter");
}
const search = (page: Page, place = "kylen") => page.getByRole("searchbox", { name: `Sök i ${place}` }).filter({ visible: true });
const toast = (page: Page) => page.getByTestId("toast");
const mainMenu = (page: Page) => page.getByRole("navigation", { name: "Huvudmeny" });
const places = (page: Page) => page.getByRole("navigation", { name: "Platser" }).filter({ visible: true });

/** Each visible category's heading and count, with its rows as "name | line under". */
async function shownCategories(page: Page): Promise<[string, string, string[]][]> {
  return categories(page).evaluateAll((elements) =>
    elements.map((element) => [
      element.querySelector("h2")?.textContent ?? "",
      element.querySelector(".tabular-nums [aria-hidden='true']")?.textContent ?? "",
      [...element.querySelectorAll("[data-testid='pantry-row']")].map((target) =>
        [...target.children].map((line) => line.textContent).join(" | "),
      ),
    ]),
  );
}

/** Lets the bins' double-tap guard (400 ms) pass, as between two real taps. */
const pastGuard = (page: Page) => page.waitForTimeout(450);

test("the fridge shows its items under categories in the store's order, with the brand, the amount at the right and the old label", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await reset(["Hemma"], fridge);
  await page.goto("/hemma");

  await expect(categories(page)).toHaveCount(4);
  const shown = await shownCategories(page);
  expect(shown.map(([heading, count]) => [heading, count])).toEqual([
    ["Frukt & grönt", "1"],
    ["Mejeri & ägg", "3"],
    ["Kött, fisk & chark", "1"],
    ["Såser & smaksättare", "1"],
  ]);
  expect(shown[0][2]).toEqual(["Gurka"]);
  expect(shown[1][2]).toEqual(["Gräddfil", "Mellanmjölk | Arla laktosfri", "Ägg"]);
  expect(shown[2][2]).toEqual(["Kycklingfilé"]);
  expect(shown[3][2]).toEqual(["Senap | Johnny's"]);

  // Headings for VoiceOver's rotor, with the count read as words.
  await expect(page.getByRole("heading", { level: 2, name: "Mejeri & ägg" })).toHaveAccessibleDescription("3 varor");
  await expect(page.getByRole("button", { name: "Mellanmjölk Arla laktosfri" })).toBeVisible();

  // The amount stands to the right of the name (Story 14.6); no "Tillagd", "Med mängd" or "Finns hemma"; the cards count the whole fridge.
  const listText = (await categories(page).allInnerTexts()).join("\n");
  expect(listText).toMatch(/Mellanmjölk[\s\S]*1 l/);
  expect(listText).not.toMatch(/Tillagd|Med mängd|Finns hemma/);
  // Gurka was added 24 days ago, in Kyl: past the limit of 7 days, so it has the label; Gräddfil (6 days) has none.
  await expect(page.getByTestId("pantry-old").filter({ visible: true })).toHaveText(["24 dagar", "10 dagar"]);
  await expect(places(page).getByRole("link", { name: /^Kyl/ })).toContainText("6 varor");

  // A swipe action of 44 px at least, rows of at least 56 px, and no sideways scroll at 375 px.
  const binBox = await bin(page, "Gräddfil").boundingBox();
  expect(binBox?.width).toBeGreaterThanOrEqual(44);
  expect(binBox?.height).toBeGreaterThanOrEqual(44);
  const rowBox = await row(page, "Gräddfil").boundingBox();
  expect(rowBox?.height).toBeGreaterThanOrEqual(56);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // A tap on the row opens the sheet Lagervara, where the amount still is.
  await row(page, "Mellanmjölk").click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByLabel("Mängd")).toHaveValue("1");
  await expectUnit(sheet, "l");
  await expect(sheet.getByRole("textbox", { name: "Märke eller sort" })).toHaveValue("Arla laktosfri");
  await sheet.getByRole("button", { name: "Avbryt" }).click();
  await expect(sheet).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the bin removes at once, focus goes to the next bin, and Ångra brings the item back with the same line under it", async ({
  page,
}) => {
  const errors = watchErrors(page);
  const { ids } = await reset(["Hemma"], fridge);
  const before = (await stored()).get(ids["Gräddfil"]);
  await page.goto("/hemma");

  await pressBin(page, "Gräddfil");
  await expect(row(page, "Gräddfil")).toHaveCount(0);
  await expect(row(page, "Mellanmjölk")).toBeFocused();
  await expect(toast(page)).toContainText("Tog bort Gräddfil.");
  await expect.poll(async () => (await stored()).has(ids["Gräddfil"])).toBe(false);

  await toast(page).getByRole("button", { name: "Ångra" }).click();
  await expect(row(page, "Gräddfil")).toHaveText(/^Gräddfil$/);
  await expect.poll(async () => (await stored()).get(ids["Gräddfil"])).toEqual(before);
  expect(errors).toEqual([]);
});

test("a second removal joins the confirmation, and one Ångra puts back both", async ({ page }) => {
  const errors = watchErrors(page);
  const { ids } = await reset(["Hemma"], fridge);
  const before = await stored();
  await page.goto("/hemma");

  await pressBin(page, "Gräddfil");
  await expect(toast(page)).toContainText("Tog bort Gräddfil.");
  await pastGuard(page);
  await pressBin(page, "Ägg");
  await expect(toast(page)).toHaveCount(1);
  await expect(toast(page)).toContainText("Tog bort Gräddfil och Ägg.");
  await expect.poll(async () => (await stored()).has(ids["Ägg"])).toBe(false);
  await toast(page).getByRole("button", { name: "Ångra" }).click();
  await expect(row(page, "Ägg")).toHaveCount(1);
  await expect(row(page, "Gräddfil")).toHaveText(/^Gräddfil$/);
  await expect.poll(async () => (await stored()).get(ids["Gräddfil"])).toEqual(before.get(ids["Gräddfil"]));
  await expect.poll(async () => (await stored()).has(ids["Ägg"])).toBe(true);
  expect(errors).toEqual([]);
});

test("the last item's bin leaves the empty fridge with focus on Lägg till vara", async ({ page }) => {
  await reset(["Hemma"], [fridge[1]]);
  await page.goto("/hemma");
  await pressBin(page, "Gräddfil");
  await expect(page.getByText("Inget i kylen än.")).toBeVisible();
  await expect(search(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Lägg till vara", exact: true }).filter({ hasText: "Lägg till vara" })).toBeFocused();
});

test("Sök i kylen filters on name and brand, says when nothing matches, and stays over a change of tab", async ({ page }) => {
  const errors = watchErrors(page);
  await reset(["Hemma"], fridge);
  await page.goto("/hemma");

  const field = search(page);
  await expect(field).toHaveAttribute("placeholder", "Sök i kylen");
  expect(await field.evaluate((input) => Number.parseFloat(getComputedStyle(input).fontSize))).toBeGreaterThanOrEqual(16);
  await expect(page.getByRole("button", { name: "Töm kylen" }).filter({ visible: true })).toBeVisible();
  await field.fill("mjö");
  expect(await shownCategories(page)).toEqual([["Mejeri & ägg", "1", ["Mellanmjölk | Arla laktosfri"]]]);
  // The card counts the whole fridge, not the matches, and Töm kylen hides while only matches show.
  await expect(places(page).getByRole("link", { name: /^Kyl/ })).toContainText("6 varor");
  await expect(page.getByRole("button", { name: "Töm kylen" }).filter({ visible: true })).toHaveCount(0);
  // Screen readers hear how many match, once the search has rested.
  await expect(page.getByTestId("pantry-search-status").filter({ visible: true })).toHaveText("1 träff");

  // Each word against the name and the brand, without regard to marks or curly apostrophes.
  await field.fill("mjölk arla");
  await expect(rows(page)).toHaveCount(1);
  await field.fill("johnny\u2019s");
  await expect(rows(page)).toHaveCount(1);

  await field.fill("johnny");
  expect(await shownCategories(page)).toEqual([["Såser & smaksättare", "1", ["Senap | Johnny's"]]]);

  await field.fill("xyz");
  await expect(page.locator("p").filter({ hasText: "Inget i kylen matchar." })).toBeVisible();
  await expect(categories(page)).toHaveCount(0);
  // One control by that name: the field's cross is left out.
  await expect(page.getByRole("button", { name: "Rensa sökning" })).toHaveCount(1);
  await page.getByRole("button", { name: "Rensa sökning" }).click();
  await expect(field).toHaveValue("");
  await expect(field).toBeFocused();
  await expect(categories(page)).toHaveCount(4);

  // Another tab and back: the search and its matches are still there (React Activity).
  await field.fill("mjö");
  await mainMenu(page).getByRole("link", { name: "Recept" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Recept" })).toBeVisible();
  await mainMenu(page).getByRole("link", { name: "Matvaror" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Matvaror" })).toBeVisible();
  await expect(search(page)).toHaveValue("mjö");
  await expect(rows(page)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("the search empties when another location or place is chosen, and an empty place has no search field", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await reset(["Hemma", "Stugan"], fridge);
  await page.goto("/hemma");

  await search(page).fill("mjö");
  await expect(rows(page)).toHaveCount(1);
  await places(page).getByRole("link", { name: /^Frys/ }).click();
  await expect(page.getByText("Inget i frysen än.")).toBeVisible();
  await expect(search(page, "frysen")).toHaveCount(0);
  await places(page).getByRole("link", { name: /^Kyl/ }).click();
  await expect(search(page)).toHaveValue("");
  await expect(rows(page)).toHaveCount(6);

  await search(page).fill("mjö");
  await pickBoende(page, "Stugan");
  await expect(page.getByText("Inget i kylen än.")).toBeVisible();
  await pickBoende(page, "Hemma");
  await expect(search(page)).toHaveValue("");
  await expect(rows(page)).toHaveCount(6);
  expect(errors).toEqual([]);
});
