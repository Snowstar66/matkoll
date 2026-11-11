import { expect, type Locator, type Page, test } from "@playwright/test";
import { adminClient, clearFoodProfiles, e2eEmail, e2eUserId, seedFoodProfile, userStorageState } from "./support";

// Menyrådgivare (Tillval, off by default), "En enkel resa": "Äter ute?" under Matsedel shows only when the option is on.
// Fota menyn (POST /api/menu/read?stream=1, mocked here: the lines of the live reading are pushed by the test), a few
// dishes per person, one tap to choose, "Ert val" to show the waiter, the whole menu and the dish in a sheet.

const mobile = { width: 375, height: 812 };
const photo = "tests/fixtures/ai/kyl.png";
const shots = "test-results/shots/menu-journey";

const dish = (originalnamn: string, grupp: string, forklaring: string, rest: Record<string, unknown> = {}) => ({
  originalnamn,
  grupp,
  forklaring,
  huvudingredienser: [],
  kategori: "ej_tillampligt",
  allergener: [],
  kan_innehalla: [],
  pris: null,
  valuta: "SEK",
  ...rest,
});

const menu = {
  restaurang: "Taverna Mock",
  sprak: "es",
  ratter: [
    dish("Pimientos de padrón", "Förrätt", "Små stekta gröna paprikor med flingsalt och olivolja.", { huvudingredienser: ["paprika"], kategori: "vegetariskt", pris: 77 }),
    dish("Croquetas de jamón", "Förrätt", "Friterade kroketter fyllda med skinka och krämig vitsås.", { huvudingredienser: ["skinka", "mjölk"], kategori: "kott", allergener: ["gluten", "laktos"], pris: 88 }),
    dish("Paella de marisco", "Varmrätt", "Risgryta med skaldjur, saffran och musslor, serverad i pannan.", { huvudingredienser: ["ris", "skaldjur"], kategori: "skaldjur", allergener: ["skaldjur"], pris: 198 }),
    dish("Gambas al ajillo", "Varmrätt", "Stekta räkor i het vitlöksolja med chili och bröd till.", { huvudingredienser: ["räkor", "vitlök"], kategori: "skaldjur", allergener: ["skaldjur"], pris: 154 }),
    dish("Albóndigas", "Varmrätt", "Köttbullar i tomatsås med lök, serverade med färskt bröd.", { huvudingredienser: ["nötkött", "tomat"], kategori: "kott", allergener: ["gluten"], pris: 99 }),
    dish("Tortilla española", "Varmrätt", "Spansk potatisomelett med lök, stekt i olivolja och skuren i bitar.", { huvudingredienser: ["potatis", "ägg"], kategori: "vegetariskt", allergener: ["agg"], pris: 88 }),
    dish("Pulpo a la gallega", "Varmrätt", "Kokt bläckfisk med potatis, olivolja och rökt paprikakrydda.", { huvudingredienser: ["bläckfisk", "paprika"], kategori: "skaldjur", allergener: ["skaldjur"], pris: 176 }),
    dish("Tarta de Santiago", "Efterrätt", "Spansk mandelkaka med florsocker.", { huvudingredienser: ["mandel", "ägg", "socker"], allergener: ["notter", "agg"], pris: 66 }),
    dish("Cerveza", "Drycker", "Öl.", { allergener: ["gluten"], pris: 55 }),
    dish("Vino tinto", "Drycker", "Rött vin, per glas.", { pris: 75 }),
  ],
  osakert: [],
};

// Every main course has nuts: for someone with a nut allergy there is nothing else, so the dish is shown red with the reason.
const nutMenu = {
  ...menu,
  ratter: [
    dish("Ensalada mixta", "Varmrätt", "Blandad sallad med tomat och gurka, dressing med nötter.", { allergener: ["notter"], pris: 77 }),
    dish("Pesto de almendras", "Varmrätt", "Pasta med pesto av mandel, basilika och parmesan.", { allergener: ["notter", "gluten"], pris: 120 }),
  ],
};

