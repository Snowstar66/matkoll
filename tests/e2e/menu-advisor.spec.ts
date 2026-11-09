import { expect, type Page, test } from "@playwright/test";
import { adminClient, clearFoodProfiles, e2eEmail, e2eUserId, userStorageState } from "./support";

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
    { originalnamn: "Croquetas de jamón", grupp: "Förrätt", forklaring: "Friterade kroketter.", huvudingredienser: ["skinka", "vitlök"], kategori: "kott", allergener: ["gluten", "laktos"], kan_innehalla: ["notter"], pris: 9.5, valuta: "EUR" },
    { originalnamn: "Paella de verduras", grupp: "Varmrätt", forklaring: "Risrätt med grönsaker.", huvudingredienser: ["ris", "paprika"], kategori: "vegetariskt", allergener: [], kan_innehalla: [], pris: 15, valuta: "EUR" },
  ],
  osakert: ["Priset på en efterrätt"],
};

test.use({ storageState: userStorageState, viewport: mobile });

// The profiles are the household's (the database), so each test starts with nobody saved.
test.beforeEach(async () => {
  await clearFoodProfiles(await e2eUserId(e2eEmail));
});

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

test("Smak och allergier is on Medlemmar without Menyrådgivare: open, add an Undviker, it stays after a reload; the old address leads there", async ({ page }) => {
  await page.goto("/installningar/medlemmar");
  const section = page.getByTestId("menu-profiles");
  await expect(section.getByRole("heading", { name: "Smak och allergier" })).toBeVisible();
  await expect(section.getByText("Utan konto")).toBeVisible();
  const mine = section.getByTestId("menu-profile-row").first();
  await expect(mine).toContainText("Du");
  await expect(mine).toContainText("Inget ifyllt: äter allt");
  await page.screenshot({ path: "test-results/shots/medlemmar-smak.png", fullPage: true });
  await mine.click();
  await expect(page).toHaveURL(/\/installningar\/medlemmar\/smak-och-allergier\/me$/);
  const avoid = page.getByTestId("menu-dislikes");
  await avoid.getByRole("textbox").fill("rödbetor");
  await avoid.getByRole("textbox").press("Enter");
  await expect(avoid.getByRole("button", { name: "Ta bort rödbetor" })).toBeVisible();
  await page.screenshot({ path: "test-results/shots/smak-profil.png", fullPage: true });
  await expect
    .poll(async () => (await savedRows()).some((row) => row.dislikes.includes("rödbetor")))
    .toBe(true);
  await page.reload();
  await expect(page.getByTestId("menu-dislikes").getByRole("button", { name: "Ta bort rödbetor" })).toBeVisible();
  await page.getByRole("link", { name: /Medlemmar/ }).first().click();
  await expect(page.getByTestId("menu-profile-row").first()).toContainText("Undviker: rödbetor");

  await page.goto("/installningar/tillval/aata-ute");
  await expect(page).toHaveURL(/\/installningar\/medlemmar#smak-och-allergier$/);
  await page.goto("/installningar/tillval");
  await expect(page.getByTestId("menu-profiles-link")).toHaveCount(0);
  // Menyrådgivare itself is still off: no way into it from Matsedel.
  await page.goto("/matsedel");
  await expect(page.getByText("Äter ute?")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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

test("profiles under Medlemmar and the company on the menu page: allergies are registered once and mark the dishes", async ({ page }) => {
  await optionOn(page);
  // Web Share is mocked: the text it is given is kept for the check below.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: async (data: { text?: string }) => void ((window as unknown as { shared: string }).shared = data.text ?? ""), configurable: true });
  });
  await page.route("**/api/menu/read", (route) => route.fulfill({ json: { ok: true, data: { menu, quality: "standard", escalated: false } } }));

  await page.goto("/installningar/medlemmar");
  await expect(page.getByTestId("menu-profile-row").first()).toHaveText(/Du/);
  await page.screenshot({ path: "test-results/shots/profiles-list.png", fullPage: true });
  await page.getByTestId("menu-person-add").click();
  await page.getByTestId("menu-person-name").fill("Anna");
  await page.getByRole("button", { name: "Lägg till" }).click();
  await page.getByTestId("menu-profile-row").filter({ hasText: "Anna" }).click();
  const profile = page.getByTestId("menu-profile");
  await profile.getByRole("radiogroup", { name: "Fisk" }).getByRole("radio", { name: "Ogillar" }).click();
  await profile.getByRole("button", { name: /Vin/ }).click();
  // Undviker (not an allergy): written in, and a suggestion chip for the loved list.
  const avoid = profile.getByTestId("menu-dislikes");
  await avoid.getByRole("textbox").fill("vitlök");
  await avoid.getByRole("textbox").press("Enter");
  await expect(avoid.getByRole("button", { name: "Ta bort vitlök" })).toBeVisible();
  await profile.getByTestId("menu-likes").getByRole("button", { name: "Lägg till paprika" }).click();
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
  // Anna avoids garlic (a soft mark on the dish that has it) and loves paprika; neither leaves a dish out.
  await expect(page.getByTestId("menu-soft-avoid")).toHaveText("Anna undviker vitlök");
  await expect(page.getByTestId("menu-soft-love")).toHaveText("Anna älskar paprika");
  await expect(page.getByTestId("menu-dish")).toHaveCount(3);
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

test("what is filled in is the household's: it stays after a reload and shows on another phone", async ({ page, browser }) => {
  await optionOn(page);
  await page.goto("/installningar/medlemmar");
  await page.getByTestId("menu-person-add").click();
  await page.getByTestId("menu-person-name").fill("Maja");
  await page.getByRole("button", { name: "Lägg till" }).click();
  await page.getByTestId("menu-profile-row").filter({ hasText: "Maja" }).click();
  const profile = page.getByTestId("menu-profile");
  await profile.getByRole("button", { name: /Vin/ }).click();
  await profile.getByTestId("menu-dislikes").getByRole("textbox").fill("koriander");
  await profile.getByTestId("menu-dislikes").getByRole("textbox").press("Enter");
  await expect(page.getByTestId("menu-profiles-notice")).toHaveCount(0);
  await expect(profile.getByRole("button", { name: "Ta bort koriander" })).toBeVisible();

  // The saves have reached the database when the reload shows them.
  await expect
    .poll(async () => {
      const rows = await savedRows();
      return rows.find((row) => row.name === "Maja")?.dislikes.join(",") ?? null;
    })
    .toBe("koriander");
  await page.goto("/installningar/medlemmar");
  await expect(page.getByTestId("menu-profile-row").filter({ hasText: "Maja" })).toContainText("Undviker: koriander");
  await page.screenshot({ path: "test-results/shots/profiles-household.png", fullPage: true });

  // Another phone: no localStorage of its own, the same household.
  const other = await browser.newContext({ storageState: userStorageState, viewport: mobile });
  const phone = await other.newPage();
  await phone.addInitScript(() => localStorage.setItem("livskoll-option-menuAdvisor", "1"));
  await phone.goto("/installningar/medlemmar");
  await expect(phone.getByTestId("menu-profile-row").filter({ hasText: "Maja" })).toContainText("Undviker: koriander");
  await expect(phone.getByTestId("menu-profiles-notice")).toHaveCount(0);
  await phone.getByTestId("menu-profile-row").filter({ hasText: "Maja" }).click();
  await expect(phone.getByTestId("menu-dislikes").getByRole("button", { name: "Ta bort koriander" })).toBeVisible();
  await other.close();
});

test("a phone's own old list moves up to the household once, and nothing the household has is overwritten", async ({ page, browser }) => {
  const userId = await e2eUserId(e2eEmail);
  await optionOn(page);
  await page.addInitScript(() => {
    if (localStorage.getItem("livskoll-menu-people-imported-v1")) return;
    localStorage.setItem(
      "livskoll-menu-people-v1",
      JSON.stringify({
        v: 1,
        people: [
          { id: "me", name: "Du", kind: "member", allergies: ["notter"], tastes: { pasta: 2 }, dislikes: [], likes: [], drink: "ol" },
          { id: "p-gammal1", name: "Gammal gäst", kind: "guest", allergies: ["gluten"], tastes: {}, dislikes: ["lök"], likes: [], drink: null },
        ],
      }),
    );
  });
  await page.goto("/installningar/medlemmar");
  await expect(page.getByTestId("menu-profile-row").filter({ hasText: "Gammal gäst" })).toContainText("Allergi: gluten");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("livskoll-menu-people-imported-v1"))).toBe("1");
  const rows = await savedRows();
  expect(rows.find((row) => row.person_key === `m-${userId}`)).toMatchObject({ drink: "ol", allergies: ["notter"], name: null });
  expect(rows.find((row) => row.person_key === "p-gammal1")).toMatchObject({ kind: "guest", name: "Gammal gäst", dislikes: ["lök"] });

  // A second phone with a different old list: only what the household lacks is added; Du is not overwritten.
  const other = await browser.newContext({ storageState: userStorageState, viewport: mobile });
  const phone = await other.newPage();
  await phone.addInitScript(() => {
    localStorage.setItem("livskoll-option-menuAdvisor", "1");
    localStorage.setItem(
      "livskoll-menu-people-v1",
      JSON.stringify({
        v: 1,
        people: [
          { id: "me", name: "Du", kind: "member", allergies: [], tastes: {}, dislikes: [], likes: [], drink: "kaffe" },
          { id: "p-annan1", name: "Annan gäst", kind: "guest", allergies: [], tastes: {}, dislikes: [], likes: [], drink: "vatten" },
        ],
      }),
    );
  });
  await phone.goto("/installningar/medlemmar");
  await expect(phone.getByTestId("menu-profile-row").filter({ hasText: "Annan gäst" })).toBeVisible();
  await expect(phone.getByTestId("menu-profile-row").filter({ hasText: "Gammal gäst" })).toBeVisible();
  await expect(phone.getByTestId("menu-profile-row").first()).toContainText("Öl");
  await other.close();
  const after = await savedRows();
  expect(after.find((row) => row.person_key === `m-${userId}`)?.drink).toBe("ol");
  expect(after.some((row) => row.person_key === "p-annan1")).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("livskoll-menu-people-v1"))).not.toBeNull();
});

/** The household's saved profiles, read with the service role (test-only). */
async function savedRows() {
  const admin = adminClient();
  const member = await admin.from("household_member").select("household_id").eq("user_id", await e2eUserId(e2eEmail)).single();
  const { data, error } = await admin
    .from("food_profile")
    .select("person_key, kind, name, allergies, dislikes, drink")
    .eq("household_id", member.data!.household_id);
  if (error) throw error;
  return data as { person_key: string; kind: string; name: string | null; allergies: string[]; dislikes: string[]; drink: string | null }[];
}
