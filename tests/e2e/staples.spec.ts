import { expect, type Page, test } from "@playwright/test";
import { adminClient, e2eUserId, staplesEmail, staplesStorageState, thisMonday } from "./support";

// Basvaror (Pontus 2026-11-02): what the household always has at home is left
// out of the shopping list and never counts in "Saknar N varor"; a staple
// above its limit (baking) counts as before. The spec has an E2E user of its
// own (staplesEmail). A weeknight stew in the style of Linas Matkasse
// (olivolja, salt, svartpeppar, smör and paprikapulver among the lines) is on
// the plan; the household's staples start empty, so the recipe misses all
// eight with an amount, and Återställ standard in Inställningar → Basvaror brings the default
// list. Then a sponge cake with 5 dl vetemjöl joins the plan. The tests build
// on each other and run in order.

const mobile = { width: 390, height: 844 };
const stew = "Linas kycklinggryta med paprika";
const cake = "Sockerkaka";

test.use({ storageState: staplesStorageState, viewport: mobile });
test.describe.configure({ mode: "serial" });

let userId = "";
let householdId = "";
let planId = "";
const ids = new Map<string, string>();
const recipeIds: Record<string, string> = {};

const catalog: [string, string][] = [
  ["Olivolja", "Skafferi"],
  ["Gul lök", "Frukt och grönt"],
  ["Vitlök", "Frukt och grönt"],
  ["Kycklingfilé", "Kött och fisk"],
  ["Salt", "Skafferi"],
  ["Svartpeppar", "Skafferi"],
  ["Smör", "Mejeri"],
  ["Grädde", "Mejeri"],
  ["Paprikapulver", "Skafferi"],
  ["Vetemjöl", "Skafferi"],
  ["Socker", "Skafferi"],
  ["Ägg", "Mejeri"],
];

type SeedLine = { text: string; ingredient: string | null; amount: number | null; unit: string | null };

async function seedRecipe(title: string, lines: SeedLine[]): Promise<void> {
  const admin = adminClient();
  const recipe = await admin
    .from("recipe")
    .insert({ user_id: userId, title, original_servings: 4, total_minutes: 30, source_kind: "text" })
    .select("id")
    .single();
  if (recipe.error) throw recipe.error;
  recipeIds[title] = (recipe.data as { id: string }).id;
  const inserted = await admin.from("recipe_ingredient").insert(
    lines.map((line, position) => ({
      user_id: userId,
      recipe_id: recipeIds[title],
      position,
      original_text: line.text,
      amount: line.amount,
      unit: line.unit,
      is_vague: line.amount === null,
      ingredient_id: line.ingredient === null ? null : ids.get(line.ingredient),
    })),
  );
  if (inserted.error) throw inserted.error;
}

async function addDish(title: string, position: number): Promise<void> {
  const { error } = await adminClient().from("meal_plan_recipe").insert({
    user_id: userId,
    meal_plan_id: planId,
    recipe_id: recipeIds[title],
    recipe_title: title,
    servings: 4,
    position,
  });
  if (error) throw error;
}

/** The labels of the list's lines, as shown. */
async function listLabels(page: Page): Promise<string[]> {
  const rows = page.getByTestId("shopping-line").filter({ visible: true });
  await expect(rows.first()).toBeVisible();
  return (await rows.allTextContents()).map((text) => text.replace(/\s+/g, " ").trim());
}

