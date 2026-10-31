import { expect, type Page, test } from "@playwright/test";
import { adminClient, e2eUserId, putInPantryEmail, putInPantryStorageState, thisMonday } from "./support";

// Story 3.7: "Lägg till i Matvaror". The spec has an E2E user of its own
// (putInPantryEmail), and each test makes its state with the service role:
// Krämig kycklinggryta for 4 portions (3 dl grädde, 2 paprikor, salt efter
// smak) on the current plan, 1 dl grädde in the pantry, and the own items
// "kaffe" (linked to Kaffe) and "diskmedel". The list is then Grädde 2 dl,
// Paprika 2 st and Salt ("Saknas i Matvaror"), with the two own items.

const mobile = { width: 375, height: 812 };
const gryta = "Krämig kycklinggryta";

test.use({ storageState: putInPantryStorageState, viewport: mobile });
test.describe.configure({ mode: "serial" });

let userId = "";
let ids = new Map<string, string>();
let recipeId = "";

const catalog = [
  { name: "Grädde", section: "Mejeri", location: "Kyl" },
  { name: "Paprika", section: "Frukt och grönt", location: "Kyl" },
  { name: "Salt", section: "Skafferi", location: "Skafferi" },
  { name: "Kaffe", section: "Skafferi", location: "Skafferi" },
];

test.beforeAll(async () => {
  userId = await e2eUserId(putInPantryEmail);
  // Catalog ingredients are never deleted: upserted, so a retry finds the same ones.
  const { data, error } = await adminClient()
    .from("ingredient")
    .upsert(
      catalog.map((item) => ({ user_id: userId, normalized_name: item.name.toLocaleLowerCase("sv-SE"), ...item })),
      { onConflict: "user_id,normalized_name" },
    )
    .select("id, name");
  if (error) throw error;
  ids = new Map((data as { id: string; name: string }[]).map((row) => [row.name, row.id]));
});

