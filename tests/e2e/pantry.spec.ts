import { expect, type Page, type Response, test } from "@playwright/test";
import { adminClient, e2eUserId, pantryEmail, pantryStorageState } from "./support";

// Stories 2.1, 2.2 and 2.3: Hemma with the location cards and the chosen
// location's items, the sheet Lagervara that adds and changes items, and
// removing items with the bin or in the sheet, with "Ångra" (Story 11.3: the
// rows show no amount, and the swipe is gone). The spec has an E2E user of
// its own (pantryEmail), whose catalog ingredients and pantry rows are made
// with the service role before each test: 3 items in Kyl (two with an
// amount, Salt unlimited), 1 in Frys and none in Skafferi. The tests run in
// order, since they share the user.

const mobile = { width: 375, height: 812 };
const desktop = { width: 1280, height: 800 };

const ingredients = [
  { name: "Mjölk", section: "Mejeri", location: "Kyl", defaultUnit: null },
  { name: "Smör", section: "Mejeri", location: "Kyl", defaultUnit: "g" },
  { name: "Salt", section: "Skafferi", location: "Skafferi", defaultUnit: null },
  { name: "Ärtor", section: "Frys", location: "Frys", defaultUnit: null },
] as const;
type Name = (typeof ingredients)[number]["name"];

const items: { name: Name; location: string; amount?: number; unit?: string }[] = [
  { name: "Mjölk", location: "Kyl", amount: 1, unit: "l" },
  { name: "Smör", location: "Kyl", amount: 250, unit: "g" },
  { name: "Salt", location: "Kyl" },
  { name: "Ärtor", location: "Frys", amount: 500, unit: "g" },
];

