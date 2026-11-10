import { expect, type Page, test } from "@playwright/test";
import { normalizeIngredientText } from "@/features/catalog/domain/normalize";
import { adminClient, clearFoodProfiles, cookableEmail, cookableStorageState, e2eUserId, chooseUnit, seedFoodProfile } from "./support";

// Story 5.1 (changed): the filter Kan lagas nu shows only the recipes with
// nothing missing; "Nästan (N)" holds those missing one or two, naming what. The spec has an E2E user of its own (cookableEmail). Before each test the pantry and
// the recipes are emptied, and three recipes named after the mock's fixtures
// are made with the service role, oldest first:
//
// - Röd linssoppa med kokosmjölk: 3 dl röda linser, 1 gul lök.
// - Krämig kycklinggryta med curry: 2 dl grädde, "salt efter smak" (vague)
//   and "2 citroner" (no catalog ingredient), which never count.
// - Fiskgratäng med räkor: 400 g torsk, 2 dl grädde.
//
// At home: 4 dl grädde. So N is 1, 0 and 2 newest first (fiskgratäng,
// gryta, soppa), and Kan lagas nu shows gryta alone, with fiskgratäng and soppa under Nästan.

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
      { onConflict: "household_id,normalized_name" },
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
  // Nobody has preferences unless a test says so.
  await clearFoodProfiles(userId);
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
const pill = (page: Page, name: "Favoriter" | "Kan lagas nu") =>
  page.getByRole("button", { name }).filter({ visible: true });

/** "Alla" has no chip (Story 19.3): letting go of the chosen filter chip shows every recipe. */
const showAll = async (page: Page) => {
  for (const name of ["Favoriter", "Kan lagas nu"]) {
    const chip = page.getByRole("button", { name, pressed: true }).filter({ visible: true });
    if ((await chip.count()) > 0) await chip.click();
  }
};
const nearlyToggle = (page: Page, count: number) => page.getByRole("button", { name: `Nästan (${count})` }).filter({ visible: true });
const nearlyRows = (page: Page) => page.getByTestId("nearly-row").filter({ visible: true });
const tab = (page: Page, name: "Recept" | "Matvaror") =>
  page.getByRole("navigation", { name: "Huvudmeny" }).getByRole("link", { name });
const sheet = (page: Page) => page.getByRole("dialog");

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