const readerLine = { type: "reading", quality: "standard", restart: false, model: "Haiku 5.5", effort: "låg" };
const lineOf = (value: object) => `${JSON.stringify(value)}\n`;
const doneLine = (value: object, quality = "standard") => ({
  type: "done",
  menu: value,
  quality,
  escalated: false,
  model: quality === "careful" ? "Sonnet 5.5" : "Haiku 5.5",
  effort: quality === "careful" ? "medel" : "låg",
});

test.use({ storageState: userStorageState, viewport: mobile });

// The profiles are the household's (the database), so each test starts with nobody saved.
test.beforeEach(async () => {
  await clearFoodProfiles(await e2eUserId(e2eEmail));
});

async function optionOn(page: Page, size?: "xl") {
  await page.addInitScript((textSize) => {
    localStorage.setItem("livskoll-option-menuAdvisor", "1");
    if (textSize) localStorage.setItem("livskoll-text", textSize);
  }, size ?? null);
}

/** Anna (a kept guest: gluten, avoids garlic, loves paprika, wine) and "Du" with beer, saved for the household. */
async function seedCompany() {
  const userId = await e2eUserId(e2eEmail);
  await seedFoodProfile(userId, { allergies: [], dislikes: [], likes: [] });
  const admin = adminClient();
  const member = await admin.from("household_member").select("household_id").eq("user_id", userId).single();
  await admin.from("food_profile").update({ drink: "ol" }).eq("household_id", member.data!.household_id).eq("person_key", `m-${userId}`);
  const { error } = await admin.from("food_profile").insert({
    household_id: member.data!.household_id,
    person_key: "p-anna",
    kind: "guest",
    name: "Anna",
    allergies: ["gluten"],
    tastes: {},
    dislikes: ["vitlök"],
    likes: ["paprika"],
    drink: "vin",
  });
  if (error) throw error;
}

/**
 * A stream the test drives: /api/menu/read?stream=1 answers with a body that stays open until `push` writes lines to
 * it, so what the screen shows while the server reads can be looked at.
 */
async function liveStream(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __menuControl?: ReadableStreamDefaultController<Uint8Array>; __menuQueue: string[]; __menuQualities: string[]; __menuEnded?: boolean };
    w.__menuQueue = [];
    w.__menuQualities = [];
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (!url.includes("/api/menu/read?stream=1")) return original(input, init);
      w.__menuQualities.push(init?.body instanceof FormData ? String(init.body.get("quality")) : "");
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          w.__menuControl = controller;
          for (const line of w.__menuQueue.splice(0)) controller.enqueue(encoder.encode(line));
          if (w.__menuEnded) controller.close();
          w.__menuEnded = false;
          init?.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
        },
      });
      return Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "application/x-ndjson" } }));
    };
  });
  return {
    push: (...events: object[]) =>
      page.evaluate((lines) => {
        const w = window as unknown as { __menuControl?: ReadableStreamDefaultController<Uint8Array>; __menuQueue: string[]; __menuEnded?: boolean };
        const encoder = new TextEncoder();
        for (const line of lines) {
          if (w.__menuControl) w.__menuControl.enqueue(encoder.encode(line));
          else w.__menuQueue.push(line);
        }
        // Like the server, the stream ends after the last line (done or error).
        if (lines.some((line) => /"type":"(done|error)"/.test(line))) {
          if (w.__menuControl) w.__menuControl.close();
          else w.__menuEnded = true;
        }
      }, events.map(lineOf)),
    qualities: () => page.evaluate(() => (window as unknown as { __menuQualities: string[] }).__menuQualities),
  };
}

async function takePhoto(page: Page, button: "menu-photo" | "menu-explain" = "menu-photo") {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId(button).click();
  await (await chooser).setFiles(photo);
}

/** A tap on the card, as a finger does it: the radio itself is hidden inside its label. */
const tap = (radio: Locator) => radio.locator("xpath=ancestor::label").click();

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("the shortcut is not there while the option is off, and the page says it is off", async ({ page }) => {
  await page.goto("/matsedel");
  await expect(page.getByRole("heading", { name: "Matsedel", level: 1 })).toBeVisible();
  await expect(page.getByTestId("menu-advisor-shortcut")).toHaveCount(0);
  await page.goto("/matsedel/menyer");
  await expect(page.getByText("Menyrådgivaren är avstängd")).toBeVisible();
});

