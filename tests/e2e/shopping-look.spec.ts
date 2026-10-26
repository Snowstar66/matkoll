import { expect, type Page, type Response, test } from "@playwright/test";
import { adminClient, e2eUserId, shoppingLookEmail, shoppingLookStorageState } from "./support";

// Story 11.4: Inköpslistan in the new look (FR-43, Flöde 9). The progress
// row, the categories of Lagersaldo, the line under a name, the product chip,
// a check that moves a line to "I korgen" and back, and the fixed buttons in
// one row, at 375 px. The spec has an E2E user of its own (shoppingLookEmail).
// Before each test the service role makes:
//
// - the catalog ingredients Gul lök, Falukorv, Matlagningsgrädde and Senap;
// - Korv stroganoff (1 gul lök, 800 g falukorv, 2 dl matlagningsgrädde,
//   senap efter smak) and Kycklinggryta (1 dl matlagningsgrädde) on the
//   current meal plan, with the own item Diskmedel;
// - Stugan beside Hemma, selected, with an empty pantry: the vague senap
//   says "Saknas i Stugan";
// - ICA Maxi as the selected store, with "Scan Falukorv 800 g" for falukorv;
// - the checks given to the test.

const mobile = { width: 375, height: 812 };
const stroganoff = "Korv stroganoff";
const gryta = "Kycklinggryta";
const scan = "Scan Falukorv 800 g";

test.use({ storageState: shoppingLookStorageState, viewport: mobile });
// One user for all the tests: each seeds it again, so they must not run at the same time.
test.describe.configure({ mode: "serial" });

let userId = "";
let ids = new Map<string, string>();

const catalog = [
  { name: "Gul lök", section: "Frukt och grönt", location: "Kyl" },
  { name: "Falukorv", section: "Chark", location: "Kyl" },
  { name: "Matlagningsgrädde", section: "Mejeri", location: "Kyl" },
  { name: "Senap", section: "Skafferi", location: "Skafferi" },
];

type SiteRow = { id: string; user_id: string; name: string; normalized_name: string; is_selected: boolean };

