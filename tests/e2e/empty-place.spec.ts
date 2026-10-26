import { expect, type Page, test } from "@playwright/test";
import { adminClient, e2eUserId, emptyPlaceEmail, emptyPlaceStorageState } from "./support";

// Story 6.3: "Töm kylen" on Hemma asks first, empties the location in one
// call, and "Ångra" puts every row back with the same id. The spec has an E2E
// user of its own (emptyPlaceEmail): before each test the service role
// empties its pantry and makes the catalog ingredients "mjölk", "ost", "smör"
// and "ärtor" and the pantry items "mjölk 2 förp", "ost 1 förp" and "smör"
// (unlimited) in Kyl and "ärtor 1 förp" in Frys. Skafferi is empty. The tests
// run in order, since they share the user. No AI is asked.

test.use({ storageState: emptyPlaceStorageState, viewport: { width: 375, height: 812 } });
test.describe.configure({ mode: "serial" });

let userId = "";
test.beforeAll(async () => {
  userId = await e2eUserId(emptyPlaceEmail);
});

test.beforeEach(async () => {
  const admin = adminClient();
  const removed = await admin.from("pantry_item").delete().eq("user_id", userId);
  if (removed.error) throw removed.error;
  const catalog = await admin
    .from("ingredient")
    .upsert(
      [
        { user_id: userId, name: "mjölk", normalized_name: "mjölk", section: "Mejeri", location: "Kyl", default_unit: "förp" },
        { user_id: userId, name: "ost", normalized_name: "ost", section: "Mejeri", location: "Kyl", default_unit: "förp" },
        { user_id: userId, name: "smör", normalized_name: "smör", section: "Mejeri", location: "Kyl", default_unit: "förp" },
        { user_id: userId, name: "ärtor", normalized_name: "ärtor", section: "Frys", location: "Frys", default_unit: "förp" },
      ],
      { onConflict: "user_id,normalized_name" },
    )
    .select("id, name");
  if (catalog.error) throw catalog.error;
  const id = (name: string) => catalog.data.find((row) => row.name === name)!.id;
  const inserted = await admin.from("pantry_item").insert([
    { user_id: userId, ingredient_id: id("mjölk"), location: "Kyl", amount: 2, unit: "förp" },
    { user_id: userId, ingredient_id: id("ost"), location: "Kyl", amount: 1, unit: "förp" },
    { user_id: userId, ingredient_id: id("smör"), location: "Kyl", amount: null, unit: null },
    { user_id: userId, ingredient_id: id("ärtor"), location: "Frys", amount: 1, unit: "förp" },
  ]);
  if (inserted.error) throw inserted.error;
});

/** The user's pantry rows in `location` as the database has them, by id. */
async function rowsIn(location: string): Promise<{ id: string; ingredient_id: string; amount: number | null; unit: string | null }[]> {
  const { data, error } = await adminClient()
    .from("pantry_item")
    .select("id, ingredient_id, amount, unit")
    .eq("user_id", userId)
    .eq("location", location)
    .order("id");
  if (error) throw error;
  return data.map((row) => ({ ...row, amount: row.amount === null ? null : Number(row.amount) }));
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
const card = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Platser" }).getByRole("link", { name: new RegExp(`^${name}`) });
const emptyButton = (page: Page, name = "Töm kylen") =>
  page.getByRole("button", { name, exact: true }).filter({ visible: true });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Töm kylen" });
const rows = (page: Page) => page.getByTestId("pantry-row").filter({ visible: true });
const tags = (page: Page) => page.getByTestId("pantry-tag").filter({ visible: true });
const toast = (page: Page) => page.getByTestId("toast");

test("an empty location has no button to empty it", async ({ page }) => {
  await page.goto("/hemma?plats=skafferi");
  await expect(page.getByText("Inget i skafferiet än.")).toBeVisible();
  // The empty state's button, not "+" in the header, which has the same name.
  await expect(
    page.getByRole("button", { name: "Lägg till vara", exact: true }).filter({ hasText: "Lägg till vara", visible: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Töm / })).toHaveCount(0);
});

test("Töm kylen asks first, with focus on Avbryt, and Avbryt removes nothing", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/hemma");
  await expect(card(page, "Kyl")).toHaveText(/^Kyl\s*3 varor$/);
  await emptyButton(page).click();

  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByText("Ta bort alla 3 varor i kylen?")).toBeVisible();
  await expect(sheet(page).getByText("Du kan ångra direkt efteråt.")).toBeVisible();
  await expect(sheet(page).getByRole("button", { name: "Avbryt" })).toBeFocused();
  await expect(sheet(page).getByRole("button", { name: "Töm kylen" })).toBeVisible();

  await sheet(page).getByRole("button", { name: "Avbryt" }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(emptyButton(page)).toBeFocused();
  await expect(rows(page)).toHaveCount(2);
  await expect(tags(page)).toHaveCount(1);
  expect(await rowsIn("Kyl")).toHaveLength(3);
  expect(errors).toEqual([]);
});