test("the whole journey: start, a live reading, the answer, Ert val with another drink, the menu and a dish", async ({ page }) => {
  await optionOn(page);
  await seedCompany();
  const stream = await liveStream(page);

  await page.goto("/matsedel");
  await page.getByTestId("menu-advisor-shortcut").click();
  await expect(page).toHaveURL(/\/matsedel\/menyer$/);

  // 1. Start: a question, who is with, one button, a quiet link. Alone first, then with company.
  await expect(page.getByRole("heading", { name: "Tolka menyn" })).toBeVisible();
  await expect(page.getByTestId("menu-company-line")).toHaveText("Bara du");
  await expect(page.getByTestId("menu-first-time")).toHaveCount(0);
  await page.screenshot({ path: `${shots}/01-start-alone.png` });
  await page.getByTestId("menu-company-row").click();
  await expect(page.getByRole("dialog", { name: "Vilka är med?" })).toBeVisible();
  await page.getByRole("button", { name: "Anna" }).click();
  await page.getByRole("button", { name: "Lägg till gäst" }).click();
  await page.getByTestId("menu-guest-name").fill("Gunnar");
  await page.getByRole("group", { name: "Gästens allergier" }).getByRole("button", { name: /Nötter/ }).click();
  await page.getByRole("button", { name: "Lägg till", exact: true }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/02-company-sheet.png` });
  await page.getByRole("button", { name: "Klar", exact: true }).click();
  await expect(page.getByTestId("menu-company-line")).toHaveText("Ni är tre · Du, Anna, Gunnar");
  await page.screenshot({ path: `${shots}/03-start-company.png` });
  expect(await noSideScroll(page)).toBe(true);

  // 2. Reading: one line that changes, the dishes as they come, who reads, Avbryt as a link.
  await takePhoto(page);
  await expect(page.getByTestId("menu-reading-status")).toHaveText("Läser menyn…");
  await stream.push(readerLine);
  await expect(page.getByTestId("menu-reader")).toHaveText("Läst av Haiku 5.5 · låg");
  await stream.push({ type: "language", sprak: "es" });
  await expect(page.getByTestId("menu-reading-status")).toHaveText("Översätter från spanska…");
  await page.screenshot({ path: `${shots}/04-reading-translate.png` });
  await stream.push({ type: "dish", index: 0, dish: menu.ratter[0] }, { type: "dish", index: 1, dish: menu.ratter[1] }, { type: "dish", index: 2, dish: menu.ratter[2] });
  await expect(page.getByTestId("menu-reading-status")).toHaveText("Hittade 3 rätter");
  await expect(page.getByTestId("menu-reading-dishes").getByRole("listitem")).toHaveCount(3);
  await page.screenshot({ path: `${shots}/05-reading-dishes.png` });
  expect(await stream.qualities()).toEqual(["standard"]);
  await stream.push(doneLine(menu));

  // 3. The answer: a group per person, the best chosen, "Anna älskar paprika" only where it changes something.
  await expect(page.getByRole("heading", { name: "Det här passar er" })).toBeVisible();
  const du = page.getByRole("region", { name: "Du", exact: true });
  const anna = page.getByRole("region", { name: "Anna", exact: true });
  const gunnar = page.getByRole("region", { name: "Gunnar", exact: true });
  await expect(du.getByRole("radio")).toHaveCount(3);
  await expect(du.getByText("med öl")).toBeVisible();
  await expect(anna.getByText("med vin")).toBeVisible();
  await expect(anna.getByText("Anna älskar paprika").first()).toBeVisible();
  await expect(du.getByRole("radio", { checked: true })).toHaveCount(1);
  await expect(page.getByTestId("menu-unfiltered")).toHaveCount(0);
  await expect(page.getByTestId("menu-reader")).toHaveText("Läst av Haiku 5.5 · låg");
  await expect(page.getByTestId("menu-footer")).toBeInViewport();
  await page.screenshot({ path: `${shots}/06-answer-top.png` });
  // A dish with an allergen of the person is never offered when something else exists.
  await expect(anna.getByRole("radio", { name: /Albóndigas/ })).toHaveCount(0);
  await expect(gunnar.getByRole("radio")).toHaveCount(3);
  const before = await page.getByTestId("menu-total").innerText();
  await tap(anna.getByRole("radio", { checked: false }).first());
  await expect(page.getByTestId("menu-total")).not.toHaveText(before);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/07-answer-scrolled.png` });
  expect(await noSideScroll(page)).toBe(true);

  // 4. Ert val: the name as printed, big; the drink can be changed with a tap.
  await page.getByRole("button", { name: "Klart", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ert val" })).toBeVisible();
  await expect(page.getByTestId("menu-choice-person")).toHaveCount(3);
  await expect(page.getByTestId("menu-allergy-line")).toContainText("Anna: gluten.");
  await expect(page.getByTestId("menu-allergy-line")).toContainText("Gunnar: nötter.");
  await expect(page.getByTestId("menu-allergy-line")).toContainText("Fråga alltid personalen");
  await page.screenshot({ path: `${shots}/08-your-choice.png` });
  const total = await page.getByTestId("menu-total").innerText();
  await page.getByTestId("menu-drink-button").first().click();
  await expect(page.getByRole("dialog", { name: "Dryck åt Du" })).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/09-drink-sheet.png` });
  await tap(page.getByRole("radio", { name: /Vin/ }));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("menu-total")).not.toHaveText(total);
  await expect(page.getByTestId("menu-choice-person").first()).toContainText("Vin");

  // Back with "Ändra", then the whole menu: only dishes someone cannot eat are marked.
  await page.getByRole("button", { name: "Ändra" }).click();
  await expect(page.getByRole("heading", { name: "Det här passar er" })).toBeVisible();
  await page.getByRole("button", { name: "Se hela menyn" }).click();
  await expect(page.getByRole("heading", { name: "Hela menyn" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Efterrätt", level: 3 })).toBeVisible();
  await expect(page.getByTestId("menu-unfit").first()).toBeVisible();
  await page.screenshot({ path: `${shots}/10-full-menu.png` });
  await page.getByRole("searchbox", { name: "Sök rätt" }).fill("tarta");
  await expect(page.getByTestId("menu-dish")).toHaveCount(1);
  await page.getByTestId("menu-dish").click();
  const sheet = page.getByRole("dialog", { name: "Tarta de Santiago" });
  await expect(sheet).toContainText("mandel, ägg, socker");
  await expect(sheet.getByTestId("menu-dish-fit")).toHaveText("Passar Du och Anna. Gunnar kan inte (nötter).");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/11-dish-sheet.png` });
  await sheet.getByRole("button", { name: "Lägg till åt dig" }).click();
  await expect(page.getByRole("heading", { name: "Det här passar er" })).toBeVisible();
  await expect(du.getByRole("radio", { name: /Tarta de Santiago/, checked: true })).toBeVisible();

  // "Fler rätter åt Anna" opens the menu with Anna chosen.
  await page.getByRole("button", { name: "Fler rätter åt Anna" }).click();
  await expect(page.getByText("Välj en rätt att lägga till åt Anna")).toBeVisible();
  await page.screenshot({ path: `${shots}/12-full-menu-for-anna.png` });
  await page.getByRole("searchbox", { name: "Sök rätt" }).fill("pulpo");
  await page.getByTestId("menu-dish").click();
  await page.getByRole("button", { name: "Lägg till åt Anna" }).click();
  await expect(anna.getByRole("radio", { name: /Pulpo a la gallega/, checked: true })).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);

  // Klart twice ends the journey at the start.
  await page.getByRole("button", { name: "Klart", exact: true }).click();
  await page.getByRole("button", { name: "Klart", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tolka menyn" })).toBeVisible();
});