test.beforeAll(async () => {
  userId = await e2eUserId(staplesEmail);
  const admin = adminClient();
  const member = await admin.from("household_member").select("household_id").eq("user_id", userId).single();
  if (member.error) throw member.error;
  householdId = (member.data as { household_id: string }).household_id;
  // A retry starts again from no plan, no recipes, an empty pantry and no staples.
  for (const table of ["shopping_custom_item", "shopping_check", "meal_plan", "pantry_item", "recipe"] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  const cleared = await admin.from("household_staple").delete().eq("household_id", householdId);
  if (cleared.error) throw cleared.error;

  const { data, error } = await admin
    .from("ingredient")
    .upsert(
      catalog.map(([name, section]) => ({
        user_id: userId,
        name,
        normalized_name: name.toLocaleLowerCase("sv-SE"),
        section,
        location: "Skafferi",
      })),
      { onConflict: "household_id,normalized_name" },
    )
    .select("id, name");
  if (error) throw error;
  for (const row of data as { id: string; name: string }[]) ids.set(row.name, row.id);

  await seedRecipe(stew, [
    { text: "2 msk olivolja", ingredient: "Olivolja", amount: 2, unit: "msk" },
    { text: "1 gul lök", ingredient: "Gul lök", amount: 1, unit: null },
    { text: "2 vitlöksklyftor", ingredient: "Vitlök", amount: 2, unit: "klyfta" },
    { text: "500 g kycklingfilé", ingredient: "Kycklingfilé", amount: 500, unit: "g" },
    { text: "1 msk paprikapulver", ingredient: "Paprikapulver", amount: 1, unit: "msk" },
    { text: "2 dl grädde", ingredient: "Grädde", amount: 2, unit: "dl" },
    { text: "2 msk smör", ingredient: "Smör", amount: 2, unit: "msk" },
    { text: "1 tsk salt", ingredient: "Salt", amount: 1, unit: "tsk" },
    { text: "svartpeppar efter smak", ingredient: "Svartpeppar", amount: null, unit: null },
    // As some recipes write it, without a catalog ingredient: matched by its text.
    { text: "Salt och peppar", ingredient: null, amount: null, unit: null },
  ]);
  await seedRecipe(cake, [
    { text: "5 dl vetemjöl", ingredient: "Vetemjöl", amount: 5, unit: "dl" },
    { text: "3 dl socker", ingredient: "Socker", amount: 3, unit: "dl" },
    { text: "100 g smör", ingredient: "Smör", amount: 100, unit: "g" },
    { text: "3 ägg", ingredient: "Ägg", amount: 3, unit: null },
  ]);
  const plan = await admin
    .from("meal_plan")
    .insert({ user_id: userId, name: "Veckan", is_current: true, week_start: thisMonday() })
    .select("id")
    .single();
  if (plan.error) throw plan.error;
  planId = (plan.data as { id: string }).id;
  await addDish(stew, 0);
});

test("without staples, the stew misses every catalog ingredient with an amount", async ({ page }) => {
  await page.goto(`/recept/${recipeIds[stew]}`);
  // Eight: "svartpeppar efter smak" is vague, and a vague line never counts in N.
  await expect(page.getByRole("button", { name: /Saknar 8 varor/ }).filter({ visible: true })).toBeVisible();
});

test("Inställningar → Basvaror: Återställ standard brings the default list, and a staple is added and removed with Ångra", async ({ page }) => {
  await page.goto("/installningar");
  await page.getByRole("link", { name: /Basvaror/ }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/installningar\/basvaror$/);
  await expect(page.getByText("Inga basvaror.", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Återställ standard" }).click();
  await page.getByRole("dialog", { name: "Återställ standardlistan?" }).getByRole("button", { name: "Återställ" }).click();
  const rows = page.getByTestId("staple");
  await expect(rows.filter({ hasText: "Salt" }).first()).toContainText("alltid");
  await expect(rows.filter({ hasText: "Vetemjöl" })).toContainText("upp till 1 dl");
  await expect(rows.filter({ hasText: "Smör" })).toContainText("upp till 50 g");

  await page.getByLabel("Namn").fill("Kardemumma");
  await page.getByLabel("Upp till, tomt för alltid").fill("1 tsk");
  await page.getByRole("button", { name: "Lägg till" }).click();
  await expect(rows.filter({ hasText: "Kardemumma" })).toContainText("upp till 1 tsk");

  await page.getByRole("button", { name: "Ta bort Kardemumma" }).click();
  await expect(rows.filter({ hasText: "Kardemumma" })).toHaveCount(0);
  await page.getByTestId("toast").getByRole("button", { name: /Ångra/ }).click();
  await expect(rows.filter({ hasText: "Kardemumma" })).toContainText("upp till 1 tsk");
});

test("with the defaults, the stew misses only what has to be bought", async ({ page }) => {
  await page.goto(`/recept/${recipeIds[stew]}`);
  const chip = page.getByRole("button", { name: /Saknar 4 varor/ }).filter({ visible: true });
  await expect(chip).toBeVisible();
  // Neither olivolja nor anything else of the household's staples is named.
  await expect(chip).toContainText("gul lök, vitlök +2");
  await expect(page.getByRole("img", { name: "basvara, finns hemma" }).filter({ visible: true })).toHaveCount(5);
});

test("the list leaves salt, peppar, olivolja, smör and paprikapulver out, and says so once", async ({ page }) => {
  await page.goto("/lista");
  const labels = await listLabels(page);
  for (const name of ["Gul lök", "Vitlök", "Kycklingfilé", "Grädde"]) expect(labels.some((label) => label.startsWith(name)), name).toBe(true);
  for (const name of ["Salt", "Svartpeppar", "Olivolja", "Smör", "Paprikapulver", "Salt och peppar"]) {
    expect(labels.some((label) => label.startsWith(name)), name).toBe(false);
  }
  const footer = page.getByTestId("staples-footer").filter({ visible: true });
  await expect(footer).toHaveText("Basvaror räknas inte med · Ändra");
  await footer.getByRole("link", { name: "Ändra" }).click();
  await expect(page).toHaveURL(/\/installningar\/basvaror$/);
});

test("baking: 5 dl vetemjöl, 3 dl socker and 100 g smör go on the list as before", async ({ page }) => {
  await addDish(cake, 1);
  await page.goto("/lista");
  const labels = await listLabels(page);
  for (const [name, amount] of [["Vetemjöl", "5 dl"], ["Socker", "3 dl"], ["Smör", "100 g"]]) {
    expect(labels.find((label) => label.startsWith(name)), name).toContain(amount);
  }
  // The stew's 2 msk smör is still left out: it is in another unit, a need of its own, within 50 g.
  expect(labels.filter((label) => label.startsWith("Smör"))).toHaveLength(1);
  await page.goto(`/recept/${recipeIds[cake]}`);
  await expect(page.getByRole("button", { name: /Saknar 4 varor/ }).filter({ visible: true })).toBeVisible();
});
