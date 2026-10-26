import { expect, type Locator, type Page, type Response, test } from "@playwright/test";
import { adminClient, e2eUserId, shoppingEmail, shoppingStorageState } from "./support";

// Story 3.3: Inköpslista, counted from the current meal plan, its recipes and
// the pantry every time it is read. Story 3.4: checking lines off, saved at
// once. Story 3.5: Pontus's own items, added, checked, removed and put back
// with "Ångra". The spec has an E2E user of its own
// (shoppingEmail), which the later list stories share; everything is made
// with the service role before the tests. Two recipes for 4 portions:
// Krämig kycklinggryta (2 dl grädde, 1 paprika, salt efter smak) and Paj
// (1 dl grädde, 2 dl mjöl, "En näve persilja" without a catalog
// ingredient), with 1 kg mjöl in the pantry. The tests build on each other
// and run in order.

const mobile = { width: 375, height: 812 };
const gryta = "Krämig kycklinggryta";
const paj = "Paj";

test.use({ storageState: shoppingStorageState, viewport: mobile });
test.describe.configure({ mode: "serial" });

let userId = "";
let ids = new Map<string, string>();
const recipeIds: Record<string, string> = {};
let persiljaLineId = "";

const sectionOf: Record<string, string> = {
  Grädde: "Mejeri",
  Mjöl: "Skafferi",
  Salt: "Skafferi",
  Paprika: "Frukt och grönt",
};

/** Upserts the catalog ingredients (they are never deleted) and returns their ids by name. */
async function seedIngredients(names: string[]): Promise<Map<string, string>> {
  const { data, error } = await adminClient()
    .from("ingredient")
    .upsert(
      names.map((name) => ({
        user_id: userId,
        name,
        normalized_name: name.toLocaleLowerCase("sv-SE"),
        section: sectionOf[name],
        location: "Kyl",
      })),
      { onConflict: "user_id,normalized_name" },
    )
    .select("id, name");
  if (error) throw error;
  return new Map((data as { id: string; name: string }[]).map((row) => [row.name, row.id]));
}

type SeedLine = { text: string; ingredient: string | null; amount: number | null; unit: string | null };

async function seedRecipe(title: string, lines: SeedLine[]): Promise<{ id: string; lineIds: string[] }> {
  const admin = adminClient();
  const recipe = await admin
    .from("recipe")
    .insert({ user_id: userId, title, original_servings: 4, total_minutes: 30, source_kind: "text" })
    .select("id")
    .single();
  if (recipe.error) throw recipe.error;
  const id = (recipe.data as { id: string }).id;
  const inserted = await admin
    .from("recipe_ingredient")
    .insert(
      lines.map((line, position) => ({
        user_id: userId,
        recipe_id: id,
        position,
        original_text: line.text,
        amount: line.amount,
        unit: line.unit,
        is_vague: line.amount === null,
        ingredient_id: line.ingredient === null ? null : ids.get(line.ingredient),
      })),
    )
    .select("id, position");
  if (inserted.error) throw inserted.error;
  const rows = (inserted.data as { id: string; position: number }[]).sort((a, b) => a.position - b.position);
  recipeIds[title] = id;
  return { id, lineIds: rows.map((row) => row.id) };
}

async function addPantry(ingredient: string, amount: number | null, unit: string | null, location = "Kyl") {
  const { error } = await adminClient()
    .from("pantry_item")
    .insert({ user_id: userId, ingredient_id: ids.get(ingredient), location, amount, unit });
  if (error) throw error;
}