test("the answer without company or preferences has no marks, and says allergens are not filtered; Läs noggrannare reads again", async ({ page }) => {
  await optionOn(page);
  const stream = await liveStream(page);
  await page.goto("/matsedel/menyer");
  await expect(page.getByTestId("menu-first-time")).toBeVisible();
  await page.screenshot({ path: `${shots}/13-start-first-time.png` });
  await takePhoto(page);
  await stream.push(readerLine, doneLine(menu));
  await expect(page.getByRole("heading", { name: "Det här passar er" })).toBeVisible();
  await expect(page.getByTestId("menu-unfiltered")).toHaveText("Allergener är inte filtrerade");
  await expect(page.locator("[data-tone='mint'], [data-tone='sand'], [data-tone='danger']")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Du" }).getByRole("radio")).toHaveCount(3);
  await page.screenshot({ path: `${shots}/14-answer-alone.png` });

  // Läs noggrannare: the same photo again with quality careful, and then it is no longer offered.
  await page.getByRole("button", { name: "Läs noggrannare" }).click();
  await expect(page.getByText("Det här tar längre tid")).toBeVisible();
  await page.screenshot({ path: `${shots}/15-reading-careful.png` });
  await expect.poll(() => stream.qualities()).toEqual(["standard", "careful"]);
  await stream.push(readerLine, doneLine(menu, "careful"));
  await expect(page.getByTestId("menu-reader")).toHaveText("Läst av Sonnet 5.5 · medel");
  await expect(page.getByRole("button", { name: "Läs noggrannare" })).toHaveCount(0);
});

test("a dish with an allergen of the person, and nothing else to give, is shown red with the reason", async ({ page }) => {
  await optionOn(page);
  await seedFoodProfile(await e2eUserId(e2eEmail), { allergies: ["notter"] });
  const stream = await liveStream(page);
  await page.goto("/matsedel/menyer");
  await takePhoto(page);
  await stream.push(readerLine, doneLine(nutMenu));
  // Every dish with the allergen is flagged in red, never hidden (Pontus 2026-11-09): all of them are options here.
  const flagged = page.getByRole("radio", { name: /Ensalada mixta|Pesto de almendras/ });
  await expect(flagged.first()).toBeVisible();
  const count = await flagged.count();
  expect(count).toBeGreaterThan(0);
  await expect(page.getByText("Inget annat på menyn passar. Den här innehåller en allergen du har, fråga personalen.")).toBeVisible();
  // One red reason per flagged dish at least (the first dish also says that nothing else fits).
  await expect.poll(() => page.locator("[data-tone='danger']").count()).toBeGreaterThanOrEqual(count);
  await page.screenshot({ path: `${shots}/16-answer-allergy.png` });
  await page.getByRole("button", { name: "Klart", exact: true }).click();
  await expect(page.getByTestId("menu-choice-person")).toContainText("Inget annat på menyn passar");
  await page.screenshot({ path: `${shots}/17-choice-allergy.png` });
});

test("Bara förklara menyn: reading, then the whole menu with no advice and no marks on people", async ({ page }) => {
  await optionOn(page);
  await seedCompany();
  const stream = await liveStream(page);
  await page.goto("/matsedel/menyer");
  await takePhoto(page, "menu-explain");
  await stream.push(readerLine, doneLine(menu));
  await expect(page.getByRole("heading", { name: "Hela menyn" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Det här passar er" })).toHaveCount(0);
  await expect(page.getByTestId("menu-unfit")).toHaveCount(0);
  await page.getByTestId("menu-dish").first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByTestId("menu-dish-fit")).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: /Lägg till åt/ })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Lägg till Ikväll" }).click();
  await sheet.getByRole("button", { name: "Klar", exact: true }).click();
  await page.getByTestId("menu-tonight-open").click();
  await expect(page.getByTestId("menu-tonight-row")).toHaveCount(1);
  await expect(page.getByTestId("menu-tonight-total")).toContainText("Totalt ca 77 kr");
  await page.screenshot({ path: `${shots}/18-explain-tonight.png` });
});

test("a stream that cannot be used falls back to the plain reading", async ({ page }) => {
  await optionOn(page);
  let plain = 0;
  await page.route("**/api/menu/read?stream=1", (route) => route.abort());
  await page.route("**/api/menu/read", (route) => {
    plain += 1;
    return route.fulfill({ json: { ok: true, data: { menu, quality: "standard", escalated: false } } });
  });
  await page.goto("/matsedel/menyer");
  await takePhoto(page);
  await expect(page.getByRole("heading", { name: "Det här passar er" })).toBeVisible();
  expect(plain).toBe(1);
});

test("a failed reading says why right under the question, without scrolling", async ({ page }) => {
  await optionOn(page);
  await page.route("**/api/menu/read?stream=1", (route) => route.fulfill({ json: { ok: false, error: { code: "ai_cap_reached" } } }));
  await page.goto("/matsedel/menyer");
  await takePhoto(page);
  const alert = page.getByRole("alert").filter({ hasText: "Dagens AI-tak är nått" });
  await expect(alert).toBeVisible();
  await expect(alert).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("heading", { name: "Tolka menyn" })).toBeVisible();
  await page.screenshot({ path: `${shots}/19-error-cap.png` });
});

