import { expect, type Page, test } from "@playwright/test";
import {
  basketEndMarker,
  basketInstruction as instruction,
  basketPreamble,
  basketStartMarker,
} from "@/features/shopping/domain/export-basket";
import { adminClient, basketExportEmail, basketExportStorageState, e2eUserId } from "./support";

// Story 7.3: "Skicka till ICA" copies the basket export to the clipboard.
// The spec has a user of its own (basketExportEmail), and each test makes
// its state with the service role: a recipe with "3 dl grädde", "2 gul
// lök", "salt efter smak" (vague, and not at home) and "2 citroner" on the
// current plan, the own item "Diskmedel", Maxi ICA Stormarknad Östersund as
// the selected store, and a product choice for grädde there. Matkoll never
// contacts a store and never fetches a product's link: no request may go to
// an address ending in ica.se, nor to the link's host, and the tap itself
// makes no request at all and opens no page.

const mobile = { width: 390, height: 844 };
const gryta = "Krämig kycklinggryta";
const maxi = "Maxi ICA Stormarknad Östersund";
const storeUrl = "https://handlaprivatkund.ica.se/stores/1003733";
const arla = "Arla Matlagningsgrädde 15 %";
const arlaUrl = "https://www.arla.se/produkter/matlagningsgradde-15";
const copied = "Inköpslistan är kopierad. Klistra in den i Claude i Chrome på ICA Handla.";

test.use({ storageState: basketExportStorageState, viewport: mobile });
test.describe.configure({ mode: "serial" });

let userId = "";
let ids = new Map<string, string>();
let storeRequests: string[] = [];
/** Requests to the host of the product link; Matkoll never fetches it. */
let linkRequests: string[] = [];
let newPages = 0;

const catalog = [
  { name: "Grädde", section: "Mejeri", location: "Kyl" },
  { name: "Gul lök", section: "Frukt och grönt", location: "Skafferi" },
  { name: "Salt", section: "Skafferi", location: "Skafferi" },
];

/** The export of the seeded list, word for word (docs/varukorgsexport.md). */
const expectedExport = [
  "Matkoll varukorgsexport v1",
  "",
  basketPreamble,
  "",
  basketStartMarker,
  "",
  `Butik: ${maxi}`,
  "Kedja: ICA",
  "Butiks-id: 1003733",
  "Adress: Testgatan 1, 123 45 Teststad",
  `URL: ${storeUrl}`,
  "",
  "Antal varor: 4",
  "",
  "Frukt och grönt",
  "- Gul lök",
  "  Mängd: 2 st",
  "",
  "Mejeri",
  "- Grädde",
  "  Mängd: 3 dl",
  `  Önskad produkt: ${arla}`,
  // The link is on another site than the store's: left out, the product name stays.
  "  Förpackning: 5 dl",
  "",
  "Övrigt",
  "- 2 citroner",
  "- Diskmedel",
  "",
  basketEndMarker,
  "",
  instruction,
  "",
].join("\n");