test("Töm kylen removes every item in Kyl, and Ångra puts them back with the same ids", async ({ page }) => {
  const errors = watchErrors(page);
  const before = await rowsIn("Kyl");
  expect(before).toHaveLength(3);
  await page.goto("/hemma");
  await expect(card(page, "Kyl")).toHaveText(/^Kyl\s*3 varor$/);
  await emptyButton(page).click();
  await sheet(page).getByRole("button", { name: "Töm kylen" }).click();

  await expect(toast(page)).toContainText("Tog bort 3 varor ur kylen.");
  await expect(sheet(page)).toBeHidden();
  await expect(page.getByText("Inget i kylen än.")).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  await expect(tags(page)).toHaveCount(0);
  await expect(card(page, "Kyl")).toHaveText(/^Kyl\s*0 varor$/);
  await expect(card(page, "Frys")).toHaveText(/^Frys\s*1 vara$/);
  await expect(emptyButton(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Fotografera kylen" })).toBeFocused();
  expect(await rowsIn("Kyl")).toEqual([]);
  expect(await rowsIn("Frys")).toHaveLength(1);

  await toast(page).getByRole("button", { name: "Ångra" }).click();
  await expect(card(page, "Kyl")).toHaveText(/^Kyl\s*3 varor$/);
  await expect(rows(page)).toHaveText([/^mjölk\s*2 förp$/, /^ost\s*1 förp$/]);
  await expect(tags(page)).toHaveText(["smör"]);
  await expect(emptyButton(page)).toBeVisible();
  await expect.poll(() => rowsIn("Kyl")).toEqual(before);
  expect(await rowsIn("Frys")).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("Ångra skips an item added again meanwhile and says so, and puts the others back", async ({ page }) => {
  const errors = watchErrors(page);
  const before = await rowsIn("Kyl");
  await page.goto("/hemma");
  await expect(card(page, "Kyl")).toHaveText(/^Kyl\s*3 varor$/);
  await emptyButton(page).click();
  await sheet(page).getByRole("button", { name: "Töm kylen" }).click();
  await expect(toast(page)).toContainText("Tog bort 3 varor ur kylen.");

  // Another device puts "mjölk 1 förp" in Kyl before Ångra.
  const mjolk = before.find((row) => row.amount === 2)!;
  const added = await adminClient()
    .from("pantry_item")
    .insert({ user_id: userId, ingredient_id: mjolk.ingredient_id, location: "Kyl", amount: 1, unit: "förp" })
    .select("id")
    .single();
  if (added.error) throw added.error;

  await toast(page).getByRole("button", { name: "Ångra" }).click();
  await expect(toast(page)).toContainText("1 vara gick inte att ångra.");
  await expect(page.getByRole("alert").filter({ hasText: "1 vara gick inte att ångra." })).toHaveCount(1);
  const expected = [
    ...before.filter((row) => row.id !== mjolk.id),
    { id: added.data.id, ingredient_id: mjolk.ingredient_id, amount: 1, unit: "förp" },
  ].sort((a, b) => a.id.localeCompare(b.id));
  await expect.poll(() => rowsIn("Kyl")).toEqual(expected);
  await expect(card(page, "Kyl")).toHaveText(/^Kyl\s*3 varor$/);
  await expect(rows(page)).toHaveText([/^mjölk\s*1 förp$/, /^ost\s*1 förp$/]);
  await expect(tags(page)).toHaveText(["smör"]);
  expect(errors).toEqual([]);
});
