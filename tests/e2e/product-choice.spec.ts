import { expect, type Page, test } from "@playwright/test";
import { adminClient, e2eUserId, productChoiceEmail, productChoiceStorageState, thisMonday } from "./support";

// Story 7.2: Produktval in Listpostdetalj. The spec has a user of its own
// (productChoiceEmail), and each test makes its state with the service role:
// a recipe with "grädde 3 dl" and "2 citroner" on the current plan, the own
// items "Kaffe" (linked to the catalog's Kaffe) and "Diskmedel" (not linked),
// Maxi ICA Stormarknad Östersund as the selected store and Willys Lindhagen
// as another, and no product choices. Matkoll never contacts a store, and
// never fetches a product's link: no request may go to an address ending in
// ica.se, nor to the seeded link's host, while the spec runs.

const mobile = { width: 390, height: 844 };
const gryta = "Krämig kycklinggryta";
const maxi = "Maxi ICA Stormarknad Östersund";
const willys = "Willys Lindhagen";
const arla = "Arla Matlagningsgrädde 15 %";
const arlaUrl = "https://www.arla.se/produkter/matlagningsgradde-15";

test.use({ storageState: productChoiceStorageState, viewport: mobile });
test.describe.configure({ mode: "serial" });

let userId = "";
let ids = new Map<string, string>();
let stores = new Map<string, string>();
let storeRequests: string[] = [];
/** Requests to the host of the product link the tests save; Matkoll never fetches it. */
let linkRequests: string[] = [];

const catalog = [
  { name: "Grädde", section: "Mejeri", location: "Kyl" },
  { name: "Kaffe", section: "Skafferi", location: "Skafferi" },
];

test.beforeAll(async () => {
  userId = await e2eUserId(productChoiceEmail);
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

/** Starts each test from the same plan, own items and stores, without product choices. */
async function seed() {
  const admin = adminClient();
  // The choices first: they keep the stores (on delete restrict).
  for (const table of ["product_choice", "store", "shopping_custom_item", "shopping_check", "meal_plan", "recipe"] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  const added = await admin
    .from("store")
    .insert([
      {
        user_id: userId,
        name: maxi,
        chain: "ICA",
        external_store_id: "1003733",
        url: "https://handlaprivatkund.ica.se/stores/1003733",
        is_selected: true,
      },
      { user_id: userId, name: willys, chain: "Willys", is_selected: false },
    ])
    .select("id, name");
  if (added.error) throw added.error;
  stores = new Map((added.data as { id: string; name: string }[]).map((row) => [row.name, row.id]));

  const recipe = await admin
    .from("recipe")
    .insert({ user_id: userId, title: gryta, original_servings: 4, total_minutes: 30, source_kind: "text" })
    .select("id")
    .single();
  if (recipe.error) throw recipe.error;
  const recipeId = (recipe.data as { id: string }).id;
  const lines = await admin.from("recipe_ingredient").insert([
    {
      user_id: userId,
      recipe_id: recipeId,
      position: 0,
      original_text: "3 dl grädde",
      amount: 3,
      unit: "dl",
      is_vague: false,
      ingredient_id: ids.get("Grädde"),
    },
    { user_id: userId, recipe_id: recipeId, position: 1, original_text: "2 citroner", amount: 2, unit: "st", is_vague: false },
  ]);
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
    { user_id: userId, meal_plan_id: planId, label: "Kaffe", ingredient_id: ids.get("Kaffe") },
    { user_id: userId, meal_plan_id: planId, label: "Diskmedel" },
  ]);
  if (own.error) throw own.error;
}

/** A choice for `ingredient` in `store`, made with the service role. */
async function seedChoice(ingredient: string, store: string, fields: { product_name: string; package_size?: string; url?: string }) {
  const { error } = await adminClient()
    .from("product_choice")
    .insert({ user_id: userId, ingredient_id: ids.get(ingredient), store_id: stores.get(store), ...fields });
  if (error) throw error;
}

type ChoiceRow = { id: string; store_id: string; product_name: string; package_size: string | null; url: string | null };

async function storedChoices(): Promise<ChoiceRow[]> {
  const { data, error } = await adminClient()
    .from("product_choice")
    .select("id, store_id, product_name, package_size, url")
    .eq("user_id", userId)
    .order("created_at");
  if (error) throw error;
  return data as ChoiceRow[];
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

// Earlier routes stay mounted but hidden after a client navigation, so list
// locators are scoped to what is visible.
const lines = (page: Page) => page.getByTestId("shopping-line").filter({ visible: true });
const lineOf = (page: Page, label: string) => lines(page).filter({ has: page.getByText(label, { exact: true }) });
const nameOf = (page: Page, label: string) => lineOf(page, label).getByRole("button", { name: new RegExp(`^${label}`) });
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true });
const choiceSection = (page: Page, title: string) => dialog(page, title).getByRole("region", { name: "Produktval" });
const choiceSheet = (page: Page) => dialog(page, "Produktval för grädde");
const toast = (page: Page) => page.getByTestId("toast");