test("a reading that could not be run says so in calm words", async ({ page }) => {
  await optionOn(page);
  await page.route("**/api/menu/read?stream=1", (route) => route.fulfill({ status: 503, json: { ok: false, error: { code: "ai_unavailable" } } }));
  await page.route("**/api/menu/read", (route) => route.fulfill({ status: 503, json: { ok: false, error: { code: "ai_unavailable" } } }));
  await page.goto("/matsedel/menyer");
  await takePhoto(page);
  const alert = page.getByRole("alert").filter({ hasText: "Det gick inte" });
  await expect(alert).toHaveText("Det gick inte att läsa menyn just nu. Försök igen.");
  await expect(alert).toBeInViewport({ ratio: 1 });
});

test("a reading with no dishes says so and gives tips", async ({ page }) => {
  await optionOn(page);
  const stream = await liveStream(page);
  await page.goto("/matsedel/menyer");
  await takePhoto(page);
  await stream.push(readerLine, doneLine({ ...menu, ratter: [] }));
  await expect(page.getByText("Jag kunde inte läsa menyn")).toBeVisible();
  await expect(page.getByText("Undvik blänk från lampor och glas")).toBeVisible();
  await page.screenshot({ path: `${shots}/20-empty.png` });
});

test("Avbryt on the reading screen goes back to the start", async ({ page }) => {
  await optionOn(page);
  await liveStream(page);
  await page.goto("/matsedel/menyer");
  await takePhoto(page);
  await expect(page.getByTestId("menu-reading")).toBeVisible();
  await page.getByRole("button", { name: "Avbryt" }).click();
  await expect(page.getByRole("heading", { name: "Tolka menyn" })).toBeVisible();
  await expect(page.locator("p[role=alert]")).toHaveCount(0);
});

