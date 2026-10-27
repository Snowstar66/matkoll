import { expect, type Page, test } from "@playwright/test";
import { normalizeIngredientText } from "@/features/catalog/domain/normalize";
import { adminClient, cookableEmail, cookableStorageState, e2eUserId } from "./support";

// Story 5.1: the filter Kan lagas nu ranks the library by N in "Saknar N
// varor", fewest first, with "Föreslå rätter med AI" at the bottom
// (ai-suggestions.spec.ts presses it). The spec has an E2E user of its own (cookableEmail). Before each test the pantry and
// the recipes are emptied, and three recipes named after the mock's fixtures
// are made with the service role, oldest first:
//
// - Röd linssoppa med kokosmjölk: 3 dl röda linser, 1 gul lök.
// - Krämig kycklinggryta med curry: 2 dl grädde, "salt efter smak" (vague)
//   and "2 citroner" (no catalog ingredient), which never count.
// - Fiskgratäng med räkor: 400 g torsk, 2 dl grädde.
//
// At home: 4 dl grädde. So N is 1, 0 and 2 newest first (fiskgratäng,
// gryta, soppa), and Kan lagas nu shows gryta, fiskgratäng, soppa.

const mobile = { width: 375, height: 812 };
const desktop = { width: 1280, height: 900 };
const soppa = "Röd linssoppa med kokosmjölk";
const gryta = "Krämig kycklinggryta med curry";
const fisk = "Fiskgratäng med räkor";

test.use({ storageState: cookableStorageState, viewport: mobile });
// One user for all the tests: each seeds it again, so they must not run at the same time.
test.describe.configure({ mode: "serial" });

let userId = "";

/** Upserts the catalog ingredients (they are never deleted) and returns their ids by name. */
async function seedIngredients(names: string[]): Promise<Map<string, string>> {
  const { data, error } = await adminClient()
    .from("ingredient")
    .upsert(
      names.map((name) => ({
        user_id: userId,
        name,
        normalized_name: normalizeIngredientText(name),
        section: "Övrigt",
        location: "Skafferi",
      })),
      { onConflict: "user_id,normalized_name" },
    )
    .select("id, name");
  if (error) throw error;
  const ids = new Map((data as { id: string; name: string }[]).map((row) => [row.name, row.id]));
  const missing = names.filter((name) => !ids.has(name));
  if (missing.length > 0) throw new Error(`The catalog upsert did not return ${missing.join(", ")}`);
  return ids;
}

type SeedLine = { text: string; amount: number | null; unit: string | null; isVague?: boolean; ingredientId: string | null };

/** Makes a recipe with its lines, created at `createdAt` (the library is newest first). */
async function seedRecipe(title: string, createdAt: string, lines: SeedLine[]) {
  const admin = adminClient();
  const recipe = await admin
    .from("recipe")
    .insert({ user_id: userId, title, original_servings: 4, total_minutes: 35, source_kind: "text", created_at: createdAt })
    .select("id")
    .single();
  if (recipe.error) throw recipe.error;
  const recipeId = (recipe.data as { id: string }).id;
  const inserted = await admin.from("recipe_ingredient").insert(
    lines.map((line, position) => ({
      user_id: userId,
      recipe_id: recipeId,
      position,
      original_text: line.text,
      amount: line.amount,
      unit: line.unit,
      is_vague: line.isVague ?? false,
      ingredient_id: line.ingredientId,
    })),
  );
  if (inserted.error) throw inserted.error;
}