/** Sets the user's pantry to `items`, with the service role. Catalog ingredients are never deleted, so they are upserted. */
async function seedPantry(userId: string) {
  const admin = adminClient();
  const catalog = await admin
    .from("ingredient")
    .upsert(
      ingredients.map((ingredient) => ({
        user_id: userId,
        name: ingredient.name,
        normalized_name: ingredient.name.toLocaleLowerCase("sv-SE"),
        section: ingredient.section,
        location: ingredient.location,
        default_unit: ingredient.defaultUnit,
      })),
      { onConflict: "user_id,normalized_name" },
    )
    .select("id, name");
  if (catalog.error) throw catalog.error;
  const ids = new Map((catalog.data as { id: string; name: string }[]).map((row) => [row.name, row.id]));

  const removed = await admin.from("pantry_item").delete().eq("user_id", userId);
  if (removed.error) throw removed.error;
  const inserted = await admin.from("pantry_item").insert(
    items.map((item) => ({
      user_id: userId,
      ingredient_id: ids.get(item.name),
      location: item.location,
      amount: item.amount ?? null,
      unit: item.unit ?? null,
    })),
  );
  if (inserted.error) throw inserted.error;
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
const places = (page: Page) => page.getByRole("navigation", { name: "Platser" });
const card = (page: Page, name: "Kyl" | "Frys" | "Skafferi") => places(page).getByRole("link", { name: new RegExp(`^${name}`) });
const rows = (page: Page) => page.getByTestId("pantry-row").filter({ visible: true });
const heading = (page: Page, name: string) => page.getByRole("heading", { level: 2, name });
/** A row added today, as Matvaror shows it (Story 14.6): the name alone, without "Tillagd …". */
const today = (name: string) => new RegExp(`^${name}$`);

async function expectChosen(page: Page, name: "Kyl" | "Frys" | "Skafferi") {
  for (const other of ["Kyl", "Frys", "Skafferi"] as const) {
    if (other === name) await expect(card(page, other)).toHaveAttribute("aria-current", "true");
    else await expect(card(page, other)).not.toHaveAttribute("aria-current");
  }
}

test.use({ storageState: pantryStorageState });
test.describe.configure({ mode: "serial" });

let userId: string;
test.beforeAll(async () => {
  userId = await e2eUserId(pantryEmail);
});
test.beforeEach(async () => {
  await seedPantry(userId);
});

test.describe("on a phone", () => {
  test.use({ viewport: mobile });

  test("shows the three location cards with counts, and Kyl's items under their categories", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/hemma");
    await expect(page.getByRole("heading", { level: 1, name: "Matvaror" })).toBeVisible();

    await expect(card(page, "Kyl")).toHaveText(/^\S*Kyl\s*3 varor$/);
    await expect(card(page, "Frys")).toHaveText(/^\S*Frys\s*1 vara$/);
    await expect(card(page, "Skafferi")).toHaveText(/^\S*Skafferi\s*0 varor$/);
    await expectChosen(page, "Kyl");

    // Three cards in one row, each at least 44 px, without horizontal scroll.
    const boxes = await places(page).getByRole("link").evaluateAll((links) =>
      links.map((link) => link.getBoundingClientRect().toJSON() as DOMRect),
    );
    expect(new Set(boxes.map((box) => Math.round(box.top))).size).toBe(1);
    for (const box of boxes) expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await expect(heading(page, "Mejeri & ägg")).toBeVisible();
    await expect(heading(page, "Såser & smaksättare")).toBeVisible();
    await expect(rows(page)).toHaveText([today("Mjölk"), today("Smör"), today("Salt")]);
    await expect(heading(page, "Med mängd")).toHaveCount(0);
    await expect(heading(page, "Finns hemma")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("a tap on a card chooses the location, and the choice is in the address", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/hemma");
    await expect(rows(page)).toHaveCount(3);

    await card(page, "Frys").click();
    await expect(page).toHaveURL(/\/hemma\?plats=frys$/);
    await expectChosen(page, "Frys");
    await expect(rows(page)).toHaveText([today("Ärtor")]);
    await expect(heading(page, "Frys")).toBeVisible();

    await card(page, "Skafferi").click();
    await expect(page).toHaveURL(/\/hemma\?plats=skafferi$/);
    await expectChosen(page, "Skafferi");
    await expect(page.getByText("Inget i skafferiet än.")).toBeVisible();
    await expect(rows(page)).toHaveCount(0);

    await card(page, "Kyl").click();
    await expect(page).toHaveURL(/\/hemma\?plats=kyl$/);
    await expectChosen(page, "Kyl");
    await expect(rows(page)).toHaveText([today("Mjölk"), today("Smör"), today("Salt")]);
    expect(errors).toEqual([]);
  });

  test("an unknown location in the address shows Kyl", async ({ page }) => {
    await page.goto("/hemma?plats=garage");
    await expectChosen(page, "Kyl");
    await expect(rows(page)).toHaveText([today("Mjölk"), today("Smör"), today("Salt")]);
  });
});

test.describe("on a computer", () => {
  test.use({ viewport: desktop });

  test("opens the location in the address and shows the cards in a row", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/hemma?plats=frys");
    await expectChosen(page, "Frys");
    await expect(rows(page)).toHaveText([today("Ärtor")]);

    const boxes = await places(page).getByRole("link").evaluateAll((links) =>
      links.map((link) => link.getBoundingClientRect().toJSON() as DOMRect),
    );
    expect(new Set(boxes.map((box) => Math.round(box.top))).size).toBe(1);

    await card(page, "Kyl").click();
    await expect(page).toHaveURL(/\/hemma\?plats=kyl$/);
    await expect(rows(page)).toHaveText([today("Mjölk"), today("Smör"), today("Salt")]);
    expect(errors).toEqual([]);
  });
});

// Story 2.2: the sheet Lagervara.
const sheet = (page: Page) => page.getByRole("dialog");
const addButton = (page: Page) => page.getByRole("button", { name: "Lägg till vara" }).filter({ visible: true }).first();
const row = (page: Page, name: string) => rows(page).filter({ hasText: new RegExp(`^${name}(?:\\s|$)`) });

/** The amounts of the user's rows of the item, by location, with the service role: the list shows none (Story 11.3). */
async function amounts(userId: string, name: string): Promise<Record<string, string>> {
  const { data, error } = await adminClient()
    .from("pantry_item")
    .select("location, amount, unit, ingredient!inner(name)")
    .eq("user_id", userId)
    .eq("ingredient.name", name);
  if (error) throw error;
  return Object.fromEntries(
    data.map((one) => [one.location, one.amount === null ? "obegränsad" : `${Number(one.amount)} ${one.unit}`]),
  );
}
const place = (page: Page, name: "Kyl" | "Frys" | "Skafferi") => sheet(page).getByRole("radio", { name });
const amountField = (page: Page) => sheet(page).getByLabel("Mängd");

/**
 * Lowercase letters only, and new in every attempt, so a retry still sees
 * "Lägg till … som ny". The ingredients cannot be removed afterwards: the
 * catalog is never deleted from, not even with the service role (AD-20,
 * 20261025200024_catalog_atomic_commit.sql); global-setup deletes the E2E
 * user, and its catalog with it, before each run.
 */
function letters(count: number): string {
  return Array.from({ length: count }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");
}

test.describe("the sheet Lagervara", () => {
  test.use({ viewport: mobile });

  test("adds an ingredient from the catalog with an amount, setting the row that is there", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/hemma");
    await expect(rows(page)).toHaveCount(3);

    await addButton(page).click();
    const search = sheet(page).getByRole("searchbox", { name: "Sök ingrediens" });
    await expect(search).toBeFocused();
    await search.fill("mjö");
    await sheet(page).getByRole("button", { name: "Mjölk" }).click();
    // The catalog keeps Mjölk in Kyl.
    await expect(place(page, "Kyl")).toHaveAttribute("aria-checked", "true");
    await amountField(page).fill("1,5");
    await sheet(page).getByLabel("Enhet").selectOption("l");
    await sheet(page).getByRole("button", { name: "Lägg till vara" }).click();

    await expect(sheet(page)).toHaveCount(0);
    await expect(page.getByTestId("toast")).toHaveText("Mjölk är sparad i kylen.");
    // Set, not added to: 1,5 l on the same row.
    await expect(rows(page)).toHaveText([today("Mjölk"), today("Smör"), today("Salt")]);
    await expect.poll(() => amounts(userId, "Mjölk")).toEqual({ Kyl: "1.5 l" });
    await expect(card(page, "Kyl")).toHaveText(/^\S*Kyl\s*3 varor$/);
    expect(errors).toEqual([]);
  });

  test("adds a new catalog ingredient without amount in the chosen location", async ({ page }) => {
    const errors = watchErrors(page);
    const name = `Saffran ${letters(6)}`;
    await page.goto("/hemma?plats=frys");
    await expect(rows(page)).toHaveCount(1);

    await addButton(page).click();
    await sheet(page).getByRole("searchbox", { name: "Sök ingrediens" }).fill(name);
    await sheet(page).getByRole("button", { name: `Lägg till ${name} som ny` }).click();
    await expect(sheet(page).getByText("Ny", { exact: true })).toBeVisible();
    await sheet(page).getByLabel("Avdelning").selectOption("Skafferi");
    // Frys was chosen on Hemma, so it is preselected.
    await expect(place(page, "Frys")).toHaveAttribute("aria-checked", "true");
    await sheet(page).getByRole("button", { name: "Lägg till vara" }).click();

    await expect(sheet(page)).toHaveCount(0);
    // "Saffran" is a seasoning: Såser & smaksättare, after Frys in the store's order.
    await expect(heading(page, "Såser & smaksättare")).toBeVisible();
    await expect(rows(page)).toHaveText([today("Ärtor"), today(name)]);
    await expect(card(page, "Frys")).toHaveText(/^\S*Frys\s*2 varor$/);

    // The new ingredient is in the catalog now: the search finds it.
    await addButton(page).click();
    await sheet(page).getByRole("searchbox", { name: "Sök ingrediens" }).fill(name);
    await expect(sheet(page).getByRole("button", { name, exact: true })).toBeVisible();
    await expect(sheet(page).getByRole("button", { name: /som ny$/ })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("changes the amount of an item, and makes one unlimited", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/hemma");

    await row(page, "Mjölk").click();
    await expect(amountField(page)).toHaveValue("1");
    await expect(sheet(page).getByLabel("Enhet")).toHaveValue("l");
    await amountField(page).fill("2");
    await sheet(page).getByRole("button", { name: "Spara ändringar" }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect.poll(() => amounts(userId, "Mjölk")).toEqual({ Kyl: "2 l" });
    await expect(rows(page)).toHaveText([today("Mjölk"), today("Smör"), today("Salt")]);

    // Without an amount, Smör is unlimited, and stays a row like the others.
    await row(page, "Smör").click();
    await amountField(page).fill("");
    await sheet(page).getByRole("button", { name: "Spara ändringar" }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect.poll(() => amounts(userId, "Smör")).toEqual({ Kyl: "obegränsad" });
    await expect(rows(page)).toHaveText([today("Mjölk"), today("Smör"), today("Salt")]);

    // An unlimited item's row opens the sheet too.
    await row(page, "Salt").click();
    await expect(sheet(page).getByTestId("pantry-sheet-ingredient")).toHaveText("Salt");
    await expect(amountField(page)).toHaveValue("");
    expect(errors).toEqual([]);
  });

  test("moves an item to another location", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/hemma");

    await row(page, "Mjölk").click();
    await sheet(page).getByRole("button", { name: /^Ligger i/ }).click();
    await place(page, "Frys").click();
    await sheet(page).getByRole("button", { name: "Spara ändringar" }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.getByTestId("toast")).toHaveText("Mjölk är sparad i frysen.");
    await expect(rows(page)).toHaveText([today("Smör"), today("Salt")]);
    await expect(card(page, "Kyl")).toHaveText(/^\S*Kyl\s*2 varor$/);
    await expect(card(page, "Frys")).toHaveText(/^\S*Frys\s*2 varor$/);

    // Mejeri & ägg comes before Frys in the store's order.
    await card(page, "Frys").click();
    await expect(rows(page)).toHaveText([today("Mjölk"), today("Ärtor")]);
    expect(errors).toEqual([]);
  });

  test("refuses an amount that is not a number above 0, and asks before throwing changes away", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/hemma");

    await row(page, "Mjölk").click();
    const save = sheet(page).getByRole("button", { name: "Spara ändringar" });
    const message = sheet(page).getByText("Ange ett tal större än 0.");
    // Not while typing; on Spara, which saves nothing, or when leaving the field.
    await amountField(page).fill("två");
    await expect(message).toHaveCount(0);
    for (const amount of ["två", "0", "-1", "1-2"]) {
      await amountField(page).fill(amount);
      await save.click();
      await expect(message).toBeVisible();
      await expect(amountField(page)).toHaveAttribute("aria-invalid", "true");
      await expect(amountField(page)).toBeFocused();
      await expect(sheet(page)).toBeVisible();
    }
    await amountField(page).fill("2");
    await expect(message).toHaveCount(0);

    await sheet(page).getByRole("button", { name: "Avbryt" }).click();
    await expect(sheet(page).getByText("Släng ändringarna?")).toBeVisible();
    await sheet(page).getByRole("button", { name: "Släng ändringarna" }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect.poll(() => amounts(userId, "Mjölk")).toEqual({ Kyl: "1 l" });

    // An empty location offers "Lägg till vara" too, with the location preselected.
    await card(page, "Skafferi").click();
    await page.getByRole("button", { name: "Lägg till vara" }).filter({ visible: true }).last().click();
    await sheet(page).getByRole("searchbox", { name: "Sök ingrediens" }).fill("salt");
    await sheet(page).getByRole("button", { name: "Salt" }).click();
    await expect(place(page, "Skafferi")).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    await expect(sheet(page).getByText("Släng ändringarna?")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("suggests the catalog's location and default unit for the chosen ingredient", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/hemma");
    await expectChosen(page, "Kyl");

    // Salt is kept in Skafferi in the catalog, although Kyl is chosen.
    await addButton(page).click();
    await sheet(page).getByRole("searchbox", { name: "Sök ingrediens" }).fill("salt");
    await sheet(page).getByRole("button", { name: "Salt" }).click();
    await expect(place(page, "Skafferi")).toHaveAttribute("aria-checked", "true");
    await expect(sheet(page).getByLabel("Enhet")).toHaveValue("");

    // Smör has the default unit g.
    await sheet(page).getByRole("button", { name: "Byt vara" }).click();
    await sheet(page).getByRole("searchbox", { name: "Sök ingrediens" }).fill("smör");
    await sheet(page).getByRole("button", { name: "Smör" }).click();
    await expect(sheet(page).getByLabel("Enhet")).toHaveValue("g");
    expect(errors).toEqual([]);
  });
});

// Story 2.3: removing an item, with "Ångra".
const toast = (page: Page) => page.getByTestId("toast");

/** The id of the user's row for the item in the location, with the service role; null when there is none. */
async function rowId(userId: string, name: Name, location: string): Promise<string | null> {
  const { data, error } = await adminClient()
    .from("pantry_item")
    .select("id, ingredient!inner(name)")
    .eq("user_id", userId)
    .eq("location", location)
    .eq("ingredient.name", name);
  if (error) throw error;
  return data[0]?.id ?? null;
}

/** The row's bin (Story 11.3). */
const bin = (page: Page, name: string) => page.getByRole("button", { name: `Ta bort ${name}`, exact: true }).filter({ visible: true });

/** Removes a row with its swipe action, reached from the keyboard (Story 14.6): no question, "Ångra" follows. */
async function pressBin(page: Page, name: string) {
  await bin(page, name).focus();
  await page.keyboard.press("Enter");
}

/** Taps Ångra and waits for the answers to the Server Action calls it makes. */
async function undoAndWait(page: Page, calls = 1) {
  let answered = 0;
  const count = (response: Response) => {
    if (response.request().method() === "POST" && "next-action" in response.request().headers()) answered += 1;
  };
  page.on("response", count);
  await toast(page).getByRole("button", { name: "Ångra" }).click();
  await expect.poll(() => answered).toBeGreaterThanOrEqual(calls);
  page.off("response", count);
}

test.describe("removing an item", () => {
  test.use({ viewport: mobile });

  test("the bin removes the row at once, without a question, and Ångra puts it back with the same id", async ({ page }) => {
    const errors = watchErrors(page);
    const id = await rowId(userId, "Mjölk", "Kyl");
    await page.goto("/hemma");
    await expect(rows(page)).toHaveCount(3);

    await pressBin(page, "Mjölk");
    await expect(sheet(page)).toHaveCount(0);
    await expect(rows(page)).toHaveText([today("Smör"), today("Salt")]);
    await expect(card(page, "Kyl")).toHaveText(/^\S*Kyl\s*2 varor$/);
    await expect(toast(page)).toContainText("Tog bort Mjölk.");
    await expect.poll(() => rowId(userId, "Mjölk", "Kyl")).toBeNull();

    await undoAndWait(page);
    // Settled: the action has answered and the page has the server's list.
    await expect(toast(page)).toHaveCount(0);
    await expect(rows(page)).toHaveText([today("Mjölk"), today("Smör"), today("Salt")]);
    await expect(card(page, "Kyl")).toHaveText(/^\S*Kyl\s*3 varor$/);
    expect(await rowId(userId, "Mjölk", "Kyl")).toBe(id);
    // Still there after a reload, with its amount: the server has it.
    await page.reload();
    await expect(rows(page)).toHaveText([today("Mjölk"), today("Smör"), today("Salt")]);
    expect(await amounts(userId, "Mjölk")).toEqual({ Kyl: "1 l" });
    expect(errors).toEqual([]);
  });

  test("a second removal joins the confirmation, and one Ångra puts back both", async ({ page }) => {
    const errors = watchErrors(page);
    const ids = [await rowId(userId, "Mjölk", "Kyl"), await rowId(userId, "Smör", "Kyl")];
    await page.goto("/hemma");
    await pressBin(page, "Mjölk");
    await expect(toast(page)).toContainText("Tog bort Mjölk.");
    // Past the bins' double-tap guard (400 ms), as between two real taps.
    await page.waitForTimeout(450);
    await pressBin(page, "Smör");
    await expect(toast(page)).toContainText("Tog bort Mjölk och Smör.");
    await expect(rows(page)).toHaveText([today("Salt")]);
    await expect(card(page, "Kyl")).toHaveText(/^\S*Kyl\s*1 vara$/);

    await undoAndWait(page, 2);
    await expect(toast(page)).toHaveCount(0);
    await expect(rows(page)).toHaveText([today("Mjölk"), today("Smör"), today("Salt")]);
    await expect(card(page, "Kyl")).toHaveText(/^\S*Kyl\s*3 varor$/);
    expect([await rowId(userId, "Mjölk", "Kyl"), await rowId(userId, "Smör", "Kyl")]).toEqual(ids);
    expect(errors).toEqual([]);
  });

  test("Ta bort in the sheet removes an unlimited item, and the sheet closes", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/hemma");
    await expect(rows(page)).toHaveText([today("Mjölk"), today("Smör"), today("Salt")]);

    await row(page, "Salt").click();
    await sheet(page).getByRole("button", { name: "Ta bort" }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(rows(page)).toHaveText([today("Mjölk"), today("Smör")]);
    await expect(heading(page, "Såser & smaksättare")).toHaveCount(0);
    await expect(toast(page)).toContainText("Tog bort Salt.");
    await expect.poll(() => rowId(userId, "Salt", "Kyl")).toBeNull();
    expect(errors).toEqual([]);
  });

  test("Ångra fails when the location has the item again, and the item stays removed", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/hemma");
    await pressBin(page, "Smör");
    await expect(toast(page)).toContainText("Tog bort Smör.");

    // Meanwhile Smör in g is back in Kyl, as a new row.
    const { data: ingredient, error } = await adminClient()
      .from("ingredient")
      .select("id")
      .eq("user_id", userId)
      .eq("name", "Smör")
      .single();
    if (error) throw error;
    const inserted = await adminClient()
      .from("pantry_item")
      .insert({ user_id: userId, ingredient_id: ingredient.id, location: "Kyl", amount: 500, unit: "g" })
      .select("id")
      .single();
    if (inserted.error) throw inserted.error;

    await undoAndWait(page);
    // A short confirmation, announced as an alert; the row that is there now shows.
    await expect(toast(page)).toHaveText("Det gick inte att ångra.");
    await expect(page.getByRole("alert").filter({ hasText: "Det gick inte att ångra." })).toBeAttached();
    await expect(rows(page)).toHaveText([today("Mjölk"), today("Smör"), today("Salt")]);
    await expect.poll(() => rowId(userId, "Smör", "Kyl")).toBe(inserted.data.id);
    expect(await amounts(userId, "Smör")).toEqual({ Kyl: "500 g" });
    expect(errors).toEqual([]);
  });

  test("has a swipe row and no bin in Matvaror (Story 14.6)", async ({ page }) => {
    await page.goto("/hemma");
    await expect(page.getByTestId("swipe-row-front")).toHaveCount(3);
    await expect(page.locator("[data-trash-button]")).toHaveCount(0);
  });
});

test.describe("removing an item with the keyboard", () => {
  test.use({ viewport: desktop });

  test("Tab after a row reaches its Ta bort; Enter removes at once, and focus goes to the next row", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/hemma");
    await row(page, "Mjölk").focus();
    await page.keyboard.press("Tab");
    await expect(bin(page, "Mjölk")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(rows(page)).toHaveText([today("Smör"), today("Salt")]);
    await expect(toast(page)).toContainText("Tog bort Mjölk.");
    await expect(row(page, "Smör")).toBeFocused();
    expect(errors).toEqual([]);
  });
});
