import { expect, type Page, test } from "@playwright/test";
import { adminClient, e2eUserId, labelEmail, labelStorageState } from "./support";

// Story 11.2 (FR-42): the brand or kind of a pantry item and the time it was
// added, with AI_PROVIDER=mock. kyl.png gives six suggestions
// (kyl.analyze.json); the one for the catalog's mjölk has the label
// "Mellanmjölk 1,5 %", and the new grädde "Vispgrädde 3 dl". The spec has an
// E2E user of its own (labelEmail): before each test the service role empties
// its pantry and makes the catalog ingredient "mjölk", so a photo of the
// empty Kyl is a plain list. The tests run in order, since they share the
// user. Names are matched without case: the catalog may store them with a
// capital first letter (Story 10.4).

const kyl = "tests/fixtures/ai/kyl.png";

test.use({ storageState: labelStorageState, viewport: { width: 375, height: 812 } });
test.describe.configure({ mode: "serial" });

let userId = "";
let mjolkId = "";
test.beforeAll(async () => {
  userId = await e2eUserId(labelEmail);
});

test.beforeEach(async () => {
  const admin = adminClient();
  const removed = await admin.from("pantry_item").delete().eq("user_id", userId);
  if (removed.error) throw removed.error;
  const catalog = await admin
    .from("ingredient")
    .upsert(
      [{ user_id: userId, name: "mjölk", normalized_name: "mjölk", section: "Mejeri", location: "Kyl", default_unit: "förp" }],
      { onConflict: "user_id,normalized_name" },
    )
    .select("id");
  if (catalog.error) throw catalog.error;
  mjolkId = catalog.data[0].id;
});

/** The user's pantry rows for the ingredients whose name matches `name`, as the table has them. */
async function saved(name: RegExp): Promise<{ id: string; label: string | null; created_at: string; amount: number | null }[]> {
  const admin = adminClient();
  const ingredients = await admin.from("ingredient").select("id, name").eq("user_id", userId);
  if (ingredients.error) throw ingredients.error;
  const ids = ingredients.data.filter((row) => name.test(row.name)).map((row) => row.id);
  const pantry = await admin.from("pantry_item").select("id, label, created_at, amount").eq("user_id", userId).in("ingredient_id", ids);
  if (pantry.error) throw pantry.error;
  return pantry.data.map((row) => ({ ...row, amount: row.amount === null ? null : Number(row.amount) }));
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
const cards = (page: Page) => section(page).getByTestId("pantry-suggestion");
const rows = (page: Page) => page.getByTestId("pantry-row").filter({ visible: true });
const sheet = (page: Page) => page.getByRole("dialog");
const labelField = (page: Page) => sheet(page).getByRole("textbox", { name: "Märke eller sort" });
const toast = (page: Page) => page.getByTestId("toast");

async function photographFridge(page: Page) {
  await page.goto("/hemma");
  const chooser = page.waitForEvent("filechooser");
  await camera(page).getByRole("button", { name: "Fotografera kylen" }).click();
  await (await chooser).setFiles(kyl);
  await expect(cards(page)).toHaveCount(6);
}

test("a confirmed suggestion keeps its first label, which the sheet shows and Pontus can change and remove", async ({ page }) => {
  const errors = watchErrors(page);
  await photographFridge(page);

  await section(page).getByRole("button", { name: /^Bekräfta mjölk$/i }).click();
  await expect(toast(page)).toHaveText(/^mjölk är sparad i kylen\.$/i);
  await expect.poll(async () => (await saved(/^mjölk$/i)).map((row) => row.label)).toEqual(["Mellanmjölk 1,5 %"]);

  // The sheet shows the label, as a field of its own with its visible name.
  await rows(page).filter({ hasText: /mjölk/i }).click();
  await expect(labelField(page)).toHaveValue("Mellanmjölk 1,5 %");
  await expect(labelField(page)).toHaveAttribute("placeholder", "Till exempel Arla laktosfri");
  const fontSize = await labelField(page).evaluate((field) => Number.parseFloat(getComputedStyle(field).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(16);

  // Changed, then emptied: the label follows, and the time stays.
  const [{ created_at: added }] = await saved(/^mjölk$/i);
  await labelField(page).fill("Arla laktosfri");
  await sheet(page).getByRole("button", { name: "Spara ändringar" }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect.poll(async () => (await saved(/^mjölk$/i)).map((row) => row.label)).toEqual(["Arla laktosfri"]);

  // The list shows the new label before the row is opened, so the sheet never gets the old one.
  await expect(rows(page).filter({ hasText: "Arla laktosfri" })).toHaveCount(1);
  await rows(page).filter({ hasText: /mjölk/i }).click();
  await expect(labelField(page)).toHaveValue("Arla laktosfri");
  await labelField(page).fill("");
  await sheet(page).getByRole("button", { name: "Spara ändringar" }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect.poll(async () => (await saved(/^mjölk$/i)).map((row) => row.label)).toEqual([null]);
  const [after] = await saved(/^mjölk$/i);
  expect(new Date(after.created_at).getTime()).toBe(new Date(added).getTime());
  expect(errors).toEqual([]);
});

test("Rätta fills in the label from the photo, and Bekräfta saves the one Pontus wrote", async ({ page }) => {
  const errors = watchErrors(page);
  await photographFridge(page);

  await section(page).getByRole("button", { name: /^Rätta grädde$/i }).click();
  await expect(labelField(page)).toHaveValue("Vispgrädde 3 dl");
  await labelField(page).fill("Arla");
  await sheet(page).getByRole("button", { name: "Bekräfta" }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(toast(page)).toHaveText(/^grädde är sparad i kylen\.$/i);
  await expect.poll(async () => (await saved(/^grädde$/i)).map((row) => row.label)).toEqual(["Arla"]);
  expect(errors).toEqual([]);
});

test("Ta bort and Ångra put the item back with the same id, label and time", async ({ page }) => {
  const errors = watchErrors(page);
  const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
  const inserted = await adminClient()
    .from("pantry_item")
    .insert({ user_id: userId, ingredient_id: mjolkId, location: "Kyl", amount: 1, unit: "l", label: "Arla", created_at: sixDaysAgo })
    .select("id, created_at")
    .single();
  if (inserted.error) throw inserted.error;

  await page.goto("/hemma");
  await rows(page).filter({ hasText: /mjölk/i }).click();
  await expect(labelField(page)).toHaveValue("Arla");
  await sheet(page).getByRole("button", { name: "Ta bort" }).click();
  await expect(rows(page)).toHaveCount(0);
  await expect.poll(async () => (await saved(/^mjölk$/i)).length).toBe(0);

  await toast(page).getByRole("button", { name: "Ångra" }).click();
  await expect(rows(page).filter({ hasText: /mjölk/i })).toHaveCount(1);
  // The list shows the row before the server has it back, so the test waits for the row itself.
  await expect.poll(async () => (await saved(/^mjölk$/i)).length).toBe(1);
  const [restored] = await saved(/^mjölk$/i);
  expect(restored).toMatchObject({ id: inserted.data.id, label: "Arla", amount: 1 });
  expect(new Date(restored.created_at).getTime()).toBe(new Date(inserted.data.created_at).getTime());

  await rows(page).filter({ hasText: /mjölk/i }).click();
  await expect(labelField(page)).toHaveValue("Arla");
  expect(errors).toEqual([]);
});
