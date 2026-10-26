import { expect, type Page, test } from "@playwright/test";
import { adminClient, cardTitles, cameraEmail, cameraStorageState, e2eUserId } from "./support";

// Story 6.1: the camera button on Hemma and lagerförslag from a photo, with
// AI_PROVIDER=mock. The fixture photos are synthetic PNGs that already fit
// (720 × 900 px), so the client sends them as they are and the mock answers
// them by their bytes: kyl.png gives six items (kyl.analyze.json),
// tom-hylla.png none, and the reserved PNGs an error code. The spec has an E2E
// user of its own (cameraEmail): before each test the service role makes the
// catalog ingredient "mjölk" and the pantry item "mjölk 2 förp" in Kyl, and
// nothing else, so a photo of Kyl is compared with it (Story 6.4): mjölk is
// "Ändrat" and the other five "Nytt". The tests run in order, since they
// share the user. Story 6.6: the mock answers /api/ai/locate for kyl.png with
// kyl.locate.json, a point on each of its six items.

const kyl = "tests/fixtures/ai/kyl.png";
const emptyShelf = "tests/fixtures/ai/tom-hylla.png";
const unavailablePhoto = "tests/fixtures/ai/reserved-ai_unavailable.png";
const analyzeRoute = "**/api/ai/analyze";

test.use({ storageState: cameraStorageState, viewport: { width: 375, height: 812 } });
test.describe.configure({ mode: "serial" });

let userId = "";
test.beforeAll(async () => {
  userId = await e2eUserId(cameraEmail);
});

test.beforeEach(async () => {
  const admin = adminClient();
  const catalog = await admin
    .from("ingredient")
    .upsert(
      { user_id: userId, name: "mjölk", normalized_name: "mjölk", section: "Mejeri", location: "Kyl", default_unit: "förp" },
      { onConflict: "user_id,normalized_name" },
    )
    .select("id")
    .single();
  if (catalog.error) throw catalog.error;
  const removed = await admin.from("pantry_item").delete().eq("user_id", userId);
  if (removed.error) throw removed.error;
  const inserted = await admin
    .from("pantry_item")
    .insert({ user_id: userId, ingredient_id: catalog.data.id, location: "Kyl", amount: 2, unit: "förp" });
  if (inserted.error) throw inserted.error;
});

/** The user's rows in the tables an analysis must never write. */
async function rowCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of ["pantry_item", "ingredient", "ingredient_synonym"] as const) {
    const { count, error } = await adminClient().from(table).select("id", { count: "exact", head: true }).eq("user_id", userId);
    if (error) throw error;
    counts[table] = count ?? 0;
  }
  return counts;
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

/** Counts the calls to /api/ai/analyze. */
function countAnalyses(page: Page): () => number {
  let calls = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/ai/analyze")) calls++;
  });
  return () => calls;
}

// Earlier routes stay mounted but hidden after a client navigation, so every
// locator is scoped to what is visible.
const camera = (page: Page) => page.getByTestId("pantry-camera").filter({ visible: true });
const section = (page: Page) => page.getByTestId("pantry-suggestions").filter({ visible: true });
const cards = (page: Page) => section(page).getByTestId("pantry-suggestion");
const card = (page: Page, name: "Kyl" | "Frys" | "Skafferi") =>
  page.getByRole("navigation", { name: "Platser" }).getByRole("link", { name: new RegExp(`^${name}`) });
const cameraButton = (page: Page, name: string) => camera(page).getByRole("button", { name });

/** Presses the camera button and chooses `file` in the file chooser it opens (the desktop's file picker, or the phone's camera). */
async function photograph(page: Page, button: string, file: string) {
  const chooser = page.waitForEvent("filechooser");
  await cameraButton(page, button).click();
  await (await chooser).setFiles(file);
}

/** Holds every analysis until `release`, as a slow model would. */
async function holdAnalyses(page: Page) {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(analyzeRoute, async (route) => {
    await held;
    await route.continue().catch(() => {});
  });
  return () => release();
}

