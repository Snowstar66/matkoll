import { expect, type Page, test } from "@playwright/test";
import { adminClient, e2eUserId, storeEmail, storeStorageState } from "./support";

// Story 7.1: Butik in Inställningar. The spec has a user of its own
// (storeEmail), and each test starts from the default store alone, selected,
// set with the service role. Matkoll never contacts a store: no request may
// go to an address ending in ica.se while the spec runs.

const maxi = "Maxi ICA Stormarknad Östersund";
const maxiUrl = "https://handlaprivatkund.ica.se/stores/1003733";
const mobile = { width: 390, height: 844 };

let userId = "";
let storeRequests: string[] = [];

/** The user's stores: only the default store, selected, as ensure_user_defaults() adds it. */
async function resetStores() {
  const admin = adminClient();
  const removed = await admin.from("store").delete().eq("user_id", userId);
  if (removed.error) throw removed.error;
  const added = await admin.from("store").insert({
    user_id: userId,
    name: maxi,
    chain: "ICA",
    external_store_id: "1003733",
    url: maxiUrl,
    is_selected: true,
  });
  if (added.error) throw added.error;
}

type StoreRow = { name: string; chain: string; address: string | null; is_selected: boolean };

async function storedStores(): Promise<StoreRow[]> {
  const { data, error } = await adminClient()
    .from("store")
    .select("name, chain, address, is_selected")
    .eq("user_id", userId)
    .order("name");
  if (error) throw error;
  return data as StoreRow[];
}

async function selectedStores(): Promise<string[]> {
  return (await storedStores()).filter((store) => store.is_selected).map((store) => store.name);
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

const section = (page: Page) => page.getByRole("main").getByRole("region", { name: "Butik", exact: true });
const card = (page: Page) => section(page).getByTestId("selected-store");
const others = (page: Page) => section(page).getByRole("list", { name: "Andra butiker" });
const toast = (page: Page) => page.getByTestId("toast");
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });

async function expectSelected(page: Page, name: string) {
  await expect(card(page).getByRole("heading", { level: 3 })).toHaveText(name);
}

test.describe.configure({ mode: "serial" });
test.use({ storageState: storeStorageState, viewport: mobile });

test.beforeAll(async () => {
  userId = await e2eUserId(storeEmail);
});

test.beforeEach(async ({ page }) => {
  await resetStores();
  storeRequests = [];
  page.on("request", (request) => {
    const host = new URL(request.url()).hostname;
    if (host === "ica.se" || host.endsWith(".ica.se")) storeRequests.push(request.url());
  });
});

test.afterEach(() => {
  expect(storeRequests).toEqual([]);
});

test("shows the default store under the recipe sites, with its URL as a link", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/installningar");
  await expect(section(page).getByRole("heading", { level: 2, name: "Butik" })).toBeVisible();
  await expectSelected(page, maxi);
  await expect(card(page)).toContainText("ICA · butiks-id 1003733");
  await expect(card(page)).toContainText("Ingen adress angiven");
  const link = card(page).getByRole("link", { name: maxiUrl });
  await expect(link).toHaveAttribute("href", maxiUrl);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(others(page)).toHaveCount(0);

  // Under the recipe sites, above "Logga ut".
  const sitesBox = await page.getByRole("heading", { level: 2, name: "Godkända receptsajter" }).boundingBox();
  const storeBox = await section(page).boundingBox();
  const signOutBox = await page.getByRole("button", { name: "Logga ut" }).boundingBox();
  expect(storeBox!.y).toBeGreaterThan(sitesBox!.y);
  expect(signOutBox!.y).toBeGreaterThan(storeBox!.y);
  for (const target of [card(page).getByRole("button", { name: "Ändra" }), section(page).getByRole("button", { name: "Lägg till butik" })]) {
    const box = await target.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  }
  expect(errors).toEqual([]);
});

test("Ändra saves a new address, which stays after a reload", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/installningar");
  await card(page).getByRole("button", { name: "Ändra" }).click();
  const sheet = dialog(page, "Ändra butik");
  await expect(sheet.getByLabel("Namn")).toHaveValue(maxi);
  await sheet.getByLabel("Adress").fill("Testgatan 1, 123 45 Teststad");
  await sheet.getByRole("button", { name: "Spara" }).click();

  await expect(sheet).toBeHidden();
  await expect(toast(page)).toHaveText("Butiken är sparad.");
  await expect(card(page)).toContainText("Testgatan 1, 123 45 Teststad");
  await page.reload();
  await expect(card(page)).toContainText("Testgatan 1, 123 45 Teststad");
  expect(await storedStores()).toEqual([{ name: maxi, chain: "ICA", address: "Testgatan 1, 123 45 Teststad", is_selected: true }]);
  expect(errors).toEqual([]);
});