test("Kan lagas nu shows only what can be cooked, with Nästan below, and keeps the choice", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/recept");
  await expect(titles(page)).toHaveText([fisk, gryta, soppa]);

  await pill(page, "Kan lagas nu").click();
  await expect(pill(page, "Kan lagas nu")).toHaveAttribute("aria-pressed", "true");
  await expect(titles(page)).toHaveText([gryta]);
  await expectStatuses(page, ["Kan lagas nu"]);
  await expect(nearlyToggle(page, 2)).toHaveAttribute("aria-expanded", "false");
  await expect(nearlyRows(page)).toHaveCount(0);
  await nearlyToggle(page, 2).click();
  await expect(nearlyRows(page)).toHaveCount(2);
  await expect(nearlyRows(page).nth(0)).toContainText(fisk);
  await expect(nearlyRows(page).nth(0)).toContainText("Saknar torsk");
  await expect(nearlyRows(page).nth(1)).toContainText(soppa);
  await expect(nearlyRows(page).nth(1)).toContainText("Saknar röda linser, gul lök");
  await expectNoHorizontalScroll(page);

  await page.reload();
  await expect(pill(page, "Kan lagas nu")).toHaveAttribute("aria-pressed", "true");
  await expect(titles(page)).toHaveText([gryta]);

  await showAll(page);
  await expect(titles(page)).toHaveText([fisk, gryta, soppa]);
  await expect(page.getByRole("list", { name: "Recept", exact: true }).filter({ visible: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("hushållets preferenser: the cards and the recipe page note an allergy, an Undviker and an Älskar, and rank the library lightly", async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => localStorage.setItem("livskoll-option-showFit", "0"));
  await seedFoodProfile(userId, { allergies: ["laktos"], dislikes: ["linser"], likes: ["torsk"] });
  await page.goto("/recept");
  // Without notes the order is newest first (fisk, gryta, soppa); an Undviker goes before an allergy, nothing is left out.
  await expect(titles(page)).toHaveText([soppa, fisk, gryta]);
  const noteTexts = (title: string) => rows(page).filter({ hasText: title }).getByTestId("preference-notes").locator("[data-kind]").allTextContents();
  expect(await noteTexts(soppa)).toEqual([expect.stringMatching(/undviker linser$/)]);
  expect(await noteTexts(fisk)).toEqual([expect.stringMatching(/^Kan innehålla laktos \(/), expect.stringMatching(/älskar torsk$/)]);
  expect(await noteTexts(gryta)).toEqual([expect.stringMatching(/^Kan innehålla laktos \(/)]);
  await expect(rows(page).filter({ hasText: gryta }).locator('[data-kind="allergy"]')).toHaveCSS("font-weight", "600");
  await expectNoHorizontalScroll(page);
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/preferenser-recept.png` });

  await rows(page).filter({ hasText: soppa }).getByRole("link").click();
  await expect(page.getByRole("heading", { name: soppa, level: 1 })).toBeVisible();
  await expect(page.getByTestId("preference-notes").filter({ visible: true })).toContainText(/undviker linser/);

  // Nothing filled in again: no notes anywhere and the usual order.
  await clearFoodProfiles(userId);
  await page.goto("/recept");
  await expect(titles(page)).toHaveText([fisk, gryta, soppa]);
  await expect(page.getByTestId("preference-notes")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Visa vem rätten passar: dots for those who stand out replace the notes, nothing when everyone fits, and the notes return when it is off", async ({ page }) => {
  const errors = watchErrors(page);
  await seedFoodProfile(userId, { allergies: ["laktos"], dislikes: ["linser"], likes: ["torsk"] });
  await page.goto("/recept");
  const row = (title: string) => rows(page).filter({ hasText: title });
  // An allergy is a red ring with the word; an Undviker is a sand dot; a lover is mint. No grey or green note is left.
  await expect(row(gryta).getByTestId("fit-dot")).toHaveAttribute("data-kind", "allergy");
  await expect(row(gryta).getByTestId("fit-allergy-word")).toHaveText("Laktos");
  await expect(row(soppa).getByTestId("fit-dot")).toHaveAttribute("data-kind", "avoid");
  await expect(row(fisk).getByTestId("fit-dot").first()).toHaveAttribute("data-kind", "allergy");
  await expect(page.getByTestId("preference-notes")).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/passar-recept.png` });

  // The recipe page: the row is a button of at least 44 px that opens the sentence.
  await row(soppa).getByRole("link").click();
  const toggle = page.getByTestId("fit-row").filter({ visible: true }).getByRole("button");
  expect((await toggle.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await toggle.click();
  await expect(page.getByTestId("fit-details")).toContainText(/undviker linser/);
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/passar-receptsida.png` });

  // Switched off under Tillval: today's notes.
  await page.evaluate(() => localStorage.setItem("livskoll-option-showFit", "0"));
  await page.goto("/recept");
  await expect(page.getByTestId("fit-dot")).toHaveCount(0);
  await expect(row(gryta).getByTestId("preference-notes")).toContainText("Kan innehålla laktos");

  // Everyone neutral: no row at all, with the option on.
  await page.evaluate(() => localStorage.removeItem("livskoll-option-showFit"));
  await clearFoodProfiles(userId);
  await page.goto("/recept");
  await expect(titles(page)).toHaveCount(3);
  await expect(page.getByTestId("fit-row")).toHaveCount(0);
  await expect(page.getByTestId("preference-notes")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("adding an item in Matvaror makes another recipe cookable", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/recept");
  await pill(page, "Kan lagas nu").click();
  await expect(titles(page)).toHaveText([gryta]);

  // Client navigation both ways, so the library shown again is the one the
  // save revalidated, not a fresh page load.
  await tab(page, "Matvaror").click();
  await expect(page).toHaveURL(/\/hemma$/);
  await page.getByRole("button", { name: "Lägg till vara" }).filter({ visible: true }).first().click();
  await sheet(page).getByRole("searchbox", { name: "Sök vara" }).fill("torsk");
  await sheet(page).getByRole("button", { name: /^torsk$/i }).click();
  await sheet(page).getByLabel("Mängd").fill("400");
  await chooseUnit(sheet(page), "g");
  await sheet(page).getByRole("button", { name: "Lägg till vara" }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByTestId("toast")).toContainText(/^torsk är sparad/i);

  await tab(page, "Recept").click();
  await expect(page).toHaveURL(/\/recept$/);
  await expect(pill(page, "Kan lagas nu")).toHaveAttribute("aria-pressed", "true");
  // Two can be cooked now, newest first.
  await expect(titles(page)).toHaveText([fisk, gryta]);
  await expectStatuses(page, ["Kan lagas nu", "Kan lagas nu"]);
  await expect(nearlyToggle(page, 1)).toBeVisible();
  expect(errors).toEqual([]);
});

test("with an empty pantry nothing can be cooked now, and Nästan has all three", async ({ page }) => {
  const errors = watchErrors(page);
  const { error } = await adminClient().from("pantry_item").delete().eq("user_id", userId);
  if (error) throw error;
  await page.goto("/recept");
  await pill(page, "Kan lagas nu").click();
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByText("Inget kan lagas helt just nu.").filter({ visible: true })).toBeVisible();
  await nearlyToggle(page, 3).click();
  await expect(nearlyRows(page)).toHaveCount(3);
  await expect(nearlyRows(page).first()).toContainText("Saknar grädde");
  await expectNoHorizontalScroll(page);

  await page.setViewportSize(desktop);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test("a search on Kan lagas nu shows only the hits that can be cooked", async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize(desktop);
  await page.goto("/recept");
  await pill(page, "Kan lagas nu").click();
  const field = page.getByRole("searchbox", { name: "Sök recept" });
  await field.fill("grädde");
  const answered = actionAnswer(page);
  await field.press("Enter");
  await answered;
  await expect(titles(page)).toHaveText([gryta]);
  await expectStatuses(page, ["Kan lagas nu"]);
  await expect(nearlyToggle(page, 1)).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});