test("Större text: the start, the reading, the answer and Ert val fit at 375 px", async ({ page }) => {
  await optionOn(page, "xl");
  await seedCompany();
  const stream = await liveStream(page);
  await page.goto("/matsedel/menyer");
  await page.screenshot({ path: `${shots}/21-xl-start.png` });
  await page.getByTestId("menu-company-row").click();
  await page.getByRole("button", { name: "Anna" }).click();
  await page.getByRole("button", { name: "Klar", exact: true }).click();
  await takePhoto(page);
  await stream.push(readerLine, { type: "dish", index: 0, dish: menu.ratter[0] }, { type: "dish", index: 1, dish: menu.ratter[1] });
  await expect(page.getByTestId("menu-reading-dishes").getByRole("listitem")).toHaveCount(2);
  await page.screenshot({ path: `${shots}/22-xl-reading.png` });
  await stream.push(doneLine(menu));
  await expect(page.getByRole("heading", { name: "Det här passar er" })).toBeVisible();
  await expect(page.getByTestId("menu-footer")).toBeInViewport();
  await page.screenshot({ path: `${shots}/23-xl-answer.png` });
  expect(await noSideScroll(page)).toBe(true);
  await page.getByRole("button", { name: "Klart", exact: true }).click();
  await page.screenshot({ path: `${shots}/24-xl-choice.png` });
  expect(await noSideScroll(page)).toBe(true);
});