test.beforeAll(async () => {
  userId = await e2eUserId(shoppingEmail);
  const admin = adminClient();
  // A retry starts again from no plan, no recipes and an empty pantry.
  for (const table of ["meal_plan", "pantry_item", "recipe"] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  ids = await seedIngredients(["Grädde", "Mjöl", "Salt", "Paprika"]);
  await seedRecipe(gryta, [
    { text: "2 dl grädde", ingredient: "Grädde", amount: 2, unit: "dl" },
    { text: "1 paprika", ingredient: "Paprika", amount: 1, unit: null },
    { text: "salt efter smak", ingredient: "Salt", amount: null, unit: null },
  ]);
  const pie = await seedRecipe(paj, [
    { text: "1 dl grädde", ingredient: "Grädde", amount: 1, unit: "dl" },
    { text: "2 dl mjöl", ingredient: "Mjöl", amount: 2, unit: "dl" },
    { text: "En näve persilja", ingredient: null, amount: null, unit: null },
  ]);
  persiljaLineId = pie.lineIds[2];
  await addPantry("Mjöl", 1, "kg", "Skafferi");
});

/**
 * Sets the current plan's checks to exactly these lines (by ingredient and
 * unit) with the service role, so each test starts from a known state.
 */
async function seedChecks(checked: [ingredient: string, unit: string][]) {
  const admin = adminClient();
  const removed = await admin.from("shopping_check").delete().eq("user_id", userId);
  if (removed.error) throw removed.error;
  if (checked.length === 0) return;
  const plan = await admin.from("meal_plan").select("id").eq("user_id", userId).eq("is_current", true).single();
  if (plan.error) throw plan.error;
  const { error } = await admin.from("shopping_check").insert(
    checked.map(([ingredient, unit]) => ({
      user_id: userId,
      meal_plan_id: (plan.data as { id: string }).id,
      line_key: `r:${ids.get(ingredient)}:${unit}`,
    })),
  );
  if (error) throw error;
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
const lineOf = (page: Page, label: string) => lines(page).filter({ has: page.getByText(label, { exact: true }) });
const summary = (page: Page) => page.getByTestId("list-summary").filter({ visible: true });
const sectionHeadings = (page: Page) => page.getByRole("heading", { level: 2 }).filter({ visible: true });
const check = (page: Page, name: string) => page.getByRole("checkbox", { name, exact: true }).filter({ visible: true });
const tab = (page: Page, name: "Matsedel" | "Lista") =>
  page.getByRole("navigation", { name: "Huvudmeny" }).getByRole("link", { name });

/** Waits until `count` Server Action calls started after this point have answered. */
async function actionsAnswered(page: Page, count: number, act: () => Promise<void>) {
  let answered = 0;
  const seen = (response: Response) => {
    if (response.request().method() === "POST" && "next-action" in response.request().headers()) answered += 1;
  };
  page.on("response", seen);
  await act();
  await expect.poll(() => answered).toBeGreaterThanOrEqual(count);
  page.off("response", seen);
}

test("without a meal plan the list says to put dishes on it", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/lista");
  await expect(page.getByRole("heading", { name: "Inköpslista", level: 1 })).toBeVisible();
  await expect(page.getByText("Lägg rätter på matsedeln så räknas listan fram.").filter({ visible: true })).toBeVisible();
  await expect(summary(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the list groups the lines by section, with från [rätt], the pantry beside and Finns hemma?", async ({ page }) => {
  const admin = adminClient();
  const plan = await admin
    .from("meal_plan")
    .insert({ user_id: userId, name: "Vecka 44", is_current: true })
    .select("id")
    .single();
  if (plan.error) throw plan.error;
  const dishes = await admin.from("meal_plan_recipe").insert(
    [gryta, paj].map((title, position) => ({
      user_id: userId,
      meal_plan_id: (plan.data as { id: string }).id,
      recipe_id: recipeIds[title],
      recipe_title: title,
      servings: 4,
      position,
    })),
  );
  if (dishes.error) throw dishes.error;
  await seedChecks([]);

  const errors = watchErrors(page);
  await page.goto("/lista");
  await expect(summary(page)).toHaveText("Vecka 44 · 2 rätter · 5 varor kvar");
  await expect(sectionHeadings(page)).toHaveText(["Frukt och grönt", "Mejeri", "Skafferi", "Övrigt"]);
  await expect(lines(page)).toHaveCount(5);
  // An amount without unit counts as st.
  await expect(lineOf(page, "Paprika")).toContainText(`från ${gryta}`);
  await expect(lineOf(page, "Paprika")).toContainText("1 st");
  // 2 dl and 1 dl from two dishes is one line.
  await expect(lineOf(page, "Grädde")).toContainText(`från ${gryta}, ${paj}`);
  await expect(lineOf(page, "Grädde")).toContainText("3 dl");
  // 1 kg at home is never converted into dl.
  await expect(lineOf(page, "Mjöl")).toContainText("2 dl (hemma: 1 kg)");
  await expect(lineOf(page, "Salt")).toContainText("Finns hemma?");
  // A line without a catalog ingredient, with its own text, under Övrigt.
  const other = page.getByRole("region", { name: "Övrigt" }).filter({ visible: true });
  await expect(other.getByTestId("shopping-line")).toHaveText([`En näve persilja från ${paj}`]);
  expect(errors).toEqual([]);
});

test("a check is saved at once, stays after a reload, keeps the line in its place and comes off again", async ({ page }) => {
  await seedChecks([]);
  const errors = watchErrors(page);
  await page.goto("/lista");
  await expect(summary(page)).toHaveText("Vecka 44 · 2 rätter · 5 varor kvar");
  const order = await lines(page).evaluateAll((rows) => rows.map((row) => row.getAttribute("data-line-key")));
  // The check's name is the line and what it shows; the state is read out beside it.
  await expect(check(page, "Salt, finns hemma?")).not.toBeChecked();
  await expect(check(page, "Mjöl, 2 dl (hemma: 1 kg)")).not.toBeChecked();

  await actionsAnswered(page, 1, () => check(page, "Paprika, 1 st").click());
  await expect(check(page, "Paprika, 1 st")).toBeChecked();
  await expect(summary(page)).toHaveText("Vecka 44 · 2 rätter · 4 varor kvar");
  await expect(lineOf(page, "Paprika").getByText("Paprika", { exact: true })).toHaveCSS("text-decoration-line", "line-through");
  // The tap target is 44 × 44 px.
  const box = await check(page, "Paprika, 1 st").boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);

  await page.reload();
  await expect(check(page, "Paprika, 1 st")).toBeChecked();
  await expect(summary(page)).toHaveText("Vecka 44 · 2 rätter · 4 varor kvar");
  expect(await lines(page).evaluateAll((rows) => rows.map((row) => row.getAttribute("data-line-key")))).toEqual(order);

  await actionsAnswered(page, 1, () => check(page, "Paprika, 1 st").click());
  await expect(check(page, "Paprika, 1 st")).not.toBeChecked();
  await page.reload();
  await expect(check(page, "Paprika, 1 st")).not.toBeChecked();
  await expect(summary(page)).toHaveText("Vecka 44 · 2 rätter · 5 varor kvar");

  await actionsAnswered(page, 1, () => check(page, "Grädde, 3 dl").click());
  await expect(check(page, "Grädde, 3 dl")).toBeChecked();
  expect(errors).toEqual([]);
});

test("more servings on Matsedel count the list again", async ({ page }) => {
  await seedChecks([["Grädde", "dl"]]);
  const errors = watchErrors(page);
  await page.goto("/lista");
  await expect(lineOf(page, "Grädde")).toContainText("3 dl");

  await tab(page, "Matsedel").click();
  await expect(page).toHaveURL(/\/matsedel$/);
  const dish = page.getByTestId("plan-dish").filter({ visible: true }).filter({ hasText: gryta });
  for (const servings of [5, 6]) {
    await actionsAnswered(page, 1, () => dish.getByRole("button", { name: `Fler portioner, ${gryta}` }).click());
    await expect(dish.getByText(`${servings} portioner`)).toBeVisible();
  }

  await tab(page, "Lista").click();
  await expect(page).toHaveURL(/\/lista$/);
  // 2 dl for 4 is 3 dl for 6, and 1 dl from Paj: the same line, still checked.
  await expect(lineOf(page, "Grädde")).toContainText("4 dl");
  await expect(check(page, "Grädde, 4 dl")).toBeChecked();
  // 1.5 paprikor are bought as 2.
  await expect(lineOf(page, "Paprika")).toContainText("2 st");
  // Coming back to the list is not a recount while it is open: nothing is announced.
  // Read at once, not retried: the text would otherwise be cleared after a few seconds anyway.
  expect(await page.getByTestId("list-announcement").filter({ visible: true }).textContent()).toBe("");
  expect(errors).toEqual([]);
});

test("what is at home is taken off when the pantry changes", async ({ page }) => {
  await addPantry("Grädde", 3, "dl");
  await addPantry("Salt", null, null, "Skafferi");
  await seedChecks([["Grädde", "dl"]]);
  const errors = watchErrors(page);
  await page.goto("/lista");
  // 4 dl needed, 3 dl at home; salt is at home. Grädde is checked, so not left.
  await expect(lineOf(page, "Grädde")).toContainText("1 dl");
  await expect(check(page, "Grädde, 1 dl")).toBeChecked();
  await expect(lineOf(page, "Salt")).toHaveCount(0);
  await expect(summary(page)).toHaveText("Vecka 44 · 2 rätter · 3 varor kvar");

  await addPantry("Grädde", 1, "dl", "Frys");
  await page.reload();
  await expect(lineOf(page, "Grädde")).toHaveCount(0);

  // The check stays without its line, and applies again when the line comes back.
  const admin = adminClient();
  const frys = await admin.from("pantry_item").delete().eq("user_id", userId).eq("location", "Frys");
  if (frys.error) throw frys.error;
  await page.reload();
  await expect(check(page, "Grädde, 1 dl")).toBeChecked();
  await addPantry("Grädde", 1, "dl", "Frys");
  expect(errors).toEqual([]);
});

test("the list says everything is at home when nothing is short", async ({ page }) => {
  await addPantry("Paprika", 2, "st", "Kyl");
  await addPantry("Mjöl", 5, "dl", "Skafferi");
  const { error } = await adminClient().from("recipe_ingredient").delete().eq("id", persiljaLineId);
  if (error) throw error;
  await seedChecks([]);

  const errors = watchErrors(page);
  await page.goto("/lista");
  await expect(page.getByText("Allt finns hemma.").filter({ visible: true })).toBeVisible();
  await expect(summary(page)).toHaveText("Vecka 44 · 2 rätter · 0 varor kvar");
  await expect(lines(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

// Story 3.5: Pontus's own items. Each test sets the current plan's own items
// and checks itself; the plan, its dishes and the pantry are as the tests
// above left them (everything the dishes need is at home).

/** Sets the current plan's own items to exactly these, with the service role; returns their ids by text. */
async function seedCustomItems(
  items: { label: string; ingredient?: string; amount?: number; unit?: string }[],
): Promise<Map<string, string>> {
  const admin = adminClient();
  const removed = await admin.from("shopping_custom_item").delete().eq("user_id", userId);
  if (removed.error) throw removed.error;
  if (items.length === 0) return new Map();
  const plan = await admin.from("meal_plan").select("id").eq("user_id", userId).eq("is_current", true).single();
  if (plan.error) throw plan.error;
  const { data, error } = await admin
    .from("shopping_custom_item")
    .insert(
      items.map(({ label, ingredient, amount, unit }) => ({
        user_id: userId,
        meal_plan_id: (plan.data as { id: string }).id,
        label,
        ingredient_id: ingredient ? ids.get(ingredient) : null,
        amount: amount ?? null,
        unit: unit ?? null,
      })),
    )
    .select("id, label");
  if (error) throw error;
  return new Map((data as { id: string; label: string }[]).map((row) => [row.label, row.id]));
}

const customSheet = (page: Page) => page.getByRole("dialog", { name: "Lägg till egen vara" });
const addCustomButton = (page: Page) => page.getByRole("button", { name: "Lägg till egen vara" }).filter({ visible: true });
const region = (page: Page, name: string) => page.getByRole("region", { name }).filter({ visible: true });
const toast = (page: Page) => page.getByTestId("toast");
// An own item's row also holds its "Ta bort", behind the row until it is swiped.

/** Swipes the row to the left from its text with the mouse, which sends the same pointer events as a finger. */
async function swipeLeft(page: Page, row: Locator, distance = 150) {
  const box = await row.boundingBox();
  if (!box) throw new Error("no row");
  const x = box.x + box.width * 0.7;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - distance, y + 4, { steps: 12 });
  await page.mouse.up();
}

/** The current plan's own items with the service role, by text. */
async function storedCustomItems(): Promise<{ id: string; label: string; ingredient_id: string | null }[]> {
  const { data, error } = await adminClient()
    .from("shopping_custom_item")
    .select("id, label, ingredient_id")
    .eq("user_id", userId)
    .order("label");
  if (error) throw error;
  return data as { id: string; label: string; ingredient_id: string | null }[];
}

test("an own item without a catalog ingredient goes under Övrigt, and shows although everything else is at home", async ({
  page,
}) => {
  await seedCustomItems([]);
  await seedChecks([]);
  const errors = watchErrors(page);
  await page.goto("/lista");
  await expect(page.getByText("Allt finns hemma.").filter({ visible: true })).toBeVisible();

  await addCustomButton(page).click();
  const sheet = customSheet(page);
  await expect(sheet.getByRole("textbox", { name: "Vara" })).toBeFocused();
  // Nothing typed: nothing is saved.
  await sheet.getByRole("button", { name: "Lägg till" }).click();
  await expect(sheet.getByText("Skriv vad du vill lägga till.")).toBeVisible();
  await sheet.getByRole("textbox", { name: "Vara" }).fill("diskmedel");
  await actionsAnswered(page, 1, () => sheet.getByRole("button", { name: "Lägg till" }).click());

  await expect(customSheet(page)).toHaveCount(0);
  await expect(region(page, "Övrigt").getByTestId("shopping-line")).toHaveText([/^diskmedel\s*Ta bort$/]);
  await expect(page.getByText("Allt finns hemma.").filter({ visible: true })).toHaveCount(0);
  await expect(summary(page)).toHaveText("Vecka 44 · 2 rätter · 1 vara kvar");
  await page.reload();
  await expect(region(page, "Övrigt").getByTestId("shopping-line")).toHaveText([/^diskmedel\s*Ta bort$/]);
  expect((await storedCustomItems()).map((item) => [item.label, item.ingredient_id])).toEqual([["diskmedel", null]]);
  expect(errors).toEqual([]);
});

test("a suggestion links the own item to its catalog ingredient's section, never merged with the recipe line", async ({
  page,
}) => {
  await seedCustomItems([]);
  await seedChecks([]);
  // 4 dl grädde needed and only the 3 dl in Kyl at home: the recipe line "Grädde 1 dl".
  const frys = await adminClient().from("pantry_item").delete().eq("user_id", userId).eq("location", "Frys");
  if (frys.error) throw frys.error;
  try {
    const errors = watchErrors(page);
    await page.goto("/lista");
    await expect(region(page, "Mejeri").getByTestId("shopping-line")).toHaveCount(1);

    await addCustomButton(page).click();
    const sheet = customSheet(page);
    await sheet.getByRole("textbox", { name: "Vara" }).pressSequentially("grädd");
    await sheet.getByRole("list", { name: "Förslag" }).getByRole("button", { name: "Grädde" }).click();
    await expect(sheet.getByRole("textbox", { name: "Vara" })).toHaveValue("Grädde");
    await expect(sheet.getByText("Kopplad till Grädde")).toBeVisible();
    await sheet.getByRole("textbox", { name: "Mängd" }).fill("2");
    await sheet.getByRole("combobox", { name: "Enhet" }).selectOption("förp");
    await actionsAnswered(page, 1, () => sheet.getByRole("button", { name: "Lägg till" }).click());

    await expect(customSheet(page)).toHaveCount(0);
    const mejeri = region(page, "Mejeri").getByTestId("shopping-line");
    await expect(mejeri).toHaveCount(2);
    await expect(mejeri.filter({ hasText: "2 förp" })).toHaveText(/^Grädde\s*2 förp\s*Ta bort$/);
    await expect(mejeri.filter({ hasText: "1 dl" })).toContainText(`från ${gryta}, ${paj}`);
    expect((await storedCustomItems()).map((item) => [item.label, item.ingredient_id])).toEqual([["Grädde", ids.get("Grädde")]]);
    expect(errors).toEqual([]);
  } finally {
    // The later tests expect the Frys row back.
    await addPantry("Grädde", 1, "dl", "Frys");
  }
});

test("an own item is checked off, removed by swipe and put back with Ångra, with the same id and check", async ({ page }) => {
  const seeded = await seedCustomItems([{ label: "diskmedel" }, { label: "Kaffe", ingredient: "Mjöl" }]);
  await seedChecks([]);
  const errors = watchErrors(page);
  await page.goto("/lista");
  await expect(region(page, "Övrigt").getByTestId("shopping-line")).toHaveText([/^diskmedel\s*Ta bort$/]);
  await expect(region(page, "Skafferi").getByTestId("shopping-line")).toHaveText([/^Kaffe\s*Ta bort$/]);

  await actionsAnswered(page, 1, () => check(page, "diskmedel").click());
  await expect(check(page, "diskmedel")).toBeChecked();
  const { data, error } = await adminClient().from("shopping_check").select("line_key").eq("user_id", userId);
  if (error) throw error;
  expect(data).toEqual([{ line_key: `c:${seeded.get("diskmedel")}` }]);

  const row = region(page, "Övrigt").getByTestId("shopping-line");
  await swipeLeft(page, row);
  await expect(row.getByTestId("swipe-row-front")).toHaveCSS("transform", "matrix(1, 0, 0, 1, -96, 0)");
  await actionsAnswered(page, 1, () => page.getByRole("button", { name: "Ta bort diskmedel" }).click());
  await expect(region(page, "Övrigt")).toHaveCount(0);
  await expect(toast(page)).toContainText("diskmedel är borttagen.");
  await expect.poll(async () => (await storedCustomItems()).map((item) => item.label)).toEqual(["Kaffe"]);

  await actionsAnswered(page, 1, () => toast(page).getByRole("button", { name: "Ångra" }).click());
  await expect(region(page, "Övrigt").getByTestId("shopping-line")).toHaveText([/^diskmedel\s*Ta bort$/]);
  await expect(check(page, "diskmedel")).toBeChecked();
  expect((await storedCustomItems()).map((item) => [item.label, item.id])).toEqual([
    ["diskmedel", seeded.get("diskmedel")],
    ["Kaffe", seeded.get("Kaffe")],
  ]);
  await page.reload();
  await expect(check(page, "diskmedel")).toBeChecked();
  expect(errors).toEqual([]);
});

test("own items stay as they are when the servings change", async ({ page }) => {
  await seedCustomItems([{ label: "diskmedel", amount: 2, unit: "förp" }]);
  await seedChecks([]);
  const errors = watchErrors(page);
  await page.goto("/lista");
  await expect(region(page, "Övrigt").getByTestId("shopping-line")).toHaveText([/^diskmedel\s*2 förp\s*Ta bort$/]);

  await tab(page, "Matsedel").click();
  await expect(page).toHaveURL(/\/matsedel$/);
  const dish = page.getByTestId("plan-dish").filter({ visible: true }).filter({ hasText: gryta });
  await actionsAnswered(page, 1, () => dish.getByRole("button", { name: `Fler portioner, ${gryta}` }).click());
  await expect(dish.getByText("7 portioner")).toBeVisible();

  await tab(page, "Lista").click();
  await expect(page).toHaveURL(/\/lista$/);
  // 3,5 dl grädde for 7, and 1 dl from Paj, against 4 dl at home: the recipes need more now.
  await expect(region(page, "Mejeri").getByTestId("shopping-line")).toContainText(["Grädde"]);
  await expect(region(page, "Övrigt").getByTestId("shopping-line")).toHaveText([/^diskmedel\s*2 förp\s*Ta bort$/]);
  expect(errors).toEqual([]);
});