/** Starts each test from the same plan, recipe, own items and pantry. */
async function seed() {
  const admin = adminClient();
  for (const table of ["shopping_custom_item", "shopping_check", "meal_plan", "pantry_item", "recipe"] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  const recipe = await admin
    .from("recipe")
    .insert({ user_id: userId, title: gryta, original_servings: 4, total_minutes: 30, source_kind: "text" })
    .select("id")
    .single();
  if (recipe.error) throw recipe.error;
  recipeId = (recipe.data as { id: string }).id;
  const lines = await admin.from("recipe_ingredient").insert(
    [
      { text: "3 dl grädde", ingredient: "Grädde", amount: 3, unit: "dl" },
      { text: "2 paprikor", ingredient: "Paprika", amount: 2, unit: "st" },
      { text: "salt efter smak", ingredient: "Salt", amount: null, unit: null },
    ].map((line, position) => ({
      user_id: userId,
      recipe_id: recipeId,
      position,
      original_text: line.text,
      amount: line.amount,
      unit: line.unit,
      is_vague: line.amount === null,
      ingredient_id: ids.get(line.ingredient),
    })),
  );
  if (lines.error) throw lines.error;
  const plan = await admin.from("meal_plan").insert({ user_id: userId, name: "Vecka 44", is_current: true, week_start: thisMonday() }).select("id").single();
  if (plan.error) throw plan.error;
  const planId = (plan.data as { id: string }).id;
  const dish = await admin.from("meal_plan_recipe").insert({
    user_id: userId,
    meal_plan_id: planId,
    recipe_id: recipeId,
    recipe_title: gryta,
    servings: 4,
    position: 0,
  });
  if (dish.error) throw dish.error;
  const own = await admin.from("shopping_custom_item").insert([
    { user_id: userId, meal_plan_id: planId, label: "kaffe", ingredient_id: ids.get("Kaffe") },
    { user_id: userId, meal_plan_id: planId, label: "diskmedel" },
  ]);
  if (own.error) throw own.error;
  const pantry = await admin
    .from("pantry_item")
    .insert({ user_id: userId, ingredient_id: ids.get("Grädde"), location: "Kyl", amount: 1, unit: "dl" });
  if (pantry.error) throw pantry.error;
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
const lines = (page: Page) => page.getByTestId("shopping-line").filter({ visible: true });
const check = (page: Page, name: string) => page.getByRole("checkbox", { name, exact: true }).filter({ visible: true });
const putButton = (page: Page) => page.getByRole("button", { name: "Lägg till i Matvaror", exact: true }).filter({ visible: true });
const toast = (page: Page) => page.getByTestId("toast");
/** Unfolds I korgen, where the checked lines are (Story 11.4). */
const showBasket = async (page: Page) => {
  // I korgen is open from the start (Story 3.9): "Visa" only when it was folded.
  const show = page.getByRole("button", { name: /^Visa I korgen/ }).filter({ visible: true });
  if ((await show.count()) > 0) await show.click();
};
const tab = (page: Page, name: "Recept" | "Matvaror" | "Inköpslista") =>
  page.getByRole("navigation", { name: "Huvudmeny" }).getByRole("link", { name });

test.beforeEach(async () => {
  await seed();
});

test("the button shows once a line is checked off, and goes when the check comes off", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/lista");
  await expect(lines(page)).toHaveCount(5);
  await expect(putButton(page)).toHaveCount(0);
  await check(page, "Grädde, 2 dl").click();
  await expect(putButton(page)).toBeVisible();
  // The checked line is in I korgen (Story 11.4); a check there takes it back.
  await showBasket(page);
  await check(page, "Grädde, 2 dl").click();
  await expect(putButton(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Lägg till i Matvaror puts the checked lines in the pantry, takes them off the list, and the recipe can be cooked", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto("/lista");
  for (const name of ["Grädde, 2 dl", "Paprika, 2 st", "Salt", "kaffe", "diskmedel"]) {
    // From the keyboard: clicks on other lines in quick succession would be taken as a double click (Story 11.4).
    await check(page, name).press("Space");
    // Moved to I korgen at once, which is open (Story 3.9): still there, checked.
    await expect(check(page, name)).toBeChecked();
  }
  await expect(page.getByTestId("list-progress").filter({ visible: true })).toHaveText("Allt ligger i korgen");
  await putButton(page).click();
  await expect(toast(page)).toContainText("Lagt 4 varor: 2 i kyl, 2 i skafferi.");
  await expect(lines(page)).toHaveCount(0);
  await expect(page.getByText("Allt finns hemma.").filter({ visible: true })).toBeVisible();
  await expect(putButton(page)).toHaveCount(0);

  // Matvaror: the catalog's locations, increased or created, and unlimited for salt and kaffe.
  await tab(page, "Matvaror").click();
  await expect(page).toHaveURL(/\/hemma/);
  // Story 11.3: the rows show "Tillagd …" and no amount, so the amounts are read from the table.
  const rows = page.getByTestId("pantry-row").filter({ visible: true });
  await expect(rows.filter({ hasText: "Grädde" })).toBeVisible();
  await expect(rows.filter({ hasText: "Paprika" })).toBeVisible();
  await page.goto("/hemma?plats=skafferi");
  await expect(rows.filter({ hasText: "Salt" })).toBeVisible();
  await expect(rows.filter({ hasText: "Kaffe" })).toBeVisible();
  const stored = await adminClient()
    .from("pantry_item")
    .select("location, amount, unit, ingredient!inner(name)")
    .eq("user_id", userId);
  if (stored.error) throw stored.error;
  const amounts = Object.fromEntries(
    (stored.data as unknown as { location: string; amount: number | null; unit: string | null; ingredient: { name: string } }[]).map(
      (row) => [row.ingredient.name, `${row.location} ${row.amount === null ? "obegränsad" : `${Number(row.amount)} ${row.unit}`}`],
    ),
  );
  expect(amounts).toMatchObject({
    Grädde: "Kyl 3 dl",
    Paprika: "Kyl 2 st",
    Salt: "Skafferi obegränsad",
    Kaffe: "Skafferi obegränsad",
  });

  // The status is counted again.
  await page.goto(`/recept/${recipeId}`);
  await expect(page.getByRole("article").filter({ visible: true }).getByText("Kan lagas nu", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("only own items without a catalog ingredient are taken off the list, and the rest stays", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/lista");
  await check(page, "diskmedel").click();
  await showBasket(page);
  await expect(check(page, "diskmedel")).toBeChecked();
  await putButton(page).click();
  await expect(toast(page)).toHaveText("Tog bort 1 vara från listan.");
  await expect(lines(page)).toHaveCount(4);
  await expect(lines(page).filter({ hasText: "diskmedel" })).toHaveCount(0);
  // I korgen goes with its last line.
  await expect(page.getByTestId("basket-row").filter({ visible: true })).toHaveCount(0);
  for (const name of ["Grädde, 2 dl", "Paprika, 2 st", "Salt", "kaffe"]) {
    await expect(check(page, name)).not.toBeChecked();
  }
  // Nothing went to the pantry.
  const { data, error } = await adminClient().from("pantry_item").select("amount").eq("user_id", userId);
  if (error) throw error;
  expect(data).toEqual([{ amount: 1 }]);
  expect(errors).toEqual([]);
});

test("Story 16.18: Ändra opens Packa upp, and one tap moves a single item while the rest stays", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/lista");
  for (const name of ["Grädde, 2 dl", "Paprika, 2 st", "Salt"]) {
    await check(page, name).press("Space");
    await expect(check(page, name)).toBeChecked();
  }
  await putButton(page).click();
  await expect(toast(page)).toContainText("Lagt 3 varor: 2 i kyl, 1 i skafferi.");
  await toast(page).getByRole("button", { name: "Ändra" }).click();

  const sheet = page.getByRole("dialog", { name: "Packa upp" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("unpack-item")).toHaveCount(3);
  // One tap on a place; nothing else is asked.
  await sheet.getByRole("radiogroup", { name: "Plats för Paprika" }).getByRole("radio", { name: "Frys" }).click();
  await expect(sheet.getByRole("radiogroup", { name: "Plats för Paprika" }).getByRole("radio", { name: "Frys" })).toBeChecked();
  await expect
    .poll(async () => {
      const stored = await adminClient()
        .from("pantry_item")
        .select("location, amount, unit, ingredient!inner(name)")
        .eq("user_id", userId);
      if (stored.error) throw stored.error;
      return (stored.data as unknown as { location: string; amount: number | null; ingredient: { name: string } }[])
        .map((row) => `${row.ingredient.name} ${row.location} ${row.amount === null ? "obegränsad" : Number(row.amount)}`)
        .sort();
    })
    .toEqual(["Grädde Kyl 3", "Paprika Frys 2", "Salt Skafferi obegränsad"]);
  await sheet.getByRole("button", { name: "Klar" }).click();
  await expect(sheet).toBeHidden();
  expect(errors).toEqual([]);
});