test.beforeEach(async () => {
  userId = await e2eUserId(cookableEmail);
  const admin = adminClient();
  // Children before parents, so nothing relies on the cascades.
  for (const table of ["pantry_item", "recipe_ingredient", "recipe_step", "recipe"] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  const ids = await seedIngredients(["Röda linser", "Gul lök", "Grädde", "Salt", "Torsk"]);
  const id = (name: string) => ids.get(name)!;

  await seedRecipe(soppa, "2026-10-01T08:00:00Z", [
    { text: "3 dl röda linser", amount: 3, unit: "dl", ingredientId: id("Röda linser") },
    { text: "1 gul lök", amount: 1, unit: "st", ingredientId: id("Gul lök") },
  ]);
  await seedRecipe(gryta, "2026-10-02T08:00:00Z", [
    { text: "2 dl grädde", amount: 2, unit: "dl", ingredientId: id("Grädde") },
    { text: "salt efter smak", amount: null, unit: null, isVague: true, ingredientId: id("Salt") },
    { text: "2 citroner", amount: 2, unit: null, ingredientId: null },
  ]);
  await seedRecipe(fisk, "2026-10-03T08:00:00Z", [
    { text: "400 g torsk", amount: 400, unit: "g", ingredientId: id("Torsk") },
    { text: "2 dl grädde", amount: 2, unit: "dl", ingredientId: id("Grädde") },
  ]);

  const pantry = await admin
    .from("pantry_item")
    .insert({ user_id: userId, ingredient_id: id("Grädde"), location: "Kyl", amount: 4, unit: "dl" });
  if (pantry.error) throw pantry.error;
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
const rows = (page: Page) => page.getByTestId("recipe-card").filter({ visible: true });
const titles = (page: Page) => rows(page).getByRole("link");
const pill = (page: Page, name: "Alla" | "Favoriter" | "Kan lagas nu") =>
  page.getByRole("radio", { name }).filter({ visible: true });
const rankedList = (page: Page) => page.getByRole("list", { name: "Recept, minst saknat först" }).filter({ visible: true });
const tab = (page: Page, name: "Recept" | "Lagersaldo") =>
  page.getByRole("navigation", { name: "Huvudmeny" }).getByRole("link", { name });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Lagervara" });

/** The status on each visible row, in order. */
async function expectStatuses(page: Page, statuses: string[]) {
  await expect(rows(page)).toHaveCount(statuses.length);
  for (const [index, status] of statuses.entries()) {
    await expect(rows(page).nth(index).getByText(status, { exact: true })).toBeVisible();
  }
}

/** Waits for the answer to the next Server Action call (a POST with a Next-Action header). */
const actionAnswer = (page: Page) =>
  page.waitForResponse((response) => response.request().method() === "POST" && Boolean(response.request().headers()["next-action"]));

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("Kan lagas nu ranks the library fewest missing first and keeps the choice", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/recept");
  await expect(titles(page)).toHaveText([fisk, gryta, soppa]);

  await pill(page, "Kan lagas nu").click();
  await expect(pill(page, "Kan lagas nu")).toBeChecked();
  await expect(titles(page)).toHaveText([gryta, fisk, soppa]);
  await expectStatuses(page, ["Kan lagas nu", "Saknar 1 vara", "Saknar 2 varor"]);
  await expect(rankedList(page)).toBeVisible();
  // At the bottom, under the list.
  const suggest = page.getByRole("button", { name: "Föreslå rätter med AI" }).filter({ visible: true });
  await expect(suggest).toBeVisible();
  const [listBox, buttonBox] = [await rankedList(page).boundingBox(), await suggest.boundingBox()];
  expect(buttonBox!.y).toBeGreaterThanOrEqual(listBox!.y + listBox!.height);
  await expectNoHorizontalScroll(page);

  await page.reload();
  await expect(pill(page, "Kan lagas nu")).toBeChecked();
  await expect(titles(page)).toHaveText([gryta, fisk, soppa]);
  await expect(rankedList(page)).toBeVisible();

  await pill(page, "Alla").click();
  await expect(titles(page)).toHaveText([fisk, gryta, soppa]);
  await expect(page.getByRole("list", { name: "Recept", exact: true }).filter({ visible: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("adding an item in Lagersaldo ranks the library again", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/recept");
  await pill(page, "Kan lagas nu").click();
  await expect(titles(page)).toHaveText([gryta, fisk, soppa]);

  // Client navigation both ways, so the library shown again is the one the
  // save revalidated, not a fresh page load.
  await tab(page, "Lagersaldo").click();
  await expect(page).toHaveURL(/\/hemma$/);
  await page.getByRole("button", { name: "Lägg till vara" }).filter({ visible: true }).first().click();
  await sheet(page).getByRole("searchbox", { name: "Sök ingrediens" }).fill("torsk");
  await sheet(page).getByRole("button", { name: /^torsk$/i }).click();
  await sheet(page).getByLabel("Mängd").fill("400");
  await sheet(page).getByLabel("Enhet").selectOption("g");
  await sheet(page).getByRole("button", { name: "Lägg till vara" }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByTestId("toast")).toContainText(/^torsk är sparad/i);

  await tab(page, "Recept").click();
  await expect(page).toHaveURL(/\/recept$/);
  await expect(pill(page, "Kan lagas nu")).toBeChecked();
  // Two can be cooked now, newest first.
  await expect(titles(page)).toHaveText([fisk, gryta, soppa]);
  await expectStatuses(page, ["Kan lagas nu", "Kan lagas nu", "Saknar 2 varor"]);
  expect(errors).toEqual([]);
});

test("with an empty pantry the list is still ranked, with nothing to cook now", async ({ page }) => {
  const errors = watchErrors(page);
  const { error } = await adminClient().from("pantry_item").delete().eq("user_id", userId);
  if (error) throw error;
  await page.goto("/recept");
  await pill(page, "Kan lagas nu").click();
  await expect(titles(page)).toHaveText([gryta, fisk, soppa]);
  await expectStatuses(page, ["Saknar 1 vara", "Saknar 2 varor", "Saknar 2 varor"]);
  await expect(rows(page).getByText("Kan lagas nu", { exact: true })).toHaveCount(0);
  await expect(rankedList(page)).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.setViewportSize(desktop);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test("a search on Kan lagas nu shows the hits ranked", async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize(desktop);
  await page.goto("/recept");
  await pill(page, "Kan lagas nu").click();
  const field = page.getByRole("searchbox", { name: "Sök recept" });
  await field.fill("grädde");
  const answered = actionAnswer(page);
  await field.press("Enter");
  await answered;
  await expect(titles(page)).toHaveText([gryta, fisk]);
  await expectStatuses(page, ["Kan lagas nu", "Saknar 1 vara"]);
  await expect(rankedList(page)).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});