async function openDetail(page: Page, label: string) {
  await nameOf(page, label).click();
  await expect(dialog(page, label)).toBeVisible();
}

async function closeDetail(page: Page, label: string, button: "Avbryt" | "Klar" = "Avbryt") {
  await dialog(page, label).getByRole("button", { name: button }).click();
  await expect(dialog(page, label)).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await seed();
  storeRequests = [];
  linkRequests = [];
  page.on("request", (request) => {
    const host = new URL(request.url()).hostname;
    if (host === "ica.se" || host.endsWith(".ica.se")) storeRequests.push(request.url());
    if (host === new URL(arlaUrl).hostname) linkRequests.push(request.url());
  });
});

test.afterEach(() => {
  expect(storeRequests).toEqual([]);
  expect(linkRequests).toEqual([]);
});

test("a product choice for grädde is saved, and shown when the detail opens again and after a reload", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/lista");
  await openDetail(page, "Grädde");
  const section = choiceSection(page, "Grädde");
  await expect(section.getByRole("heading", { level: 3, name: "Produktval" })).toBeVisible();
  await expect(section).toContainText(`Inget produktval i ${maxi}.`);
  await section.getByRole("button", { name: "Ange produktval" }).click();

  // The sheet replaces the detail: never two sheets.
  const sheet = choiceSheet(page);
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText(maxi);
  await expect(dialog(page, "Grädde")).toHaveCount(0);
  await sheet.getByLabel("Produkt").fill(arla);
  await sheet.getByLabel("Förpackning").fill("5 dl");
  await sheet.getByRole("button", { name: "Spara" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(toast(page)).toHaveText("Produktvalet är sparat.");
  expect(await storedChoices()).toEqual([
    { id: expect.any(String), store_id: stores.get(maxi), product_name: arla, package_size: "5 dl", url: null },
  ]);

  await openDetail(page, "Grädde");
  await expect(choiceSection(page, "Grädde")).toContainText(`${arla} · 5 dl`);
  await expect(choiceSection(page, "Grädde").getByRole("button", { name: "Ändra produktval" })).toBeVisible();
  await closeDetail(page, "Grädde");

  await page.reload();
  await openDetail(page, "Grädde");
  await expect(choiceSection(page, "Grädde")).toContainText(`${arla} · 5 dl`);

  // Ändra: the same row is updated.
  const [saved] = await storedChoices();
  await choiceSection(page, "Grädde").getByRole("button", { name: "Ändra produktval" }).click();
  await choiceSheet(page).getByLabel("Förpackning").fill("2,5 dl");
  await choiceSheet(page).getByRole("button", { name: "Spara" }).click();
  await expect(choiceSheet(page)).toHaveCount(0);
  await expect.poll(storedChoices).toEqual([{ ...saved, package_size: "2,5 dl" }]);
  expect(errors).toEqual([]);
});

test("Ta bort produktval removes the choice, and Ångra brings back the same row", async ({ page }) => {
  await seedChoice("Grädde", maxi, { product_name: arla, package_size: "5 dl", url: arlaUrl });
  const [seeded] = await storedChoices();
  const errors = watchErrors(page);
  await page.goto("/lista");
  await openDetail(page, "Grädde");
  const link = choiceSection(page, "Grädde").getByRole("link", { name: `Öppna produkten ${arla} (öppnas i en ny flik)` });
  await expect(link).toHaveAttribute("href", arlaUrl);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");

  await choiceSection(page, "Grädde").getByRole("button", { name: "Ändra produktval" }).click();
  await choiceSheet(page).getByRole("button", { name: "Ta bort produktval" }).click();
  await expect(choiceSheet(page)).toHaveCount(0);
  await expect(toast(page)).toContainText("Tog bort produktvalet.");
  await expect.poll(storedChoices).toEqual([]);

  await toast(page).getByRole("button", { name: "Ångra" }).click();
  await expect.poll(storedChoices).toEqual([seeded]);
  await openDetail(page, "Grädde");
  await expect(choiceSection(page, "Grädde")).toContainText(`${arla} · 5 dl`);
  expect(errors).toEqual([]);
});

test("Kaffe has the section, Diskmedel says to link it, and 2 citroner has none", async ({ page }) => {
  await seedChoice("Kaffe", maxi, { product_name: "Zoégas Skånerost", package_size: "450 g" });
  const errors = watchErrors(page);
  await page.goto("/lista");

  await openDetail(page, "Kaffe");
  await expect(choiceSection(page, "Kaffe")).toContainText("Zoégas Skånerost · 450 g");
  await closeDetail(page, "Kaffe");

  await openDetail(page, "Diskmedel");
  await expect(dialog(page, "Diskmedel")).toContainText("Koppla varan till en ingrediens för att spara ett produktval.");
  await expect(dialog(page, "Diskmedel").getByRole("region", { name: "Produktval" })).toHaveCount(0);
  await closeDetail(page, "Diskmedel");

  await openDetail(page, "2 citroner");
  await expect(dialog(page, "2 citroner").getByRole("region", { name: "Produktval" })).toHaveCount(0);
  await closeDetail(page, "2 citroner", "Klar");
  expect(errors).toEqual([]);
});

test("another store selected in Inställningar has no choice, and Maxi ICA's comes back when it is selected again", async ({
  page,
}) => {
  await seedChoice("Grädde", maxi, { product_name: arla, package_size: "5 dl" });
  const errors = watchErrors(page);

  await page.goto("/installningar/butiker");
  await page.getByRole("main").getByRole("button", { name: `Välj ${willys}` }).click();
  await expect(toast(page)).toHaveText(`${willys} är vald.`);
  await page.goto("/lista");
  await openDetail(page, "Grädde");
  await expect(choiceSection(page, "Grädde")).toContainText(`Inget produktval i ${willys}.`);
  await closeDetail(page, "Grädde");
  // The choice for Maxi ICA is still there.
  expect((await storedChoices()).map((row) => row.store_id)).toEqual([stores.get(maxi)]);

  await page.goto("/installningar/butiker");
  await page.getByRole("main").getByRole("button", { name: `Välj ${maxi}` }).click();
  await expect(toast(page)).toHaveText(`${maxi} är vald.`);
  await page.goto("/lista");
  await openDetail(page, "Grädde");
  await expect(choiceSection(page, "Grädde")).toContainText(`${arla} · 5 dl`);
  expect(errors).toEqual([]);
});

test("refuses a link that does not start with https://, and saves nothing", async ({ page }) => {
  await page.goto("/lista");
  await openDetail(page, "Grädde");
  await choiceSection(page, "Grädde").getByRole("button", { name: "Ange produktval" }).click();
  const sheet = choiceSheet(page);
  await sheet.getByLabel("Produkt").fill(arla);
  for (const url of ["arla.se/produkter", "http://www.arla.se/", "javascript:alert(1)"]) {
    await sheet.getByLabel("Länk").fill(url);
    await sheet.getByRole("button", { name: "Spara" }).click();
    await expect(sheet.getByText("Ange en adress som börjar med https://.")).toBeVisible();
    await expect(sheet.getByLabel("Länk")).toHaveAttribute("aria-invalid", "true");
  }
  await sheet.getByLabel("Produkt").fill("");
  await sheet.getByRole("button", { name: "Spara" }).click();
  await expect(sheet.getByText("Ange produktens namn.")).toBeVisible();
  expect(await storedChoices()).toEqual([]);

  // Closing with changes asks first.
  await sheet.getByRole("button", { name: "Avbryt" }).click();
  await expect(sheet.getByText("Släng ändringarna?")).toBeVisible();
  await sheet.getByRole("button", { name: "Släng ändringarna" }).click();
  await expect(sheet).toHaveCount(0);
});