test("the camera button follows the chosen card, and nothing asks the AI before a photo", async ({ page }) => {
  const errors = watchErrors(page);
  const analyses = countAnalyses(page);
  await page.goto("/hemma");
  await expect(cameraButton(page, "Fotografera kylen")).toBeVisible();
  // Under the cards, before the list.
  const buttonBox = await cameraButton(page, "Fotografera kylen").boundingBox();
  const cardBox = await card(page, "Kyl").boundingBox();
  const rowBox = await page.getByTestId("pantry-row").filter({ visible: true }).first().boundingBox();
  expect(buttonBox!.y).toBeGreaterThan(cardBox!.y + cardBox!.height - 1);
  expect(rowBox!.y).toBeGreaterThan(buttonBox!.y + buttonBox!.height - 1);
  expect(buttonBox!.height).toBeGreaterThanOrEqual(44);

  await card(page, "Frys").click();
  await expect(cameraButton(page, "Fotografera frysen")).toBeVisible();
  await card(page, "Skafferi").click();
  await expect(cameraButton(page, "Fotografera skafferiet")).toBeVisible();
  // An empty place keeps the camera above its empty state.
  await expect(page.getByText("Inget i skafferiet än.").filter({ visible: true })).toBeVisible();
  await card(page, "Kyl").click();
  await expect(cameraButton(page, "Fotografera kylen")).toBeVisible();

  // A desktop pointer: the file picker, without capture, and no "Välj bild".
  await expect(camera(page).getByRole("button", { name: "Välj bild" })).toHaveCount(0);
  const chooser = page.waitForEvent("filechooser");
  await cameraButton(page, "Fotografera kylen").click();
  expect(await (await chooser).element().getAttribute("capture")).toBeNull();

  expect(analyses()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("a photo of the fridge gives six suggestions, writes nothing, and they stay when Frys is chosen", async ({ page }) => {
  const errors = watchErrors(page);
  const analyses = countAnalyses(page);
  const before = await rowCounts();
  await page.goto("/hemma");
  await photograph(page, "Fotografera kylen", kyl);

  const heading = section(page).getByRole("heading", { level: 2, name: "Lagerförslag från kylen" });
  await expect(heading).toBeFocused();
  await expect(cards(page)).toHaveCount(6);
  // Kyl has mjölk (Story 6.4): the photo is compared with it, so mjölk is "Ändrat" and the rest "Nytt".
  await expect(section(page).getByRole("heading", { level: 3 })).toHaveText(["Nytt", "Ändrat"]);
  // Story 6.5: a card's title is the label on the package, with the catalog ingredient under it when it differs.
  await expect(cards(page).getByRole("heading", { level: 4 })).toHaveText(cardTitles([
    "Vispgrädde 3 dl",
    "gurka",
    "ketchup",
    "Smör 500 g",
    "ägg",
    "Mellanmjölk 1,5 %",
  ]));
  const expected: [string, string | null, string, boolean, string | null][] = [
    ["Vispgrädde 3 dl", "grädde", "1 förp · Kyl", true, null],
    ["gurka", null, "2 st · Kyl", true, null],
    ["ketchup", null, "Finns hemma · Kyl", true, null],
    ["Smör 500 g", "smör", "1 förp · Kyl", true, null],
    ["ägg", null, "6 st · Kyl", true, null],
    ["Mellanmjölk 1,5 %", "mjölk", "1 förp · Kyl", false, "nu: 2 förp → bilden: 1 förp"],
  ];
  for (const [index, [title, name, amount, isNew, now]] of expected.entries()) {
    const shown = cards(page).nth(index);
    await expect(shown.getByRole("heading", { level: 4 })).toHaveText(cardTitles([title]));
    if (name) await expect(shown.getByText(`Sparas som: ${name}`, { exact: true })).toBeVisible();
    await expect(shown.getByText("Osäker", { exact: true })).toHaveCount(0);
    await expect(shown.getByText(amount, { exact: true })).toBeVisible();
    await expect(shown.getByText("Ny", { exact: true })).toHaveCount(isNew ? 1 : 0);
    if (now) await expect(shown.getByText(now, { exact: true })).toBeVisible();
    else await expect(shown.getByText(/ nu: /)).toHaveCount(0);
  }
  // The photo that was read sits under the heading as an object URL in the browser only (AD-15), and opens larger.
  const photo = section(page).getByRole("button", { name: "Fotot av kylen, visa större" });
  await expect(photo).toBeVisible();
  await expect(photo.locator("img")).toHaveAttribute("src", /^blob:/);
  // At 375 px the thumbnail fits inside the viewport.
  expect(page.viewportSize()?.width).toBe(375);
  const photoBox = await photo.boundingBox();
  expect(photoBox!.x).toBeGreaterThanOrEqual(0);
  expect(photoBox!.x + photoBox!.width).toBeLessThanOrEqual(375);
  await photo.click();
  const photoSheet = page.getByRole("dialog", { name: "Fotot av kylen" });
  await expect(photoSheet.getByRole("img", { name: "Fotot av kylen som förslagen kommer från" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // A tap shows it in full size, scrolling inside the sheet and never the page.
  const fullSize = photoSheet.getByRole("button", { name: "Visa i full storlek" });
  await fullSize.click();
  await expect(fullSize).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await photoSheet.getByRole("button", { name: "Stäng" }).click();
  await expect(photoSheet).toBeHidden();
  await expect(photo).toBeFocused();
  // The camera button is back, and nothing was saved or sent again.
  await expect(cameraButton(page, "Fotografera kylen")).toBeVisible();
  expect(analyses()).toBe(1);
  expect(await rowCounts()).toEqual(before);

  // Another card: the button follows it, the suggestions stay with the fridge.
  await card(page, "Frys").click();
  await expect(cameraButton(page, "Fotografera frysen")).toBeVisible();
  await expect(section(page).getByRole("heading", { level: 2 })).toHaveText("Lagerförslag från kylen");
  await expect(cards(page)).toHaveCount(6);
  await expect(cards(page).first().getByText("1 förp · Kyl", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(analyses()).toBe(1);
  expect(errors).toEqual([]);
});

test("the cards come first, then their numbers, and the large photo has the same numbers on the items (Story 6.6)", async ({
  page,
}) => {
  const errors = watchErrors(page);
  let locates = 0;
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  // The lookup is held until the cards have been checked, as a slow model would.
  await page.route("**/api/ai/locate", async (route) => {
    locates++;
    await held;
    await route.continue().catch(() => {});
  });
  const before = await rowCounts();
  await page.goto("/hemma");
  await photograph(page, "Fotografera kylen", kyl);

  await expect(cards(page)).toHaveCount(6);
  await expect(section(page).getByTestId("pantry-photo-number")).toHaveCount(0);
  await expect(section(page).getByRole("status").filter({ hasText: "Letar upp varorna på fotot …" })).toBeVisible();
  // Nothing waits for the numbers.
  await expect(section(page).getByRole("button", { name: "Bekräfta alla" })).toBeEnabled();
  await expect.poll(() => locates).toBe(1);
  release();

  // Each card has the number of its item in kyl.png's reading: mellanmjölk 1, vispgrädde 2, smör 3, ägg 4, gurka 5, ketchup 6.
  await expect(section(page).getByText("Numren på korten visar var varorna är på fotot.")).toBeVisible();
  const expected = [
    ["Vispgrädde 3 dl", 2],
    ["gurka", 5],
    ["ketchup", 6],
    ["Smör 500 g", 3],
    ["ägg", 4],
    ["Mellanmjölk 1,5 %", 1],
  ] as const;
  for (const [index, [title, number]] of expected.entries()) {
    const shown = cards(page).nth(index);
    await expect(shown.getByRole("heading", { level: 4 })).toHaveText(cardTitles([title]));
    await expect(shown.getByText(`Nummer ${number} på fotot`, { exact: true })).toBeAttached();
    await expect(shown.getByTestId("pantry-photo-number")).toHaveText(String(number));
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await section(page).getByRole("button", { name: "Fotot av kylen, visa större" }).click();
  const photoSheet = page.getByRole("dialog", { name: "Fotot av kylen" });
  const markers = photoSheet.getByTestId("pantry-photo-marker");
  await expect(markers).toHaveText(["2", "5", "6", "3", "4", "1"]);
  for (const marker of await markers.all()) await expect(marker).toHaveAttribute("aria-hidden", "true");
  // Marker 1 sits on the milk, at 19.3 % and 19.3 % of the photo, fitted and in full size.
  const frame = photoSheet.getByTestId("pantry-photo-frame");
  const markerAt = async () => {
    const box = (await frame.boundingBox())!;
    const dot = (await markers.nth(5).boundingBox())!;
    return [(dot.x + dot.width / 2 - box.x) / box.width, (dot.y + dot.height / 2 - box.y) / box.height];
  };
  // Polled: the sheet slides in and the frame takes the decoded size after load, so one early read can be off.
  const markerOffset = async () => Math.max(...(await markerAt()).map((share) => Math.abs(share - 0.193)));
  await expect.poll(markerOffset).toBeLessThan(0.005);
  const fullSize = photoSheet.getByRole("button", { name: "Visa i full storlek" });
  await fullSize.click();
  await expect(fullSize).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await frame.boundingBox())!.width).toBeCloseTo(720, 0);
  await expect.poll(markerOffset).toBeLessThan(0.005);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await photoSheet.getByRole("button", { name: "Stäng" }).click();
  await expect(photoSheet).toBeHidden();

  // A card handled takes its number off the photo; nothing was saved by the lookup.
  await section(page).getByRole("button", { name: "Avvisa gurka" }).click();
  await expect(cards(page)).toHaveCount(5);
  await section(page).getByRole("button", { name: "Fotot av kylen, visa större" }).click();
  await expect(photoSheet.getByTestId("pantry-photo-marker")).toHaveText(["2", "6", "3", "4", "1"]);
  expect(await rowCounts()).toEqual(before);
  expect(locates).toBe(1);
  expect(errors).toEqual([]);
});

test("a lookup that fails leaves the cards without numbers and without an error (Story 6.6)", async ({ page }) => {
  await page.route("**/api/ai/locate", (route) =>
    route.fulfill({ status: 503, json: { ok: false, error: { code: "ai_unavailable", message: "x" } } }),
  );
  await page.goto("/hemma");
  await photograph(page, "Fotografera kylen", kyl);
  await expect(cards(page)).toHaveCount(6);
  await expect(section(page).getByText("Letar upp varorna på fotot …")).toHaveCount(0);
  await expect(section(page).getByTestId("pantry-photo-number")).toHaveCount(0);
  await expect(section(page).getByRole("alert")).toHaveCount(0);
  await expect(camera(page).getByRole("alert")).toHaveCount(0);
  await section(page).getByRole("button", { name: "Fotot av kylen, visa större" }).click();
  await expect(page.getByRole("dialog", { name: "Fotot av kylen" }).getByTestId("pantry-photo-marker")).toHaveCount(0);
});

test("the suggestions go when Hemma is left through the tab bar and opened again", async ({ page }) => {
  await page.goto("/hemma");
  await photograph(page, "Fotografera kylen", kyl);
  await expect(cards(page)).toHaveCount(6);

  const tabs = page.getByRole("navigation", { name: "Huvudmeny" }).filter({ visible: true });
  await tabs.getByRole("link", { name: "Recept" }).click();
  await expect(page).toHaveURL(/\/recept$/);
  await tabs.getByRole("link", { name: "Hemma" }).click();
  await expect(page).toHaveURL(/\/hemma/);
  await expect(cameraButton(page, "Fotografera kylen")).toBeVisible();
  await expect(section(page)).toHaveCount(0);
  await expect(page.getByTestId("pantry-suggestion")).toHaveCount(0);
});

test("Avbryt stops the analysis without an error, and the camera button takes focus", async ({ page }) => {
  const errors = watchErrors(page);
  const release = await holdAnalyses(page);
  await page.goto("/hemma");
  await photograph(page, "Fotografera kylen", kyl);

  await expect(camera(page).getByRole("status").getByText("Tittar på bilden …")).toBeVisible();
  await expect(cameraButton(page, "Fotografera kylen")).toHaveCount(0);
  const aborted = page.waitForEvent("requestfailed", (request) => request.url().endsWith("/api/ai/analyze"));
  await camera(page).getByRole("button", { name: "Avbryt" }).click();
  await aborted;
  release();

  await expect(cameraButton(page, "Fotografera kylen")).toBeFocused();
  await expect(camera(page).getByText("Tittar på bilden …")).toHaveCount(0);
  await expect(camera(page).getByRole("alert")).toHaveCount(0);
  await expect(section(page)).toHaveCount(0);
  expect(errors.filter((error) => !error.includes("Failed to load resource"))).toEqual([]);
});

test("choosing Frys while the fridge is analysed keeps the analysis, and its suggestions are the fridge's", async ({ page }) => {
  const release = await holdAnalyses(page);
  await page.goto("/hemma");
  await photograph(page, "Fotografera kylen", kyl);
  await expect(camera(page).getByText("Tittar på bilden …")).toBeVisible();

  await card(page, "Frys").click();
  await expect(card(page, "Frys")).toHaveAttribute("aria-current", "true");
  // Still analysing in the new place's camera area.
  await expect(camera(page).getByText("Tittar på bilden …")).toBeVisible();
  release();

  await expect(section(page).getByRole("heading", { level: 2 })).toHaveText("Lagerförslag från kylen");
  await expect(cards(page)).toHaveCount(6);
  await expect(cameraButton(page, "Fotografera frysen")).toBeVisible();
  await expect(cards(page).filter({ hasText: "· Frys" })).toHaveCount(0);
});

test("a photo without food of an empty place says so and offers to add an item by hand", async ({ page }) => {
  await page.goto("/hemma?plats=frys");
  await photograph(page, "Fotografera frysen", emptyShelf);
  const status = camera(page).getByRole("status").filter({
    hasText: "Hittade inga varor på bilden. Prova ett ljusare foto eller lägg till för hand.",
  });
  await expect(status).toBeVisible();
  await expect(section(page)).toHaveCount(0);
  await camera(page).getByRole("button", { name: "Lägg till vara" }).click();
  await expect(page.getByRole("dialog", { name: "Lagervara" })).toBeVisible();
});

test("a photo without food of the fridge lists what it has under Syns inte längre, with the warning", async ({ page }) => {
  const before = await rowCounts();
  await page.goto("/hemma");
  await photograph(page, "Fotografera kylen", emptyShelf);
  await expect(section(page).getByRole("heading", { level: 3 })).toHaveText(["Syns inte längre"]);
  await expect(section(page).getByTestId("pantry-missing")).toHaveCount(1);
  await expect(section(page).getByTestId("pantry-missing")).toContainText("mjölk");
  await expect(
    section(page).getByText("Några varor på bilden gick inte att tolka. Kontrollera innan du tar bort."),
  ).toBeVisible();
  // Only Ta bort removes from an incomplete comparison.
  await expect(section(page).getByRole("button", { name: "Bekräfta alla" })).toBeDisabled();
  await expect(camera(page).getByText("Hittade inga varor på bilden.", { exact: false })).toHaveCount(0);
  expect(await rowCounts()).toEqual(before);
});

test("the AI out of reach: the text and Försök igen with the same photo, while the list and + work", async ({ page }) => {
  const analyses = countAnalyses(page);
  await page.goto("/hemma");
  await photograph(page, "Fotografera kylen", unavailablePhoto);
  const alert = camera(page).getByRole("alert");
  await expect(alert).toHaveText("AI-tjänsten svarar inte just nu. Är datorn med modellen igång?");

  // The rest of Hemma works.
  await expect(page.getByTestId("pantry-row").filter({ visible: true })).toHaveText([/^mjölk\s*2 förp$/]);
  await page.getByRole("button", { name: "Lägg till vara" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Lagervara" });
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  // The same photo again, from memory, without choosing a file: the mock knows it by its bytes.
  await camera(page).getByRole("button", { name: "Försök igen" }).click();
  await expect.poll(analyses).toBe(2);
  await expect(alert).toHaveText("AI-tjänsten svarar inte just nu. Är datorn med modellen igång?");

  // A photo that works takes the error away.
  await photograph(page, "Fotografera kylen", kyl);
  await expect(cards(page)).toHaveCount(6);
  await expect(camera(page).getByRole("alert")).toHaveCount(0);
});

test.describe("on a phone", () => {
  test.use({ hasTouch: true, isMobile: true });

  test("Fotografera kylen opens the back camera; Välj bild opens the library", async ({ page }) => {
    await page.goto("/hemma");
    const cameraChooser = page.waitForEvent("filechooser");
    await cameraButton(page, "Fotografera kylen").click();
    const back = await cameraChooser;
    expect(await back.element().getAttribute("capture")).toBe("environment");
    expect(await back.element().getAttribute("accept")).toBe("image/*");
    await back.setFiles(kyl);
    await expect(cards(page)).toHaveCount(6);

    const picker = page.waitForEvent("filechooser");
    await camera(page).getByRole("button", { name: "Välj bild" }).click();
    expect(await (await picker).element().getAttribute("capture")).toBeNull();
  });
});

test.describe("/api/ai/analyze", () => {
  test("answers 401 without a session", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const response = await context.request.post("/api/ai/analyze", {
      multipart: { image: { name: "kyl.png", mimeType: "image/png", buffer: await readFixture(kyl) }, location: "Kyl" },
    });
    expect(response.status()).toBe(401);
    await context.close();
  });

  test("answers validation without asking the AI for a place that does not exist", async ({ request }) => {
    const response = await request.post("/api/ai/analyze", {
      multipart: { image: { name: "kyl.png", mimeType: "image/png", buffer: await readFixture(kyl) }, location: "Källare" },
    });
    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "validation" } });
  });

  test("answers validation for a `site` that is not a uuid, and pantry_site_gone for one that is not the user's (Story 8.4)", async ({
    request,
  }) => {
    const image = { name: "kyl.png", mimeType: "image/png", buffer: await readFixture(kyl) };
    const forged = await request.post("/api/ai/analyze", { multipart: { image, location: "Kyl", site: "stugan" } });
    expect(forged.status()).toBe(400);
    expect(await forged.json()).toMatchObject({ ok: false, error: { code: "validation" } });

    const gone = await request.post("/api/ai/analyze", {
      multipart: { image, location: "Kyl", site: "00000000-0000-4000-8000-000000000000" },
    });
    expect(gone.status()).toBe(409);
    expect(await gone.json()).toMatchObject({ ok: false, error: { code: "pantry_site_gone" } });
  });
});

test.describe("/api/ai/locate (Story 6.6)", () => {
  const labels = JSON.stringify(["Mellanmjölk 1,5 %", "Vispgrädde 3 dl"]);

  test("answers 401 without a session", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const response = await context.request.post("/api/ai/locate", {
      multipart: { image: { name: "kyl.png", mimeType: "image/png", buffer: await readFixture(kyl) }, labels },
    });
    expect(response.status()).toBe(401);
    await context.close();
  });

  test("answers the points for the labels sent, and validation for labels over the limits", async ({ request }) => {
    const image = { name: "kyl.png", mimeType: "image/png", buffer: await readFixture(kyl) };
    const response = await request.post("/api/ai/locate", { multipart: { image, labels } });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        positions: [
          { n: 1, x: 193, y: 193 },
          { n: 2, x: 432, y: 225 },
        ],
      },
    });
    const tooMany = JSON.stringify(Array.from({ length: 26 }, (_, index) => `Vara ${index}`));
    const refused = await request.post("/api/ai/locate", { multipart: { image, labels: tooMany } });
    expect(refused.status()).toBe(400);
    expect(await refused.json()).toMatchObject({ ok: false, error: { code: "validation" } });
  });
});

async function readFixture(path: string): Promise<Buffer> {
  const { readFile } = await import("node:fs/promises");
  return readFile(path);
}
