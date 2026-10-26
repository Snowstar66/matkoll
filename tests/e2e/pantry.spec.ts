import { expect, type Page, type Response, test } from "@playwright/test";
import { adminClient, e2eUserId, pantryEmail, pantryStorageState } from "./support";

// Stories 2.1, 2.2 and 2.3: Hemma with the location cards and the chosen
// location's items, the sheet Lagervara that adds and changes items, and
// removing items by swipe or in the sheet, with "Ångra". The
// spec has an E2E user of its own (pantryEmail), whose catalog ingredients
// and pantry rows are made with the service role before each test: 3 items
// in Kyl (two with an amount, Salt unlimited), 1 in Frys and none in
// Skafferi. The tests run in order, since they share the user.

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
const tags = (page: Page) => page.getByTestId("pantry-tag").filter({ visible: true });
const heading = (page: Page, name: string) => page.getByRole("heading", { level: 2, name });

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

  test("shows the three location cards with counts, and Kyl's rows and tags", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/hemma");
    await expect(page.getByRole("heading", { level: 1, name: "Lagersaldo" })).toBeVisible();

    await expect(card(page, "Kyl")).toHaveText(/^Kyl\s*3 varor$/);
    await expect(card(page, "Frys")).toHaveText(/^Frys\s*1 vara$/);
    await expect(card(page, "Skafferi")).toHaveText(/^Skafferi\s*0 varor$/);
    await expectChosen(page, "Kyl");

    // Three cards in one row, each at least 44 px, without horizontal scroll.
    const boxes = await places(page).getByRole("link").evaluateAll((links) =>
      links.map((link) => link.getBoundingClientRect().toJSON() as DOMRect),
    );
    expect(new Set(boxes.map((box) => Math.round(box.top))).size).toBe(1);
    for (const box of boxes) expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await expect(heading(page, "Med mängd")).toBeVisible();
    await expect(rows(page)).toHaveText([/^Mjölk\s*1 l$/, /^Smör\s*250 g$/]);
    await expect(heading(page, "Finns hemma")).toBeVisible();
    await expect(tags(page)).toHaveText(["Salt"]);
    expect(errors).toEqual([]);
  });

  test("a tap on a card chooses the location, and the choice is in the address", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/hemma");
    await expect(rows(page)).toHaveCount(2);

    await card(page, "Frys").click();
    await expect(page).toHaveURL(/\/hemma\?plats=frys$/);
    await expectChosen(page, "Frys");
    await expect(rows(page)).toHaveText([/^Ärtor\s*500 g$/]);
    await expect(tags(page)).toHaveCount(0);
    await expect(heading(page, "Finns hemma")).toHaveCount(0);

    await card(page, "Skafferi").click();
    await expect(page).toHaveURL(/\/hemma\?plats=skafferi$/);
    await expectChosen(page, "Skafferi");
    await expect(page.getByText("Inget i skafferiet än.")).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    await expect(tags(page)).toHaveCount(0);

    await card(page, "Kyl").click();
    await expect(page).toHaveURL(/\/hemma\?plats=kyl$/);
    await expectChosen(page, "Kyl");
    await expect(tags(page)).toHaveText(["Salt"]);
    expect(errors).toEqual([]);
  });

  test("an unknown location in the address shows Kyl", async ({ page }) => {
    await page.goto("/hemma?plats=garage");
    await expectChosen(page, "Kyl");
    await expect(rows(page)).toHaveText([/^Mjölk\s*1 l$/, /^Smör\s*250 g$/]);
  });
});

test.describe("on a computer", () => {
  test.use({ viewport: desktop });

  test("opens the location in the address and shows the cards in a row", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/hemma?plats=frys");
    await expectChosen(page, "Frys");
    await expect(rows(page)).toHaveText([/^Ärtor\s*500 g$/]);

    const boxes = await places(page).getByRole("link").evaluateAll((links) =>
      links.map((link) => link.getBoundingClientRect().toJSON() as DOMRect),
    );
    expect(new Set(boxes.map((box) => Math.round(box.top))).size).toBe(1);

    await card(page, "Kyl").click();
    await expect(page).toHaveURL(/\/hemma\?plats=kyl$/);
    await expect(rows(page)).toHaveText([/^Mjölk\s*1 l$/, /^Smör\s*250 g$/]);
    await expect(tags(page)).toHaveText(["Salt"]);
    expect(errors).toEqual([]);
  });
});

