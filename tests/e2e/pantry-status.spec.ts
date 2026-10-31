import { readFileSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { adminClient, e2eUserId, openSavedImport, statusEmail, statusStorageState } from "./support";

// Story 2.4: "Kan lagas nu" or "Saknar N varor" in the library and the recipe
// view, with a tick or ring on every line, counted again when the pantry
// changes. The spec has an E2E user of its own (statusEmail): it saves the
// ugnspannkaka fixture (AI_PROVIDER=mock), whose seven lines all get catalog
// ingredients: bacon 140 g, 3 ägg, 6 dl mjölk, 2 1/2 dl vetemjöl, 1/2 tsk
// salt, and the vague "smör till formen" and "lingonsylt till servering",
// which never count. The pantry is seeded with the service role, by the saved
// lines' own catalog ingredients, or filled in Hemma. The tests build on each
// other and run in order.

const pannkaka = readFileSync("tests/fixtures/ai/ugnspannkaka.txt", "utf8");
const title = "Ugnspannkaka med bacon";
const mobile = { width: 375, height: 812 };
const recipePath = /\/recept\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test.use({ storageState: statusStorageState, viewport: mobile });
test.describe.configure({ mode: "serial" });

let userId = "";

test.beforeAll(async () => {
  userId = await e2eUserId(statusEmail);
  // A retry starts again from no recipes and an empty pantry.
  for (const table of ["pantry_item", "recipe"] as const) {
    const { error } = await adminClient().from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
});

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
const recipeRow = (page: Page) => page.getByTestId("recipe-card").filter({ visible: true }).filter({ hasText: title });
const view = (page: Page) => page.getByRole("article").filter({ visible: true });
const lines = (page: Page) => view(page).getByTestId("recipe-view-line");
const line = (page: Page, text: string) => lines(page).filter({ hasText: text });
const mark = (row: Locator) => row.getByRole("img");
const tab = (page: Page, name: "Recept" | "Matvaror") =>
  page.getByRole("navigation", { name: "Huvudmeny" }).getByRole("link", { name });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Lagervara" });

type SeedItem = { line: string; location: string; amount?: number; unit?: string };

/**
 * Sets the user's pantry to `items` with the service role. Each item names the
 * saved recipe line it is for ("140 g bacon"), and gets that line's catalog
 * ingredient; a line text with more than one ingredient fails the test.
 */
async function seedPantry(items: SeedItem[]) {
  const admin = adminClient();
  const lines = await admin.from("recipe_ingredient").select("original_text, ingredient_id").eq("user_id", userId);
  if (lines.error) throw lines.error;
  const ids = new Map<string, Set<string>>();
  for (const { original_text, ingredient_id } of lines.data as { original_text: string; ingredient_id: string | null }[]) {
    if (!ingredient_id) continue;
    ids.set(original_text, (ids.get(original_text) ?? new Set()).add(ingredient_id));
  }
  const removed = await admin.from("pantry_item").delete().eq("user_id", userId);
  if (removed.error) throw removed.error;
  const inserted = await admin.from("pantry_item").insert(
    items.map((item) => {
      const found = [...(ids.get(item.line) ?? [])];
      if (found.length !== 1) throw new Error(`"${item.line}" has ${found.length} catalog ingredients in the saved recipe`);
      return { user_id: userId, ingredient_id: found[0], location: item.location, amount: item.amount ?? null, unit: item.unit ?? null };
    }),
  );
  if (inserted.error) throw inserted.error;
}

/**
 * Bacon, eggs and salt are enough; there is too little milk (3 of 6 dl) and
 * flour only in kg, so two are short. Butter and lingonberry jam, both vague,
 * are not at home.
 */
const twoShort: SeedItem[] = [
  { line: "140 g bacon", location: "Kyl", amount: 140, unit: "g" },
  { line: "3 ägg", location: "Kyl", amount: 6, unit: "st" },
  { line: "6 dl mjölk", location: "Kyl", amount: 3, unit: "dl" },
  { line: "2 1/2 dl vetemjöl", location: "Skafferi", amount: 1, unit: "kg" },
  { line: "1/2 tsk salt", location: "Skafferi" },
];

/** Enough of every ingredient with an amount. */
const allAtHome: SeedItem[] = [
  { line: "140 g bacon", location: "Kyl", amount: 140, unit: "g" },
  { line: "3 ägg", location: "Kyl", amount: 6, unit: "st" },
  { line: "6 dl mjölk", location: "Kyl", amount: 6, unit: "dl" },
  { line: "2 1/2 dl vetemjöl", location: "Skafferi", amount: 3, unit: "dl" },
  { line: "1/2 tsk salt", location: "Skafferi" },
];

/** Adds an item in Matvaror through the sheet Lagervara and waits for the confirmation. */
async function addInLagersaldo(page: Page, name: string, amount: string, unit: string) {
  await page.getByRole("button", { name: "Lägg till vara" }).filter({ visible: true }).first().click();
  await sheet(page).getByRole("searchbox", { name: "Sök ingrediens" }).fill(name);
  await sheet(page).getByRole("button", { name: new RegExp(`^${name}$`, "i") }).click();
  await sheet(page).getByLabel("Mängd").fill(amount);
  await sheet(page).getByLabel("Enhet").selectOption(unit);
  await sheet(page).getByRole("button", { name: "Lägg till vara" }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByTestId("toast")).toContainText(new RegExp(`^${name} är sparad`, "i"));
}

test("a saved recipe with nothing at home says Saknar 5 varor, with a ring on every line", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/recept");
  await page.locator("header").getByRole("button", { name: "Importera recept" }).click();
  const importSheet = page.getByRole("dialog", { name: "Importera recept" });
  await importSheet.getByRole("tab", { name: "Text" }).click();
  await importSheet.getByLabel("Recepttext").fill(pannkaka);
  await importSheet.getByRole("button", { name: "Tolka" }).click();
  await openSavedImport(page, title);

  await expect(page).toHaveURL(recipePath);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  // Five ingredients with an amount; the two vague lines do not count.
  await expect(view(page).getByText(/^Saknar: .+ \+3$/)).toBeVisible();
  await expect(lines(page)).toHaveCount(7);
  for (const row of await lines(page).all()) await expect(mark(row)).toHaveAccessibleName("saknas");

  await page.goto("/recept");
  await expect(recipeRow(page).getByText("Saknar 5 varor", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("too little, or only another unit, counts as missing; a vague line is ringed but never counted", async ({ page }) => {
  const errors = watchErrors(page);
  await seedPantry(twoShort);
  await page.goto("/recept");
  await expect(recipeRow(page).getByText("Saknar 2 varor", { exact: true })).toBeVisible();

  await recipeRow(page).getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(recipePath);
  await expect(view(page).getByText(/^Saknar: [^,+]+, [^,+]+$/)).toBeVisible();
  await expect(mark(line(page, "bacon"))).toHaveAccessibleName("finns hemma");
  await expect(mark(line(page, "ägg"))).toHaveAccessibleName("finns hemma");
  await expect(mark(line(page, "salt"))).toHaveAccessibleName("finns hemma");
  await expect(mark(line(page, "mjölk"))).toHaveAccessibleName("saknas");
  // The flour is at home only in kg, which is shown beside the need.
  await expect(mark(line(page, "vetemjöl"))).toHaveAccessibleName("saknas");
  await expect(line(page, "vetemjöl").getByText("hemma: 1 kg")).toBeVisible();
  await expect(mark(line(page, "smör till formen"))).toHaveAccessibleName("saknas");
  expect(errors).toEqual([]);
});

test("adding what is missing in Matvaror makes the library and the recipe view say Kan lagas nu", async ({ page }) => {
  const errors = watchErrors(page);
  await seedPantry(twoShort);
  await page.goto("/recept");
  await expect(recipeRow(page).getByText("Saknar 2 varor", { exact: true })).toBeVisible();

  // Client navigation both ways, so the library shown again is the one the
  // save revalidated, not a fresh page load.
  await tab(page, "Matvaror").click();
  await expect(page).toHaveURL(/\/hemma$/);
  await addInLagersaldo(page, "mjölk", "6", "dl");
  await addInLagersaldo(page, "vetemjöl", "3", "dl");

  await tab(page, "Recept").click();
  await expect(page).toHaveURL(/\/recept$/);
  await expect(recipeRow(page).getByText("Kan lagas nu", { exact: true })).toBeVisible();

  await recipeRow(page).getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(recipePath);
  await expect(view(page).getByText("Kan lagas nu", { exact: true })).toBeVisible();
  for (const name of ["bacon", "ägg", "mjölk", "vetemjöl", "salt"]) {
    await expect(mark(line(page, name).first())).toHaveAccessibleName("finns hemma");
  }
  // The vague lines are still not at home, and still not counted.
  await expect(mark(line(page, "smör till formen"))).toHaveAccessibleName("saknas");
  await expect(mark(line(page, "lingonsylt till servering"))).toHaveAccessibleName("saknas");
  await expect(line(page, "vetemjöl").getByText(/^hemma:/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("removing an item in Matvaror makes the library and the recipe view say Saknar again", async ({ page }) => {
  const errors = watchErrors(page);
  await seedPantry(allAtHome);
  await page.goto("/recept");
  await expect(recipeRow(page).getByText("Kan lagas nu", { exact: true })).toBeVisible();

  await tab(page, "Matvaror").click();
  await expect(page).toHaveURL(/\/hemma/);
  const milk = page.getByTestId("pantry-row").filter({ visible: true }).filter({ hasText: /mjölk/i });
  await milk.click();
  await sheet(page).getByRole("button", { name: "Ta bort" }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByTestId("toast")).toContainText(/Tog bort mjölk\./i);
  await expect(milk).toHaveCount(0);

  await tab(page, "Recept").click();
  await expect(page).toHaveURL(/\/recept$/);
  await expect(recipeRow(page).getByText("Saknar 1 vara", { exact: true })).toBeVisible();
  await recipeRow(page).getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(recipePath);
  await expect(view(page).getByText("Saknar: mjölk", { exact: true })).toBeVisible();
  await expect(mark(line(page, "mjölk"))).toHaveAccessibleName("saknas");
  await expect(mark(line(page, "bacon"))).toHaveAccessibleName("finns hemma");
  expect(errors).toEqual([]);
});

test("changing a line in Ändra recept so it needs more than is at home updates the badge", async ({ page }) => {
  const errors = watchErrors(page);
  await seedPantry(allAtHome);
  await page.goto("/recept");
  await recipeRow(page).getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(recipePath);
  await expect(view(page).getByText("Kan lagas nu", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Fler val" }).click();
  await page.getByRole("menuitem", { name: "Ändra" }).click();
  const edit = page.getByRole("dialog", { name: "Ändra recept" });
  // 12 dl milk where 6 dl is at home.
  await edit.getByRole("button", { name: /^Ändra mängd för mjölk$/i }).click();
  await edit.getByLabel("Mängd").fill("12");
  await edit.getByRole("button", { name: "Spara ändringar" }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByTestId("toast")).toHaveText("Ändringarna är sparade.");

  await expect(view(page).getByText("Saknar: mjölk", { exact: true })).toBeVisible();
  await expect(mark(line(page, "mjölk"))).toHaveAccessibleName("saknas");
  await expect(line(page, "mjölk").getByText("hemma: 6 dl")).toBeVisible();
  // Story 4.3: the chip leads to the missing line, which says Saknas and takes focus.
  await view(page).getByRole("button", { name: "Saknar: mjölk" }).click();
  await expect(line(page, "mjölk")).toBeFocused();
  await expect(line(page, "mjölk").getByText("Saknas", { exact: true })).toBeVisible();
  await page.goto("/recept");
  await expect(recipeRow(page).getByText("Saknar 1 vara", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