test("Lägg till butik with Willys selects the new store, and Välj switches back", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/installningar");
  await section(page).getByRole("button", { name: "Lägg till butik" }).click();
  const sheet = dialog(page, "Ny butik");
  await sheet.getByLabel("Namn").fill("Willys Lindhagen");
  await sheet.getByLabel("Kedja").selectOption("Willys");
  await expect(sheet.getByRole("checkbox", { name: "Använd för varukorgen" })).toBeChecked();
  await sheet.getByRole("button", { name: "Spara" }).click();

  await expect(sheet).toBeHidden();
  await expectSelected(page, "Willys Lindhagen");
  await expect(card(page)).toContainText("Willys");
  await expect(others(page).getByTestId("other-store")).toHaveCount(1);
  await expect(others(page)).toContainText(maxi);
  await expect(others(page)).toContainText("ICA · butiks-id 1003733");
  expect(await selectedStores()).toEqual(["Willys Lindhagen"]);

  await others(page).getByRole("button", { name: `Välj ${maxi}` }).click();
  await expectSelected(page, maxi);
  await expect(toast(page)).toHaveText(`${maxi} är vald.`);
  await expect(others(page).getByRole("button", { name: "Välj Willys Lindhagen" })).toBeVisible();
  await expect.poll(selectedStores).toEqual([maxi]);
  await page.reload();
  await expectSelected(page, maxi);
  expect(errors).toEqual([]);
});

test("a store added without Använd för varukorgen lands under Andra butiker", async ({ page }) => {
  await page.goto("/installningar");
  await section(page).getByRole("button", { name: "Lägg till butik" }).click();
  const sheet = dialog(page, "Ny butik");
  await sheet.getByLabel("Namn").fill("Lidl Lillänge");
  await sheet.getByLabel("Kedja").selectOption("Lidl");
  await sheet.getByRole("checkbox", { name: "Använd för varukorgen" }).uncheck();
  await sheet.getByRole("button", { name: "Spara" }).click();

  await expect(sheet).toBeHidden();
  await expect(others(page)).toContainText("Lidl Lillänge");
  await expectSelected(page, maxi);
  expect(await selectedStores()).toEqual([maxi]);
});

test("refuses a URL that does not start with https://, and a store that is there already", async ({ page }) => {
  await page.goto("/installningar");
  await section(page).getByRole("button", { name: "Lägg till butik" }).click();
  const sheet = dialog(page, "Ny butik");
  await sheet.getByLabel("Namn").fill("ICA Handla");
  for (const url of ["handla.ica.se", "http://handla.ica.se/"]) {
    await sheet.getByLabel("URL").fill(url);
    await sheet.getByRole("button", { name: "Spara" }).click();
    await expect(sheet.getByText("Ange en adress som börjar med https://.")).toBeVisible();
    await expect(sheet.getByLabel("URL")).toHaveAttribute("aria-invalid", "true");
  }

  // The same chain and store id as the default store.
  await sheet.getByLabel("URL").fill("");
  await sheet.getByLabel("Butiks-id").fill("1003733");
  await sheet.getByRole("button", { name: "Spara" }).click();
  await expect(sheet.getByText("Butiken finns redan.")).toBeVisible();
  await expect(sheet).toBeVisible();
  expect(await storedStores()).toEqual([{ name: maxi, chain: "ICA", address: null, is_selected: true }]);
});

test("Andra butiker are in Swedish name order, each with Ändra and Välj", async ({ page }) => {
  // Inserted out of order; in code-unit order "Ä" (U+00C4) would come before "Å" (U+00C5).
  const added = await adminClient()
    .from("store")
    .insert([
      { user_id: userId, name: "Ärtans Coop", chain: "Coop" },
      { user_id: userId, name: "Åkrokens Willys", chain: "Willys" },
    ]);
  expect(added.error).toBeNull();

  await page.goto("/installningar");
  await expectSelected(page, maxi);
  const rows = others(page).getByTestId("other-store");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Åkrokens Willys");
  await expect(rows.nth(1)).toContainText("Ärtans Coop");
  for (const name of ["Åkrokens Willys", "Ärtans Coop"]) {
    await expect(others(page).getByRole("button", { name: `Ändra ${name}` })).toBeVisible();
    await expect(others(page).getByRole("button", { name: `Välj ${name}` })).toBeVisible();
  }
});
