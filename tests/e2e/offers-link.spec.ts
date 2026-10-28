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
  await expect(dialog.getByTestId("offers-summary")).toHaveText(/^7 erbjudanden · hämtade idag \d\d:\d\d$/);

  const meat = dialog.getByRole("list", { name: /Kött, fisk & chark/ });
  await expect(meat.getByText("Gårdens Herrgård, Präst")).toBeVisible();
  await expect(meat.getByText(/^89 kr\/kg · Stammis · Max 1 köp\/hushåll · t\.o\.m\. \d+ \w+$/)).toBeVisible();
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
