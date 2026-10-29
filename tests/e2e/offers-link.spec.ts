import { expect, type Page, test } from "@playwright/test";
import { isoWeekNumber, weekStartOf } from "@/features/offers/domain/week";
import { adminClient, e2eUserId, offersLinkEmail, offersLinkStorageState } from "./support";

// Story 9.1: Veckans erbjudanden från butikens länk. The spec has a user of
// its own (offersLinkEmail). Before each test the service role removes the
// user's offers and sets the store's link to a saved offer page in
// tests/fixtures/sites, which the server fetches instead of ica.se
// (AI_PROVIDER=mock). The browser never contacts ica.se either.

const mobile = { width: 375, height: 812 };
const fixtureLink = (slug: string) => `https://www.ica.se/erbjudanden/${slug}/`;
const storeLink = fixtureLink("matkoll-test-butik-1000001");
const storeName = "Matkoll Testbutik";

let userId = "";
let browserRequests: string[] = [];

async function resetStore(offersUrl: string) {
  const admin = adminClient();
  const offers = await admin.from("store_offer").delete().eq("user_id", userId);
  if (offers.error) throw offers.error;
  const stores = await admin.from("store").delete().eq("user_id", userId);
  if (stores.error) throw stores.error;
  const added = await admin.from("store").insert({
    user_id: userId,
    name: storeName,
    chain: "ICA",
    external_store_id: "1000001",
    offers_url: offersUrl,
    is_selected: true,
  });
  if (added.error) throw added.error;
}