test("Smak och allergier is on Medlemmar without Menyrådgivare: open, set vitlök to Ogillar, it stays after a reload; the old address leads there", async ({ page }) => {
  await page.goto("/installningar/medlemmar");
  const section = page.getByTestId("menu-profiles");
  await expect(section.getByRole("heading", { name: "Smak och allergier" })).toBeVisible();
  await expect(section.getByText("Utan konto")).toBeVisible();
  const mine = section.getByTestId("menu-profile-row").first();
  await expect(mine).toContainText("Du");
  await expect(mine).toContainText("Inget ifyllt: äter allt");
  await page.screenshot({ path: "test-results/shots/medlemmar-smak.png", fullPage: true });
  await mine.click();
  await expect(page).toHaveURL(/\/installningar\/medlemmar\/smak-och-allergier\?person=me$/);
  await expect(page.getByTestId("taste-summary")).toContainText("Inget ifyllt: äter allt");
  await page.screenshot({ path: "test-results/shots/smak-profil-tom.png", fullPage: true });
  await page.getByRole("button", { name: /Smaker och råvaror/ }).click();
  const garlic = page.getByRole("slider", { name: "Vitlök" });
  await expect(garlic).toHaveAttribute("aria-valuetext", "Okej");
  await garlic.focus();
  await page.keyboard.press("Home");
  await expect(garlic).toHaveAttribute("aria-valuetext", "Ogillar");
  await expect(page.getByTestId("taste-summary")).toContainText("undviker vitlök");
  await page.screenshot({ path: "test-results/shots/smak-profil.png", fullPage: true });
  await expect.poll(async () => (await savedRows()).find((row) => row.person_key.startsWith("m-"))?.tastes).toMatchObject({ vitlok: -2 });
  await page.reload();
  await page.getByRole("button", { name: /Smaker och råvaror/ }).click();
  await expect(page.getByRole("slider", { name: "Vitlök" })).toHaveAttribute("aria-valuetext", "Ogillar");
  await page.getByRole("link", { name: "Medlemmar" }).first().click();
  await expect(page.getByTestId("menu-profile-row").first()).toContainText("Undviker: vitlök");

  await page.goto("/installningar/tillval/aata-ute");
  await expect(page).toHaveURL(/\/installningar\/medlemmar#smak-och-allergier$/);
  await page.goto("/installningar/tillval");
  await expect(page.getByTestId("menu-profiles-link")).toHaveCount(0);
  // Menyrådgivare itself is still off: no way into it from Matsedel.
  await page.goto("/matsedel");
  await expect(page.getByText("Äter ute?")).toHaveCount(0);
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
  await profile.getByRole("button", { name: /Smaker och råvaror/ }).click();
  await profile.getByRole("slider", { name: "Koriander" }).focus();
  await page.keyboard.press("Home");
  await expect(page.getByTestId("menu-profiles-notice")).toHaveCount(0);
  await expect(profile.getByRole("slider", { name: "Koriander" })).toHaveAttribute("aria-valuetext", "Ogillar");

  // The saves have reached the database when the reload shows them.
  await expect
    .poll(async () => {
      const rows = await savedRows();
      return JSON.stringify(rows.find((row) => row.name === "Maja")?.tastes ?? null);
    })
    .toBe('{"koriander":-2}');
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
  await phone.getByRole("button", { name: /Smaker och råvaror/ }).click();
  await expect(phone.getByRole("slider", { name: "Koriander" })).toHaveAttribute("aria-valuetext", "Ogillar");
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
  expect(rows.find((row) => row.person_key === "p-gammal1")).toMatchObject({ kind: "guest", name: "Gammal gäst", tastes: { lok: -2 } });

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
    .select("person_key, kind, name, allergies, dislikes, tastes, drink")
    .eq("household_id", member.data!.household_id);
  if (error) throw error;
  return data as { person_key: string; kind: string; name: string | null; allergies: string[]; dislikes: string[]; tastes: Record<string, number>; drink: string | null }[];
}
