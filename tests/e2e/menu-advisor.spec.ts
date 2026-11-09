import { expect, type Page, test } from "@playwright/test";
import { userStorageState } from "./support";

// Menyrådgivare (Tillval, off by default): "Äter ute?" under Matsedel shows only when the option is on; a photo of a menu
// is read through POST /api/menu/read (mocked here with the taverna fixture), shown in groups with prices in euro and
// about so many kronor, marked against what is avoided, and starred dishes add up under Ikväll.

const mobile = { width: 375, height: 812 };
const photo = "tests/fixtures/ai/kyl.png";
const menu = {
  restaurang: "Taverna Mock",
  sprak: "es",
  ratter: [
    { originalnamn: "Pulpo a la gallega", grupp: "Förrätt", forklaring: "Kokt bläckfisk med potatis.", huvudingredienser: ["bläckfisk"], kategori: "skaldjur", allergener: ["skaldjur"], kan_innehalla: [], pris: 17.95, valuta: "EUR" },
    { originalnamn: "Croquetas de jamón", grupp: "Förrätt", forklaring: "Friterade kroketter.", huvudingredienser: ["skinka"], kategori: "kott", allergener: ["gluten", "laktos"], kan_innehalla: ["notter"], pris: 9.5, valuta: "EUR" },
    { originalnamn: "Paella de verduras", grupp: "Varmrätt", forklaring: "Risrätt med grönsaker.", huvudingredienser: ["ris"], kategori: "vegetariskt", allergener: [], kan_innehalla: [], pris: 15, valuta: "EUR" },
  ],
  osakert: ["Priset på en efterrätt"],
};

test.use({ storageState: userStorageState, viewport: mobile });

async function optionOn(page: Page) {
  await page.addInitScript(() => localStorage.setItem("livskoll-option-menuAdvisor", "1"));
}

test("the shortcut is not there while the option is off, and the page says it is off", async ({ page }) => {
  await page.goto("/matsedel");
  await expect(page.getByRole("heading", { name: "Matsedel", level: 1 })).toBeVisible();
  await expect(page.getByTestId("menu-advisor-shortcut")).toHaveCount(0);
  await page.goto("/matsedel/menyer");
  await expect(page.getByText("Menyrådgivaren är avstängd")).toBeVisible();
});

test("a photographed menu is explained, marked, and the starred dishes add up under Ikväll", async ({ page }) => {
  await optionOn(page);
  let quality: string | null = null;
  await page.route("**/api/menu/read", async (route) => {
    quality = route.request().postData()?.includes('name="quality"') ? "sent" : null;
    await route.fulfill({ json: { ok: true, data: { menu, quality: "standard", escalated: false } } });
  });

  await page.goto("/matsedel");
  await page.getByTestId("menu-advisor-shortcut").click();
  await expect(page).toHaveURL(/\/matsedel\/menyer$/);
  await expect(page.getByTestId("menu-disclaimer")).toContainText("Fråga alltid personalen");

  await page.getByRole("button", { name: /Nötter/ }).click();
  await page.getByTestId("menu-file").setInputFiles(photo);
  await expect(page.getByTestId("menu-result")).toBeVisible();
  expect(quality).toBe("sent");
  await expect(page.getByRole("heading", { name: "Förrätt", level: 3 })).toBeVisible();
  await expect(page.getByText("17,95 € · ca 197 kr")).toBeVisible();
  await expect(page.getByText("Kan innehålla nötter")).toBeVisible();
  await expect(page.getByTestId("menu-uncertain")).toContainText("Priset på en efterrätt");
  await expect(page.getByTestId("menu-disclaimer")).toBeVisible();

  await page.getByRole("button", { name: "Stjärnmärk Pulpo a la gallega" }).click();
  await page.getByRole("button", { name: "Stjärnmärk Paella de verduras" }).click();
  await page.getByTestId("menu-tonight-open").click();
  await expect(page.getByTestId("menu-tonight-row")).toHaveCount(2);
  await expect(page.getByTestId("menu-tonight-total")).toContainText("Totalt ca 362 kr");
});

test("the Hushåll row to the profiles is hidden while the option is off", async ({ page }) => {
  await page.goto("/installningar");
  await expect(page.getByRole("heading", { name: "Hushåll", level: 2 })).toBeVisible();
  await expect(page.getByRole("link", { name: /Äta ute: smak och allergier/ })).toHaveCount(0);
});