test.beforeAll(async () => {
  userId = await e2eUserId(shoppingLookEmail);
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

async function sites(): Promise<SiteRow[]> {
  const { data, error } = await adminClient()
    .from("pantry_site")
    .select("id, user_id, name, normalized_name, is_selected")
    .eq("user_id", userId)
    .order("created_at");
  if (error) throw error;
  return data as SiteRow[];
}

/** Selects the place `id` in one upsert, so exactly one place is selected; the one to select comes last. */
async function selectSite(id: string) {
  const rows = (await sites()).map((site) => ({ ...site, is_selected: site.id === id }));
  rows.sort((a, b) => Number(a.is_selected) - Number(b.is_selected));
  const { error } = await adminClient().from("pantry_site").upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

/** The list key of the recipe line for `ingredient` in `unit` (shopping/domain/lineKey). */
const lineKey = (ingredient: string, unit: string) => `r:${ids.get(ingredient)}:${unit}`;

/** Starts a test from the plan, places, store and choice above, with these lines checked. */
async function seed(checked: string[] = []) {
  const admin = adminClient();
  // The choices first: they keep the stores (on delete restrict). The plan takes its checks and own items with it.
  for (const table of [
    "product_choice",
    "store",
    "shopping_check",
    "shopping_line_override",
    "shopping_custom_item",
    "meal_plan",
    "pantry_item",
    "recipe",
  ] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  // Hemma comes with the sign-in (ensure_pantry_defaults); Stugan is made again, and selected.
  const home = (await sites()).find((site) => site.normalized_name === "hemma");
  if (!home) throw new Error("Hemma is missing; the sign-in in global-setup creates it");
  await selectSite(home.id);
  const others = await admin.from("pantry_site").delete().eq("user_id", userId).neq("id", home.id);
  if (others.error) throw others.error;
  const created = await admin
    .from("pantry_site")
    .insert({ user_id: userId, name: "Stugan", normalized_name: "stugan", is_selected: false })
    .select("id")
    .single();
  if (created.error) throw created.error;
  await selectSite((created.data as { id: string }).id);

  const store = await admin
    .from("store")
    .insert({ user_id: userId, name: "ICA Maxi", chain: "ICA", is_selected: true })
    .select("id")
    .single();
  if (store.error) throw store.error;
  const choice = await admin.from("product_choice").insert({
    user_id: userId,
    ingredient_id: ids.get("Falukorv"),
    store_id: (store.data as { id: string }).id,
    product_name: scan,
  });
  if (choice.error) throw choice.error;

  const plan = await admin.from("meal_plan").insert({ user_id: userId, name: "Vecka 44", is_current: true }).select("id").single();
  if (plan.error) throw plan.error;
  const planId = (plan.data as { id: string }).id;
  const recipes: [string, { text: string; ingredient: string; amount: number | null; unit: string | null }[]][] = [
    [
      stroganoff,
      [
        { text: "1 gul lök", ingredient: "Gul lök", amount: 1, unit: "st" },
        { text: "800 g falukorv", ingredient: "Falukorv", amount: 800, unit: "g" },
        { text: "2 dl matlagningsgrädde", ingredient: "Matlagningsgrädde", amount: 2, unit: "dl" },
        { text: "senap efter smak", ingredient: "Senap", amount: null, unit: null },
      ],
    ],
    [gryta, [{ text: "1 dl matlagningsgrädde", ingredient: "Matlagningsgrädde", amount: 1, unit: "dl" }]],
  ];
  for (const [position, [title, lines]] of recipes.entries()) {
    const recipe = await admin
      .from("recipe")
      .insert({ user_id: userId, title, original_servings: 4, total_minutes: 30, source_kind: "text" })
      .select("id")
      .single();
    if (recipe.error) throw recipe.error;
    const recipeId = (recipe.data as { id: string }).id;
    const inserted = await admin.from("recipe_ingredient").insert(
      lines.map((line, index) => ({
        user_id: userId,
        recipe_id: recipeId,
        position: index,
        original_text: line.text,
        amount: line.amount,
        unit: line.unit,
        is_vague: line.amount === null,
        ingredient_id: ids.get(line.ingredient),
      })),
    );
    if (inserted.error) throw inserted.error;
    const dish = await admin
      .from("meal_plan_recipe")
      .insert({ user_id: userId, meal_plan_id: planId, recipe_id: recipeId, recipe_title: title, servings: 4, position });
    if (dish.error) throw dish.error;
  }
  const own = await admin.from("shopping_custom_item").insert({ user_id: userId, meal_plan_id: planId, label: "Diskmedel" });
  if (own.error) throw own.error;
  if (checked.length > 0) {
    const checks = await admin
      .from("shopping_check")
      .insert(checked.map((key) => ({ user_id: userId, meal_plan_id: planId, line_key: key })));
    if (checks.error) throw checks.error;
  }
}

/** The current plan's checks, by list key, with the service role. */
async function storedChecks(): Promise<string[]> {
  const { data, error } = await adminClient().from("shopping_check").select("line_key").eq("user_id", userId);
  if (error) throw error;
  return (data as { line_key: string }[]).map((row) => row.line_key).sort();
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

// Earlier routes stay mounted but hidden after a client navigation, so every
// locator is scoped to what is visible.
const lines = (page: Page) => page.getByTestId("shopping-line").filter({ visible: true });
const lineOf = (page: Page, label: string) => lines(page).filter({ has: page.getByText(label, { exact: true }) });
const progress = (page: Page) => page.getByTestId("list-progress").filter({ visible: true });
const headings = (page: Page) => page.getByRole("heading", { level: 2 }).filter({ visible: true });
const region = (page: Page, name: string) => page.getByRole("list", { name, exact: true }).filter({ visible: true });
const check = (page: Page, name: string) => page.getByRole("checkbox", { name, exact: true }).filter({ visible: true });
const basketRow = (page: Page) => page.getByTestId("basket-row").filter({ visible: true });
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).filter({ visible: true });
const announcement = (page: Page) => page.getByTestId("check-announcement").filter({ visible: true });
const tab = (page: Page, name: "Recept" | "Inköpslista") =>
  page.getByRole("navigation", { name: "Huvudmeny" }).getByRole("link", { name });
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("the list shows the progress row, the categories, the line under each name and the product chip", async ({ page }) => {
  await seed();
  const errors = watchErrors(page);
  await page.goto("/lista");
  await expect(page.getByTestId("site-line").filter({ visible: true })).toContainText("Lager: Stugan");
  await expect(progress(page)).toHaveText(/^5 varor kvar\s*0 av 5 i korgen$/);
  await expect(headings(page)).toHaveText(["Frukt & grönt", "Mejeri & ägg", "Kött, fisk & chark", "Såser & smaksättare", "Övrigt"]);
  // The amount after the name, and the dishes with " · " under it, without "från".
  await expect(lineOf(page, "Matlagningsgrädde")).toContainText("Matlagningsgrädde 3 dl");
  await expect(lineOf(page, "Matlagningsgrädde")).toContainText(`${stroganoff} · ${gryta}`);
  await expect(lineOf(page, "Gul lök")).toContainText(stroganoff);
  // The vague line counted against Stugan, and the own item.
  await expect(lineOf(page, "Senap")).toContainText(`Saknas i Stugan · ${stroganoff}`);
  await expect(lineOf(page, "Diskmedel")).toContainText("Egen vara");
  await expect(page.getByText("Finns hemma?")).toHaveCount(0);
  await expect(page.getByText(/från /).filter({ visible: true })).toHaveCount(0);
  // The selected store's product choice, as a chip beside Falukorv.
  const chip = lineOf(page, "Falukorv").getByTestId("product-chip");
  await expect(chip).toHaveText(scan);
  const [chipBox, rowBox] = [await chip.boundingBox(), await lineOf(page, "Falukorv").boundingBox()];
  expect(chipBox!.width).toBeLessThanOrEqual(rowBox!.width * 0.4 + 1);
  // Nothing checked off: no basket row, and only "Skicka till ICA", as the secondary button.
  await expect(basketRow(page)).toHaveCount(0);
  await expect(button(page, "Skicka till ICA")).toBeVisible();
  await expect(button(page, "Lägg i lagret")).toHaveCount(0);
  // The check's tap target is 44 × 44 px.
  const box = await check(page, "Gul lök, 1 st").boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(await noSideScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});

test("a check moves the line to I korgen at once, and a check there takes it back", async ({ page }) => {
  await seed();
  const errors = watchErrors(page);
  await page.goto("/lista");
  await expect(progress(page)).toHaveText(/^5 varor kvar/);

  await actionsAnswered(page, 1, () => check(page, "Gul lök, 1 st").click());
  // Gone from Frukt & grönt (it had only Gul lök), counted in the progress row and the basket row.
  await expect(region(page, "Frukt & grönt")).toHaveCount(0);
  await expect(progress(page)).toHaveText(/^4 varor kvar\s*1 av 5 i korgen$/);
  await expect(basketRow(page)).toContainText("1 vara i korgen");
  await expect(announcement(page)).toHaveText("Gul lök i korgen.");
  // Focus on the next line's check.
  await expect(check(page, "Matlagningsgrädde, 3 dl")).toBeFocused();
  expect(await storedChecks()).toEqual([lineKey("Gul lök", "st")]);
  // Both buttons in one row: "Skicka till ICA" left, "Lägg i lagret" right.
  const send = await button(page, "Skicka till ICA").boundingBox();
  const put = await button(page, "Lägg i lagret").boundingBox();
  expect(Math.abs(send!.y - put!.y)).toBeLessThan(1);
  expect(send!.x).toBeLessThan(put!.x);

  // Saved: still in the basket after a reload, folded.
  await page.reload();
  await expect(basketRow(page)).toContainText("1 vara i korgen");
  await expect(check(page, "Gul lök, 1 st")).toHaveCount(0);
  const show = button(page, "Visa");
  await expect(show).toHaveAttribute("aria-expanded", "false");
  await show.click();
  await expect(button(page, "Dölj")).toHaveAttribute("aria-expanded", "true");
  const basket = region(page, "I korgen");
  await expect(page.getByRole("heading", { level: 2, name: "I korgen" }).filter({ visible: true })).toBeVisible();
  await expect(basket.getByText("Gul lök", { exact: true }).locator("..")).toHaveCSS("text-decoration-line", "line-through");

  await actionsAnswered(page, 1, () => basket.getByRole("checkbox", { name: "Gul lök, 1 st" }).click());
  await expect(region(page, "Frukt & grönt").getByRole("checkbox", { name: "Gul lök, 1 st" })).not.toBeChecked();
  await expect(announcement(page)).toHaveText("Gul lök tillbaka på listan.");
  await expect(progress(page)).toHaveText(/^5 varor kvar\s*0 av 5 i korgen$/);
  await expect(basketRow(page)).toHaveCount(0);
  expect(await storedChecks()).toEqual([]);
  expect(errors).toEqual([]);
});

test("everything checked off: Allt ligger i korgen, no categories, and I korgen stays open across tabs", async ({ page }) => {
  await seed([lineKey("Gul lök", "st"), lineKey("Falukorv", "g"), lineKey("Matlagningsgrädde", "dl"), lineKey("Senap", "-")]);
  const errors = watchErrors(page);
  await page.goto("/lista");
  await expect(progress(page)).toHaveText(/^1 vara kvar\s*4 av 5 i korgen$/);
  await actionsAnswered(page, 1, () => check(page, "Diskmedel").click());
  await expect(progress(page)).toHaveText("Allt ligger i korgen");
  await expect(headings(page)).toHaveCount(0);
  // The last line left: focus on the basket row's "Visa".
  await expect(button(page, "Visa")).toBeFocused();
  await expect(basketRow(page)).toContainText("5 varor i korgen");
  await expect(button(page, "Lägg i lagret")).toBeVisible();

  await button(page, "Visa").click();
  await expect(region(page, "I korgen").getByTestId("shopping-line")).toHaveCount(5);
  await tab(page, "Recept").click();
  await expect(page).toHaveURL(/\/recept$/);
  await tab(page, "Inköpslista").click();
  await expect(page).toHaveURL(/\/lista$/);
  // Kept while the page was hidden (Activity).
  await expect(region(page, "I korgen")).toBeVisible();
  await expect(button(page, "Dölj")).toBeVisible();
  expect(errors).toEqual([]);
});

test("at 200 % text the buttons stack with Lägg i lagret on top, the chip is cut, and nothing scrolls sideways", async ({ page }) => {
  await seed([lineKey("Gul lök", "st")]);
  // A 375 px phone at 200 % zoom.
  await page.setViewportSize({ width: 188, height: 406 });
  const errors = watchErrors(page);
  await page.goto("/lista");
  await expect(progress(page)).toHaveText(/^4 varor kvar/);
  const send = await button(page, "Skicka till ICA").boundingBox();
  const put = await button(page, "Lägg i lagret").boundingBox();
  expect(put!.y + put!.height).toBeLessThanOrEqual(send!.y);
  const chip = lineOf(page, "Falukorv").getByTestId("product-chip");
  expect(await chip.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await noSideScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});
