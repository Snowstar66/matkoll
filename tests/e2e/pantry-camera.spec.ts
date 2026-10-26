import { expect, type Page, test } from "@playwright/test";
import { adminClient, cameraEmail, cameraStorageState, e2eUserId } from "./support";

// Story 6.1: the camera button on Hemma and lagerförslag from a photo, with
// AI_PROVIDER=mock. The fixture photos are synthetic PNGs that already fit
// (720 × 900 px), so the client sends them as they are and the mock answers
// them by their bytes: kyl.png gives six items (kyl.analyze.json),
// tom-hylla.png none, and the reserved PNGs an error code. The spec has an E2E
// user of its own (cameraEmail): before each test the service role makes the
// catalog ingredient "mjölk" and the pantry item "mjölk 2 förp" in Kyl, and
// nothing else, so a photo of Kyl is compared with it (Story 6.4): mjölk is
// "Ändrat" and the other five "Nytt". The tests run in order, since they
// share the user.

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
  await expect(cards(page).getByRole("heading", { level: 4 })).toHaveText(["grädde", "gurka", "ketchup", "smör", "ägg", "mjölk"]);
  const expected: [string, string, boolean, string | null][] = [
    ["grädde", "1 förp · Kyl", true, null],
    ["gurka", "2 st · Kyl", true, null],
    ["ketchup", "Finns hemma · Kyl", true, null],
    ["smör", "1 förp · Kyl", true, null],
    ["ägg", "6 st · Kyl", true, null],
    ["mjölk", "1 förp · Kyl", false, "nu: 2 förp → bilden: 1 förp"],
  ];
  for (const [index, [name, amount, isNew, now]] of expected.entries()) {
    const shown = cards(page).nth(index);
    await expect(shown.getByRole("heading", { level: 4 })).toHaveText(name);
    await expect(shown.getByText(amount, { exact: true })).toBeVisible();
    await expect(shown.getByText("Ny", { exact: true })).toHaveCount(isNew ? 1 : 0);
    if (now) await expect(shown.getByText(now, { exact: true })).toBeVisible();
    else await expect(shown.getByText(/ nu: /)).toHaveCount(0);
  }
  // The camera button is back, and nothing was saved.
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
});

async function readFixture(path: string): Promise<Buffer> {
  const { readFile } = await import("node:fs/promises");
  return readFile(path);
}