test("a reading with no dishes says so and gives tips", async ({ page }) => {
  await optionOn(page);
  await page.route("**/api/menu/read", (route) =>
    route.fulfill({ json: { ok: true, data: { menu: { ...menu, ratter: [], osakert: [] }, quality: "standard", escalated: false } } }),
  );
  await page.goto("/matsedel/menyer");
  await page.getByTestId("menu-file").setInputFiles(photo);
  await expect(page.getByText("Jag kunde inte läsa menyn")).toBeVisible();
  await expect(page.getByText("Undvik blänk från lampor och glas")).toBeVisible();
});

test("a failed reading says why", async ({ page }) => {
  await optionOn(page);
  await page.route("**/api/menu/read", (route) => route.fulfill({ json: { ok: false, error: { code: "ai_cap_reached" } } }));
  await page.goto("/matsedel/menyer");
  await page.getByTestId("menu-file").setInputFiles(photo);
  await expect(page.getByRole("alert").filter({ hasText: "Dagens AI-tak är nått" })).toBeVisible();
});

test("profiles under Hushåll (and Tillval) and the company on the menu page: allergies are registered once and mark the dishes", async ({ page }) => {
  await optionOn(page);
  // Web Share is mocked: the text it is given is kept for the check below.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: async (data: { text?: string }) => void ((window as unknown as { shared: string }).shared = data.text ?? ""), configurable: true });
  });
  await page.route("**/api/menu/read", (route) => route.fulfill({ json: { ok: true, data: { menu, quality: "standard", escalated: false } } }));

  await page.goto("/installningar");
  await page.screenshot({ path: "test-results/shots/hushall.png", fullPage: true });
  const hushall = page.getByRole("list", { name: "Hushåll" });
  await expect(hushall.getByRole("link", { name: /Äta ute: smak och allergier/ })).toBeVisible();
  await page.goto("/installningar/tillval");
  await page.getByTestId("menu-profiles-link").click();
  await expect(page).toHaveURL(/\/installningar\/tillval\/aata-ute$/);
  await expect(page.getByTestId("menu-profile-row").first()).toHaveText(/Du/);
  await page.screenshot({ path: "test-results/shots/profiles-list.png", fullPage: true });
  await page.getByTestId("menu-person-add").click();
  await page.getByTestId("menu-person-name").fill("Anna");
  await page.getByRole("button", { name: "Lägg till" }).click();
  const profile = page.getByTestId("menu-profile");
  await profile.getByRole("radiogroup", { name: "Fisk" }).getByRole("radio", { name: "Ogillar" }).click();
  await profile.getByRole("button", { name: /Vin/ }).click();
  await page.screenshot({ path: "test-results/shots/profile.png", fullPage: true });
  await profile.getByTestId("menu-allergies-open").click();
  await page.getByTestId("menu-allergies").getByRole("button", { name: /Gluten/ }).click();
  await page.screenshot({ path: "test-results/shots/allergies.png", fullPage: true });

  await page.goto("/matsedel/menyer");
  await page.getByRole("button", { name: "Anna" }).click();
  await page.getByRole("button", { name: "Lägg till gäst" }).click();
  await page.getByTestId("menu-guest-name").fill("Gunnar");
  await page.getByRole("group", { name: "Gästens allergier" }).getByRole("button", { name: /Nötter/ }).click();
  await page.screenshot({ path: "test-results/shots/guest.png", fullPage: true });
  await page.getByRole("button", { name: "Lägg till", exact: true }).click();
  await expect(page.getByTestId("menu-company-summary")).toHaveText("Du + Anna + 1 gäst");
  await page.screenshot({ path: "test-results/shots/company.png", fullPage: true });
  await page.getByTestId("menu-file").setInputFiles(photo);
  await expect(page.getByTestId("menu-result")).toBeVisible();
  await expect(page.getByTestId("menu-unfit")).toHaveText("Passar inte Anna (gluten), Gunnar (nötter)");
  await page.screenshot({ path: "test-results/shots/result.png", fullPage: true });
  const suggestions = page.getByTestId("menu-suggestions");
  await expect(suggestions).toBeVisible();
  await expect(suggestions).toContainText("Anna:");
  await suggestions.getByRole("button", { name: "Skicka till sällskapet" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { shared?: string }).shared ?? "")).toContain("Anna");
  await suggestions.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/shots/suggestions.png" });
  // Bara förklara: no suggestions and no allergy marks.
  await page.getByRole("radio", { name: "Bara förklara" }).click();
  await expect(suggestions).toHaveCount(0);
  await expect(page.getByTestId("menu-unfit")).toHaveCount(0);
  // Nothing scrolls sideways at 375 px.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