// Story 2.2: the sheet Lagervara.
const sheet = (page: Page) => page.getByRole("dialog", { name: "Lagervara" });
const addButton = (page: Page) => page.getByRole("button", { name: "Lägg till vara" }).filter({ visible: true }).first();
const row = (page: Page, name: string) => rows(page).filter({ hasText: name });
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
    await expect(rows(page)).toHaveCount(2);

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
    await expect(rows(page)).toHaveText([/^Mjölk\s*1,5 l$/, /^Smör\s*250 g$/]);
    await expect(card(page, "Kyl")).toHaveText(/^Kyl\s*3 varor$/);
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
    await expect(heading(page, "Finns hemma")).toBeVisible();
    await expect(tags(page)).toHaveText([name]);
    await expect(card(page, "Frys")).toHaveText(/^Frys\s*2 varor$/);

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
    await expect(rows(page)).toHaveText([/^Mjölk\s*2 l$/, /^Smör\s*250 g$/]);

    // Without an amount, Smör is unlimited and shows as a tag.
    await row(page, "Smör").click();
    await amountField(page).fill("");
    await sheet(page).getByRole("button", { name: "Spara ändringar" }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(rows(page)).toHaveText([/^Mjölk\s*2 l$/]);
    await expect(tags(page)).toHaveText(["Salt", "Smör"]);

    // A tap on a tag opens the sheet too.
    await tags(page).filter({ hasText: "Salt" }).getByRole("button").click();
    await expect(sheet(page).getByTestId("pantry-sheet-ingredient")).toHaveText("Salt");
    await expect(amountField(page)).toHaveValue("");
    expect(errors).toEqual([]);
  });

  test("moves an item to another location", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/hemma");

    await row(page, "Mjölk").click();
    await place(page, "Frys").click();
    await sheet(page).getByRole("button", { name: "Spara ändringar" }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.getByTestId("toast")).toHaveText("Mjölk är sparad i frysen.");
    await expect(rows(page)).toHaveText([/^Smör\s*250 g$/]);
    await expect(card(page, "Kyl")).toHaveText(/^Kyl\s*2 varor$/);
    await expect(card(page, "Frys")).toHaveText(/^Frys\s*2 varor$/);

    await card(page, "Frys").click();
    await expect(rows(page)).toHaveText([/^Mjölk\s*1 l$/, /^Ärtor\s*500 g$/]);
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
    await expect(rows(page)).toHaveText([/^Mjölk\s*1 l$/, /^Smör\s*250 g$/]);

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
    await sheet(page).getByRole("button", { name: "Byt ingrediens" }).click();
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

/** The part of the row that slides; the action is behind it. */
const front = (page: Page, name: string) =>
  page.getByTestId("swipe-row-front").filter({ visible: true }).filter({ has: page.getByTestId("pantry-row").filter({ hasText: name }) });
const slidOpen = "matrix(1, 0, 0, 1, -96, 0)";

/**
 * Swipes the row to the left from its middle with the mouse, which sends the
 * same pointer events as a finger.
 */
async function swipeLeft(page: Page, name: string, distance = 150) {
  const box = await row(page, name).boundingBox();
  if (!box) throw new Error(`no row ${name}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - distance, y + 4, { steps: 12 });
  await page.mouse.up();
}

/** Removes the row by swipe and a tap on Ta bort. */
async function swipeAndRemove(page: Page, name: string) {
  await swipeLeft(page, name);
  await expect(front(page, name)).toHaveCSS("transform", slidOpen);
  await page.getByRole("button", { name: `Ta bort ${name}` }).click();
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

  test("a swipe to the left shows Ta bort, which removes the row at once, and Ångra puts it back with the same id", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    const id = await rowId(userId, "Mjölk", "Kyl");
    await page.goto("/hemma");
    await expect(rows(page)).toHaveCount(2);

    const remove = page.getByRole("button", { name: "Ta bort Mjölk" });
    // A short swipe slides back.
    await swipeLeft(page, "Mjölk", 30);
    await expect(front(page, "Mjölk")).toHaveCSS("transform", "none");
    await swipeLeft(page, "Mjölk");
    await expect(front(page, "Mjölk")).toHaveCSS("transform", slidOpen);
    // The click that ended the swipe did not open the sheet.
    await expect(sheet(page)).toHaveCount(0);
    await remove.click();

    await expect(rows(page)).toHaveText([/^Smör\s*250 g$/]);
    await expect(card(page, "Kyl")).toHaveText(/^Kyl\s*2 varor$/);
    await expect(toast(page)).toContainText("Mjölk är borttagen.");
    await expect.poll(() => rowId(userId, "Mjölk", "Kyl")).toBeNull();

    await undoAndWait(page);
    // Settled: the action has answered and the page has the server's list.
    await expect(toast(page)).toHaveCount(0);
    await expect(rows(page)).toHaveText([/^Mjölk\s*1 l$/, /^Smör\s*250 g$/]);
    await expect(card(page, "Kyl")).toHaveText(/^Kyl\s*3 varor$/);
    expect(await rowId(userId, "Mjölk", "Kyl")).toBe(id);
    // Still there after a reload: the server has it.
    await page.reload();
    await expect(rows(page)).toHaveText([/^Mjölk\s*1 l$/, /^Smör\s*250 g$/]);
    expect(errors).toEqual([]);
  });

  test("items removed while the confirmation shows join it, and one Ångra puts them all back", async ({ page }) => {
    const errors = watchErrors(page);
    const ids = [await rowId(userId, "Mjölk", "Kyl"), await rowId(userId, "Smör", "Kyl")];
    await page.goto("/hemma");
    await swipeAndRemove(page, "Mjölk");
    await expect(toast(page)).toContainText("Mjölk är borttagen.");
    await swipeAndRemove(page, "Smör");
    await expect(toast(page)).toContainText("Mjölk och smör är borttagna.");
    await expect(rows(page)).toHaveCount(0);
    await expect(card(page, "Kyl")).toHaveText(/^Kyl\s*1 vara$/);

    await undoAndWait(page, 2);
    await expect(toast(page)).toHaveCount(0);
    await expect(rows(page)).toHaveText([/^Mjölk\s*1 l$/, /^Smör\s*250 g$/]);
    await expect(card(page, "Kyl")).toHaveText(/^Kyl\s*3 varor$/);
    expect([await rowId(userId, "Mjölk", "Kyl"), await rowId(userId, "Smör", "Kyl")]).toEqual(ids);
    expect(errors).toEqual([]);
  });

  test("Ta bort in the sheet removes an unlimited item, and the sheet closes", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/hemma");
    await expect(tags(page)).toHaveText(["Salt"]);

    await tags(page).filter({ hasText: "Salt" }).getByRole("button").click();
    await sheet(page).getByRole("button", { name: "Ta bort" }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(tags(page)).toHaveCount(0);
    await expect(heading(page, "Finns hemma")).toHaveCount(0);
    await expect(toast(page)).toContainText("Salt är borttagen.");
    await expect.poll(() => rowId(userId, "Salt", "Kyl")).toBeNull();
    expect(errors).toEqual([]);
  });

  test("Ångra fails when the location has the item again, and the item stays removed", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/hemma");
    await swipeAndRemove(page, "Smör");
    await expect(toast(page)).toContainText("Smör är borttagen.");

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
    await expect(rows(page)).toHaveText([/^Mjölk\s*1 l$/, /^Smör\s*500 g$/]);
    await expect.poll(() => rowId(userId, "Smör", "Kyl")).toBe(inserted.data.id);
    expect(errors).toEqual([]);
  });
});

test.describe("removing an item with the keyboard", () => {
  test.use({ viewport: desktop });

  test("Tab after a row reaches Ta bort without a swipe", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/hemma");
    await row(page, "Mjölk").focus();
    await page.keyboard.press("Tab");
    const remove = page.getByRole("button", { name: "Ta bort Mjölk" });
    await expect(remove).toBeFocused();
    // The row slid aside, so the button is not covered.
    await expect(front(page, "Mjölk")).toHaveCSS("transform", slidOpen);
    const box = await remove.boundingBox();
    if (!box) throw new Error("no button");
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.textContent, center)).toBe("Ta bort");

    // Esc slides it back with focus on the row; Tab and Enter remove.
    await page.keyboard.press("Escape");
    await expect(front(page, "Mjölk")).toHaveCSS("transform", "none");
    await expect(row(page, "Mjölk")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(remove).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(rows(page)).toHaveText([/^Smör\s*250 g$/]);
    await expect(toast(page)).toContainText("Mjölk är borttagen.");
    // Focus moves on to the next item.
    await expect(row(page, "Smör")).toBeFocused();
    expect(errors).toEqual([]);
  });
});