test.beforeAll(async () => {
  userId = await e2eUserId(basketExportEmail);
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

/** Starts each test from the same plan, own item, store and choice, with an empty pantry and no checks. */
async function seed() {
  const admin = adminClient();
  // The choices first: they keep the stores (on delete restrict).
  for (const table of ["product_choice", "store", "meal_plan", "recipe", "pantry_item"] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  const store = await admin
    .from("store")
    .insert({
      user_id: userId,
      name: maxi,
      chain: "ICA",
      external_store_id: "1003733",
      address: "Testgatan 1, 123 45 Teststad",
      url: storeUrl,
      is_selected: true,
    })
    .select("id")
    .single();
  if (store.error) throw store.error;
  const choice = await admin.from("product_choice").insert({
    user_id: userId,
    ingredient_id: ids.get("Grädde"),
    store_id: (store.data as { id: string }).id,
    product_name: arla,
    package_size: "5 dl",
    url: arlaUrl,
  });
  if (choice.error) throw choice.error;

  const recipe = await admin
    .from("recipe")
    .insert({ user_id: userId, title: gryta, original_servings: 4, total_minutes: 30, source_kind: "text" })
    .select("id")
    .single();
  if (recipe.error) throw recipe.error;
  const recipeId = (recipe.data as { id: string }).id;
  const base = { user_id: userId, recipe_id: recipeId };
  const lines = await admin.from("recipe_ingredient").insert([
    { ...base, position: 0, original_text: "3 dl grädde", amount: 3, unit: "dl", is_vague: false, ingredient_id: ids.get("Grädde") },
    { ...base, position: 1, original_text: "2 gul lök", amount: 2, unit: "st", is_vague: false, ingredient_id: ids.get("Gul lök") },
    { ...base, position: 2, original_text: "salt efter smak", amount: null, unit: null, is_vague: true, ingredient_id: ids.get("Salt") },
    { ...base, position: 3, original_text: "2 citroner", amount: 2, unit: "st", is_vague: false },
  ]);
  if (lines.error) throw lines.error;
  const plan = await admin.from("meal_plan").insert({ user_id: userId, name: "Vecka 44", is_current: true }).select("id").single();
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
  const own = await admin.from("shopping_custom_item").insert({ user_id: userId, meal_plan_id: planId, label: "Diskmedel" });
  if (own.error) throw own.error;
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
const sendButton = (page: Page) => page.getByRole("button", { name: "Skicka till ICA", exact: true }).filter({ visible: true });
const putButton = (page: Page) => page.getByRole("button", { name: "Lägg i lagret", exact: true }).filter({ visible: true });
const check = (page: Page, name: string) => page.getByRole("checkbox", { name, exact: true }).filter({ visible: true });
const toast = (page: Page) => page.getByTestId("toast");
const exportSheet = (page: Page) => page.getByRole("dialog", { name: "Inköpslistan", exact: true });
const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

/** Every request the page makes from now on. */
function recordRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  return requests;
}

/** Opens the list and waits until it has loaded everything, so later requests are the tap's. */
async function openList(page: Page) {
  await page.goto("/lista");
  await expect(sendButton(page)).toBeVisible();
  await page.waitForLoadState("networkidle");
}

test.beforeEach(async ({ context, page, baseURL }) => {
  await seed();
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
  storeRequests = [];
  linkRequests = [];
  newPages = 0;
  // Any page but the test's own: the tap never opens a tab or a window.
  context.on("page", (opened) => {
    if (opened !== page) newPages += 1;
  });
  context.on("request", (request) => {
    const host = new URL(request.url()).hostname;
    if (host === "ica.se" || host.endsWith(".ica.se")) storeRequests.push(request.url());
    if (host === new URL(arlaUrl).hostname) linkRequests.push(request.url());
  });
});

test.afterEach(() => {
  expect(storeRequests).toEqual([]);
  expect(linkRequests).toEqual([]);
  expect(newPages).toBe(0);
});

test("Skicka till ICA copies the export without asking the server, and confirms", async ({ page }) => {
  const errors = watchErrors(page);
  await openList(page);
  // Nothing is checked off: the only button, so the primary one.
  await expect(putButton(page)).toHaveCount(0);
  const requests = recordRequests(page);
  const url = page.url();

  await sendButton(page).click();
  await expect(toast(page)).toHaveText(copied);
  const text = await clipboard(page);
  expect(text).toBe(expectedExport);
  expect(text.startsWith("Matkoll varukorgsexport v1\n")).toBe(true);
  expect(text).toContain("Arla");
  expect(text).not.toMatch(/salt/i);
  expect(text.endsWith(`${instruction}\n`)).toBe(true);

  // The tap made no request, and the page stayed where it was.
  expect(requests).toEqual([]);
  expect(page.url()).toBe(url);
  expect(errors).toEqual([]);
});

test("a gul lök checked off is not in the next export, and Lägg i lagret stands above Skicka till ICA", async ({ page }) => {
  const errors = watchErrors(page);
  await openList(page);
  await check(page, "Gul lök, 2 st").click();
  await expect(check(page, "Gul lök, 2 st")).toBeChecked();
  await expect(putButton(page)).toBeEnabled();
  // Off while the check was saved; on again now.
  await expect(sendButton(page)).toBeEnabled();

  const put = await putButton(page).boundingBox();
  const send = await sendButton(page).boundingBox();
  expect(put && send && put.y + put.height <= send.y).toBe(true);

  await sendButton(page).click();
  await expect(toast(page)).toHaveText(copied);
  const text = await clipboard(page);
  expect(text).not.toContain("Gul lök");
  expect(text).not.toContain("Frukt och grönt");
  expect(text).toContain("Antal varor: 3\n");
  expect(text).toContain(`- Grädde\n  Mängd: 3 dl\n  Önskad produkt: ${arla}\n`);
  expect(errors).toEqual([]);
});

test("a refused clipboard opens Inköpslistan with the text selected, and Kopiera says when it is refused again", async ({
  page,
}) => {
  // The browser refuses every write to the clipboard.
  await page.addInitScript(() => {
    Object.defineProperty(Clipboard.prototype, "writeText", {
      configurable: true,
      value: () => Promise.reject(new DOMException("Write permission denied.", "NotAllowedError")),
    });
  });
  await openList(page);
  const requests = recordRequests(page);

  await sendButton(page).click();
  const sheet = exportSheet(page);
  await expect(sheet).toBeVisible();
  const field = sheet.getByRole("textbox", { name: "Exporttext" });
  await expect(field).toHaveValue(expectedExport);
  await expect(field).toHaveAttribute("readonly", "");
  await expect(field).toBeFocused();
  const selection = () =>
    field.evaluate((element: HTMLTextAreaElement) => ({
      start: element.selectionStart,
      end: element.selectionEnd,
      length: element.value.length,
    }));
  await expect.poll(selection).toEqual({ start: 0, end: expectedExport.length, length: expectedExport.length });
  await expect(toast(page)).toHaveCount(0);

  await sheet.getByRole("button", { name: "Kopiera", exact: true }).click();
  await expect(sheet.getByRole("alert")).toHaveText("Det gick inte att kopiera. Markera texten och kopiera den själv.");
  await expect(field).toBeFocused();
  await expect.poll(selection).toEqual({ start: 0, end: expectedExport.length, length: expectedExport.length });

  await sheet.getByRole("button", { name: "Klar", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  expect(requests).toEqual([]);
});