async function storedOffers(): Promise<{ label: string; source: string }[]> {
  const { data, error } = await adminClient()
    .from("store_offer")
    .select("label, source")
    .eq("user_id", userId)
    .order("created_at");
  if (error) throw error;
  return data as { label: string; source: string }[];
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

const week = () => isoWeekNumber(weekStartOf(new Date()));
const sheet = (page: Page) => page.getByRole("dialog", { name: "Veckans erbjudanden" });

async function openSheet(page: Page) {
  await page.goto("/lista");
  await page.getByRole("button", { name: "Erbjudanden" }).click();
  await expect(sheet(page)).toBeVisible();
}

test.describe.configure({ mode: "serial" });
test.use({ storageState: offersLinkStorageState, viewport: mobile });

test.beforeAll(async () => {
  userId = await e2eUserId(offersLinkEmail);
});

test.beforeEach(async ({ page }) => {
  await resetStore(storeLink);
  browserRequests = [];
  page.on("request", (request) => {
    const host = new URL(request.url()).hostname;
    if (host === "ica.se" || host.endsWith(".ica.se")) browserRequests.push(request.url());
  });
});

test.afterEach(() => {
  expect(browserRequests).toEqual([]);
});

test("the store's link is in Inställningar, and only an offer page on ica.se is saved", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/installningar");
  const card = page.getByRole("main").getByTestId("selected-store");
  await expect(card.getByText("Erbjudanden: ica.se")).toBeVisible();

  await card.getByRole("button", { name: "Ändra" }).click();
  const dialog = page.getByRole("dialog", { name: "Ändra butik" });
  const field = dialog.getByLabel("Länk till veckans erbjudanden");
  await expect(field).toHaveValue(storeLink);

  await field.fill(`${storeLink}?utm_source=x`);
  await dialog.getByRole("button", { name: "Spara" }).click();
  await expect(dialog.getByText(/^Ange adressen till butikens erbjudanden på ica\.se/)).toBeVisible();

  const other = "https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733";
  await field.fill(other);
  await dialog.getByRole("button", { name: "Spara" }).click();
  await expect(dialog).toBeHidden();
  const { data } = await adminClient().from("store").select("offers_url").eq("user_id", userId).single();
  expect(data?.offers_url).toBe(`${other}/`);

  await card.getByRole("button", { name: "Ändra" }).click();
  await page.getByRole("dialog", { name: "Ändra butik" }).getByLabel("Kedja").selectOption("Willys");
  await expect(page.getByRole("dialog", { name: "Ändra butik" }).getByText("Länk stöds bara för ICA än så länge.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("fetches the week's offers with one tap and shows them under their categories", async ({ page }) => {
  const errors = watchErrors(page);
  await openSheet(page);
  const dialog = sheet(page);
  await expect(dialog.getByText(new RegExp(`^${storeName} · vecka ${week()}, `))).toBeVisible();
  await expect(dialog.getByText(`Inga erbjudanden hämtade för vecka ${week()}.`)).toBeVisible();

  await dialog.getByRole("button", { name: "Hämta veckans erbjudanden" }).click();
  await expect(page.getByTestId("toast")).toHaveText(new RegExp(`Hämtade 7 erbjudanden för vecka ${week()}\\.`));
  await expect(dialog.getByText("2 varor som inte är mat togs inte med.")).toBeVisible();
  await expect(dialog.getByTestId("offers-summary")).toHaveText("7 erbjudanden");
  await expect(dialog.getByTestId("offers-meta")).toContainText(/ · v\. \d+ · 7 erbjudanden/);
  await expect(dialog.getByTestId("offers-fetched")).toHaveText(/^Hämtade idag \d\d:\d\d · Hämta igen$/);

  const meat = dialog.getByRole("list", { name: /Kött, fisk & chark/ });
  await expect(meat.getByText("Gårdens Herrgård, Präst")).toBeVisible();
  await expect(
    meat.getByText(/^Stammis · Max 1 köp\/hushåll · t\.o\.m\. \d+ \w+$/),
  ).toBeVisible();
  // Story 9.11: no regular price and no stated saving, nothing about it.
  await expect(meat.getByText("129 kr/kg", { exact: true })).toBeVisible();
  await expect(dialog.getByTestId("offer-top-tag")).toHaveCount(1);
  await expect(meat.getByTestId("offer-regular-price")).toHaveText("111,90 kr");
  await dialog.getByRole("radio", { name: "Bäst rabatt" }).click();
  const best = dialog.getByRole("list", { name: "Bäst rabatt först" }).getByTestId("offer-row");
  await expect(best.first()).toContainText("Köp 3 betala för 2");
  await expect(best.first()).toContainText("\u221233 %");
  await expect(best.last()).not.toContainText("%");
  await dialog.getByRole("radio", { name: "Avdelning" }).click();
  await expect(dialog.getByRole("heading", { level: 3, name: "Bröd" })).toBeVisible();
  await expect(dialog.getByText("Ljusfabriken Kronljus")).toHaveCount(0);
  const page$ = dialog.getByRole("link", { name: /^Öppna sidan på ica\.se/ });
  await expect(page$).toHaveAttribute("target", "_blank");
  await expect(page$).toHaveAttribute("href", storeLink);

  const saved = await storedOffers();
  expect(saved).toHaveLength(7);
  expect(saved.every((offer) => offer.source === "link")).toBe(true);
  // No sideways scrolling at 375 px.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("refuses to fetch again within 15 minutes, without fetching", async ({ page }) => {
  await openSheet(page);
  const dialog = sheet(page);
  await dialog.getByRole("button", { name: "Hämta veckans erbjudanden" }).click();
  await expect(dialog.getByTestId("offers-summary")).toBeVisible();

  await dialog.getByRole("button", { name: "Hämta igen" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Erbjudandena hämtades nyss. Försök igen om en stund.");
  expect(await storedOffers()).toHaveLength(7);
});

test("says that ica.se did not let Matkoll in, with Öppna sidan, and saves nothing", async ({ page }) => {
  await resetStore(fixtureLink("matkoll-test-nekad-1000005"));
  await openSheet(page);
  const dialog = sheet(page);
  await dialog.getByRole("button", { name: "Hämta veckans erbjudanden" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "ica.se släppte inte in Matkoll just nu. Öppna sidan och titta där, eller försök igen senare.",
  );
  await expect(dialog.getByRole("link", { name: /^Öppna sidan/ }).first()).toHaveAttribute(
    "href",
    fixtureLink("matkoll-test-nekad-1000005"),
  );
  expect(await storedOffers()).toEqual([]);
});

test("says that the page has changed when it has no offer data", async ({ page }) => {
  await resetStore(fixtureLink("matkoll-test-utan-data-1000002"));
  await openSheet(page);
  const dialog = sheet(page);
  await dialog.getByRole("button", { name: "Hämta veckans erbjudanden" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Sidan med erbjudanden ser inte ut som Matkoll väntar sig. Öppna sidan och titta där.",
  );
  expect(await storedOffers()).toEqual([]);
});

test("asks for the link when the store has none", async ({ page }) => {
  const admin = adminClient();
  const cleared = await admin.from("store").update({ offers_url: null }).eq("user_id", userId);
  if (cleared.error) throw cleared.error;
  await openSheet(page);
  const dialog = sheet(page);
  await expect(dialog.getByText("Lägg in länken till butikens erbjudanden under Butik i Inställningar.")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Öppna inställningar" })).toHaveAttribute("href", "/installningar");
});

test("Story 9.12: picks offers and adds them to the shopping list once", async ({ page }) => {
  const errors = watchErrors(page);
  const admin = adminClient();
  const cleared = await admin.from("meal_plan").delete().eq("user_id", userId);
  if (cleared.error) throw cleared.error;
  const plan = await admin.from("meal_plan").insert({ user_id: userId, name: "Vecka 44", is_current: true });
  if (plan.error) throw plan.error;

  await openSheet(page);
  const dialog = sheet(page);
  await dialog.getByRole("button", { name: "Hämta veckans erbjudanden" }).click();
  await expect(dialog.getByTestId("offers-summary")).toBeVisible();

  // Nothing is picked, so there is no button.
  await expect(dialog.getByTestId("add-offers-to-list")).toHaveCount(0);
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Välj" }).click();
  const herrgard = dialog.getByRole("checkbox", { name: /^Gårdens Herrgård, Präst, 89 kr per kg/ });
  await expect(herrgard).toHaveAttribute("aria-checked", "false");
  const box = await herrgard.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);

  await herrgard.click();
  await dialog.getByRole("checkbox", { name: /^Odlarna Gul lök/ }).click();
  await dialog.getByRole("button", { name: "Lägg 2 i inköpslistan" }).click();
  await expect(page.getByTestId("toast")).toContainText("Lade 2 erbjudanden i inköpslistan.");
  // The sheet closes, so the toast is within reach.
  await expect(dialog).toBeHidden();

  const items = await admin.from("shopping_custom_item").select("label").eq("user_id", userId).order("label");
  expect(items.error).toBeNull();
  expect(items.data?.map((item) => item.label)).toEqual([
    "Gul lök (Erbjudande Matkoll: 10 kr/kg)",
    expect.stringMatching(/^.+ \(Erbjudande Matkoll: 89 kr\/kg\)$/),
  ]);

  // The toast's link goes to the list, which has the items; a reload and a new opening keep "På listan".
  await page.getByTestId("toast").getByRole("button", { name: "Inköpslista" }).click();
  await expect(page).toHaveURL(/\/lista$/);
  await page.reload();
  await expect(page.getByText("Gul lök")).toBeVisible();
  await page.getByRole("button", { name: "Erbjudanden" }).click();
  await expect(sheet(page).getByText("På listan")).toHaveCount(2);
  await sheet(page).getByRole("button", { name: "Välj" }).click();
  await expect(sheet(page).getByRole("checkbox", { name: /^Gårdens Herrgård, Präst/ })).toBeDisabled();
  await expect(sheet(page).getByTestId("add-offers-to-list")).toHaveCount(0);
  const after = await admin.from("shopping_custom_item").select("id").eq("user_id", userId);
  expect(after.data).toHaveLength(2);
  expect(errors).toEqual([]);
});

const krokomLink = fixtureLink("matkoll-test-krokom-1000013");

async function addKrokom() {
  const added = await adminClient().from("store").insert({
    user_id: userId,
    name: "ICA Kvantum Krokom",
    chain: "ICA",
    external_store_id: "1000013",
    offers_url: krokomLink,
    is_selected: false,
  });
  if (added.error) throw added.error;
}

test("Story 9.13: fetches from several stores one by one, shows a badge per store and filters on them", async ({ page }) => {
  const errors = watchErrors(page);
  await addKrokom();
  await openSheet(page);
  const dialog = sheet(page);
  await expect(dialog.getByTestId("store-fetch-row")).toHaveCount(2);
  const first = dialog.getByRole("checkbox", { name: storeName });
  await expect(first).toHaveAttribute("aria-checked", "true");
  const box = await first.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);

  // Only Krokom is ticked: one fetch, one store.
  await first.click();
  await dialog.getByRole("button", { name: "Hämta valda (1)" }).click();
  await expect(page.getByTestId("toast")).toContainText("Hämtade 7 erbjudanden");
  expect(await storedOffers()).toHaveLength(7);

  await dialog.getByRole("button", { name: "Hämta igen" }).click();
  await dialog.getByRole("button", { name: "Hämta alla" }).click();
  // Krokom was fetched a moment ago: it is skipped with its own message, the other store still goes.
  await expect(dialog.getByRole("alert")).toHaveText("Krokom: Erbjudandena hämtades nyss. Försök igen om en stund.");
  await expect(dialog.getByTestId("offers-store-result")).toHaveText("Matkoll: Hämtade 7 erbjudanden.");
  expect(await storedOffers()).toHaveLength(14);

  await expect(dialog.getByTestId("store-badge").first()).toBeVisible();
  const texts = await dialog.getByTestId("store-badge").allTextContents();
  expect(texts.filter((text) => text === "Matkoll")).toHaveLength(7);
  expect(texts.filter((text) => text === "Krokom")).toHaveLength(7);
  // The same product on offer in both stores shows twice.
  await expect(dialog.getByText("Havets Laxfilé")).toHaveCount(2);

  await dialog.getByRole("radio", { name: "Bäst rabatt" }).click();
  await expect(dialog.getByRole("list", { name: "Bäst rabatt först" }).getByTestId("offer-row")).toHaveCount(14);
  await dialog.getByRole("radiogroup", { name: "Visa butik" }).getByRole("radio", { name: "Krokom" }).click();
  await expect(dialog.getByTestId("offer-row")).toHaveCount(7);
  // Story 16.6: one store shown, so no store label on the rows.
  await expect(dialog.getByTestId("store-badge")).toHaveCount(0);
  await dialog.getByRole("radio", { name: "Alla" }).click();
  await expect(dialog.getByTestId("offer-row")).toHaveCount(14);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("Story 16.8: fetching only one store removes the other store's offers", async ({ page }) => {
  const errors = watchErrors(page);
  await addKrokom();
  await openSheet(page);
  const dialog = sheet(page);
  await dialog.getByRole("button", { name: "Hämta alla" }).click();
  await expect(dialog.getByTestId("offers-store-result")).toHaveCount(2);
  expect(await storedOffers()).toHaveLength(14);
  await expect(dialog.getByTestId("list-filters")).toContainText("Visa butik");
  await expect(dialog.getByRole("button", { name: /^Filter/ })).toHaveCount(0);

  // Let both stores be fetched again at once, then fetch only Krokom.
  const cleared = await adminClient().from("store").update({ offers_attempted_at: null }).eq("user_id", userId);
  if (cleared.error) throw cleared.error;
  await dialog.getByRole("button", { name: "Hämta igen" }).click();
  await dialog.getByRole("checkbox", { name: storeName }).click();
  await dialog.getByRole("button", { name: "Hämta valda (1)" }).click();
  await expect(dialog.getByTestId("offers-store-result")).toHaveText("Krokom: Hämtade 7 erbjudanden.");
  await expect(dialog.getByTestId("offers-summary")).toContainText("7 erbjudanden");
  await expect(dialog.getByTestId("list-filters")).not.toContainText("Visa butik");
  const rows = await storedOffers();
  expect(rows).toHaveLength(7);
  const stores = await adminClient().from("store_offer").select("store_id").eq("user_id", userId);
  expect(new Set(stores.data?.map((row) => row.store_id)).size).toBe(1);
  expect(errors).toEqual([]);
});

test("Story 9.13: a blocked store is skipped with its own message and the other store is still fetched", async ({ page }) => {
  await resetStore(fixtureLink("matkoll-test-nekad-1000005"));
  await addKrokom();
  await openSheet(page);
  const dialog = sheet(page);
  await dialog.getByRole("button", { name: "Hämta alla" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Matkoll: ica.se släppte inte in Matkoll just nu. Öppna sidan och titta där, eller försök igen senare.",
  );
  await expect(dialog.getByTestId("offers-store-result")).toHaveText("Krokom: Hämtade 7 erbjudanden.");
  expect(await storedOffers()).toHaveLength(7);
});

test("Story 9.13: a picked offer's note on the shopping list names its store", async ({ page }) => {
  const admin = adminClient();
  const cleared = await admin.from("meal_plan").delete().eq("user_id", userId);
  if (cleared.error) throw cleared.error;
  const plan = await admin.from("meal_plan").insert({ user_id: userId, name: "Vecka 44", is_current: true });
  if (plan.error) throw plan.error;
  await addKrokom();
  await openSheet(page);
  const dialog = sheet(page);
  await dialog.getByRole("button", { name: "Hämta alla" }).click();
  await expect(dialog.getByTestId("offers-store-result")).toHaveCount(2);
  await dialog.getByRole("radiogroup", { name: "Visa butik" }).getByRole("radio", { name: "Krokom" }).click();
  await dialog.getByRole("button", { name: "Välj" }).click();
  await dialog.getByRole("checkbox", { name: /^Gårdens Herrgård, Präst, 79 kr per kg.*Krokom$/ }).click();
  await dialog.getByRole("button", { name: "Lägg 1 i inköpslistan" }).click();
  await expect(dialog).toBeHidden();
  const items = await admin.from("shopping_custom_item").select("label").eq("user_id", userId);
  expect(items.data?.map((item) => item.label)).toEqual([expect.stringMatching(/^.+ \(Erbjudande Krokom: 79 kr\/kg\)$/)]);
});
