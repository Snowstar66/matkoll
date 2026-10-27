import { readFileSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { adminClient, e2eUserId, libraryEmail, libraryStorageState } from "./support";

// Story 1.10: the recipe library with search, the filters Alla and Favoriter,
// and the heart, with AI_PROVIDER=mock. The spec has an E2E user of its own,
// so the list holds exactly what it saves. The tests build on each other and
// run in order; a retry starts again from an empty library.

const kycklinggryta = readFileSync("tests/fixtures/ai/kycklinggryta.txt", "utf8");
const linssoppa = readFileSync("tests/fixtures/ai/linssoppa.txt", "utf8");
const gryta = "Krämig kycklinggryta med curry";
const soppa = "Röd linssoppa med kokosmjölk";
const mobile = { width: 390, height: 844 };
const recipePath = /\/recept\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test.use({ storageState: libraryStorageState, viewport: mobile });
test.describe.configure({ mode: "serial" });

let userId = "";

test.beforeAll(async () => {
  userId = await e2eUserId(libraryEmail);
  const { error } = await adminClient().from("recipe").delete().eq("user_id", userId);
  if (error) throw error;
});

/** Collects console errors and uncaught exceptions for the page. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

const sheet = (page: Page) => page.getByRole("dialog", { name: "Importera recept" });
const rows = (page: Page) => page.getByTestId("recipe-card");
const row = (page: Page, title: string) => rows(page).filter({ hasText: title });
const heart = (row: Locator) => row.getByRole("button", { name: /^Favorit/ });
const searchField = (page: Page) => page.getByRole("searchbox", { name: "Sök recept" });
const pill = (page: Page, name: "Alla" | "Favoriter") => page.getByRole("radio", { name });

async function importAndSave(page: Page, text: string, title: string) {
  await page.locator("header").getByRole("button", { name: "Importera recept" }).click();
  await sheet(page).getByRole("tab", { name: "Text" }).click();
  await sheet(page).getByLabel("Recepttext").fill(text);
  await sheet(page).getByRole("button", { name: "Tolka" }).click();
  await expect(sheet(page).getByLabel("Titel")).toHaveValue(title);
  await sheet(page).getByRole("button", { name: "Spara recept" }).click();
  await expect(page).toHaveURL(recipePath);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

/** Waits for the answer to the next Server Action call (a POST with a Next-Action header). */
const actionAnswer = (page: Page) =>
  page.waitForResponse((response) => response.request().method() === "POST" && Boolean(response.request().headers()["next-action"]));

/** Taps a heart and waits until the server has answered the save. */
async function tapHeart(page: Page, button: Locator) {
  const answered = actionAnswer(page);
  await button.click();
  expect((await answered).ok()).toBe(true);
}

async function expectTitles(page: Page, titles: string[]) {
  await expect(rows(page).getByRole("link")).toHaveText(titles);
}

test("an empty library offers Importera recept", async ({ page }) => {
  await page.goto("/recept");
  await expect(page.getByText("Inga recept än. Klistra in en länk till ett recept du gillar.")).toBeVisible();
  await expect(page.getByRole("main").getByRole("button", { name: "Importera recept" })).toHaveCount(2);
  await expect(searchField(page)).toHaveCount(0);
});

test("saved recipes are listed newest first with time and servings, and a row opens the recipe", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/recept");
  await importAndSave(page, kycklinggryta, gryta);
  await page.goto("/recept");
  await importAndSave(page, linssoppa, soppa);

  await page.goto("/recept");
  await expectTitles(page, [soppa, gryta]);
  await expect(row(page, soppa).getByText("30 min · 6 portioner")).toBeVisible();
  await expect(row(page, gryta).getByText("40 min · 4 portioner")).toBeVisible();
  // No image address from pasted text: a short mint strip across the top of the card (Story 11.5).
  await expect(row(page, gryta).getByTestId("recipe-image-placeholder")).toBeVisible();
  const image = await row(page, gryta).getByTestId("recipe-image-placeholder").boundingBox();
  const card = await row(page, gryta).boundingBox();
  expect(image?.height).toBe(64);
  expect(image?.width).toBeCloseTo(card!.width, 0);
  await expect(pill(page, "Alla")).toBeChecked();

  // A tap on the row, not only on the title, opens the recipe.
  const box = await row(page, gryta).boundingBox();
  await page.mouse.click(box!.x + box!.width - 80, box!.y + box!.height - 10);
  await expect(page).toHaveURL(recipePath);
  await expect(page.getByRole("heading", { level: 1, name: gryta })).toBeVisible();
  expect(errors).toEqual([]);
});

test("search finds titles and ingredients, also through the catalog's names and synonyms", async ({ page }) => {
  await page.goto("/recept");
  await expectTitles(page, [soppa, gryta]);

  await searchField(page).fill("gryta");
  await expectTitles(page, [gryta]);

  // A line's original text: only the soup has coconut milk.
  await searchField(page).fill("kokosmjölk");
  await expectTitles(page, [soppa]);

  // "2 gula lökar" in the soup was matched to the catalog's "gul lök" when it
  // was imported, so the catalog name finds it too.
  await searchField(page).fill("gul lök");
  await expectTitles(page, [soppa, gryta]);

  // A synonym of the catalog ingredient.
  const { data: onion, error } = await adminClient()
    .from("ingredient")
    .select("id")
    .eq("user_id", userId)
    .eq("normalized_name", "gul lök")
    .single();
  if (error) throw error;
  const synonym = await adminClient()
    .from("ingredient_synonym")
    .upsert({ user_id: userId, ingredient_id: onion.id, normalized: "schalottenlök" }, { onConflict: "user_id,normalized", ignoreDuplicates: true });
  if (synonym.error) throw synonym.error;
  await searchField(page).fill("schalotten");
  await expectTitles(page, [soppa, gryta]);

  // Emptying the field brings back the whole library at once.
  await searchField(page).fill("");
  await expectTitles(page, [soppa, gryta]);
});

test("no hit says so, and Visa alla recept empties the field", async ({ page }) => {
  await page.goto("/recept");
  await expectTitles(page, [soppa, gryta]);
  await searchField(page).fill("xyz");
  await expect(page.getByText("Inga recept matchar.")).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Visa alla recept" }).click();
  await expect(searchField(page)).toHaveValue("");
  await expect(searchField(page)).toBeFocused();
  await expectTitles(page, [soppa, gryta]);
});

test("the heart toggles in the list and in the recipe view without navigating, and is saved", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/recept");
  await expect(heart(row(page, soppa))).toHaveAttribute("aria-pressed", "false");
  await tapHeart(page, heart(row(page, soppa)));
  await expect(page).toHaveURL(/\/recept$/);
  // On after the server has answered (the saved value, not the optimistic one), and after a reload.
  await expect(heart(row(page, soppa))).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(heart(row(page, soppa))).toHaveAttribute("aria-pressed", "true");

  // In the recipe view.
  await row(page, gryta).getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1, name: gryta })).toBeVisible();
  const viewHeart = page.getByRole("button", { name: "Favorit" });
  await expect(viewHeart).toHaveAttribute("aria-pressed", "false");
  await tapHeart(page, viewHeart);
  await expect(viewHeart).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(recipePath);
  await page.reload();
  await expect(page.getByRole("button", { name: "Favorit" })).toHaveAttribute("aria-pressed", "true");

  await page.goto("/recept");
  await expect(heart(row(page, gryta))).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("a heart that cannot be saved goes back, with a short confirmation", async ({ page }) => {
  await page.goto("/recept");
  await expect(heart(row(page, gryta))).toHaveAttribute("aria-pressed", "true");
  // The Server Action is a POST to the page; break the connection once.
  let attempts = 0;
  await page.route(
    (url) => url.pathname === "/recept",
    async (route) => {
      const request = route.request();
      if (request.method() === "POST" && (await request.headerValue("next-action")) && attempts++ === 0) {
        await route.abort("connectionfailed");
      } else {
        await route.continue();
      }
    },
  );
  await heart(row(page, gryta)).click();
  await expect(page.getByTestId("toast")).toHaveText("Det gick inte att spara favoriten.");
  await expect(heart(row(page, gryta))).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(heart(row(page, gryta))).toHaveAttribute("aria-pressed", "true");
});

test("Favoriter shows only favourites, works with search, and is kept after a reload", async ({ page }) => {
  await page.goto("/recept");
  await expectTitles(page, [soppa, gryta]);
  await pill(page, "Favoriter").click();
  await expect(pill(page, "Favoriter")).toBeChecked();
  await expectTitles(page, [soppa, gryta]);

  // Search and filter together: only favourites whose title or ingredients match.
  await tapHeart(page, heart(row(page, soppa)));
  await expectTitles(page, [gryta]);
  await searchField(page).fill("kokosmjölk");
  await expect(page.getByText("Inga recept matchar.")).toBeVisible();
  await searchField(page).fill("gryta");
  await expectTitles(page, [gryta]);

  await page.reload();
  await expect(pill(page, "Favoriter")).toBeChecked();
  await expectTitles(page, [gryta]);

  // Without favourites.
  await tapHeart(page, heart(row(page, gryta)));
  await expect(page.getByText("Inga favoriter än. Tryck på hjärtat på ett recept.")).toBeVisible();
  await page.reload();
  await expect(pill(page, "Favoriter")).toBeChecked();
  await expect(page.getByText("Inga favoriter än. Tryck på hjärtat på ett recept.")).toBeVisible();

  await pill(page, "Alla").click();
  await expectTitles(page, [soppa, gryta]);
  await page.reload();
  await expect(pill(page, "Alla")).toBeChecked();
});

test("200 recipes: the page answers within a second (NFR7)", async ({ page }, testInfo) => {
  const recipes = Array.from({ length: 198 }, (_, index) => ({
    user_id: userId,
    title: `Testrecept ${index + 1}`,
    original_servings: 4,
    total_minutes: 30,
    source_kind: "text",
    is_favorite: index % 10 === 0,
  }));
  const { error } = await adminClient().from("recipe").insert(recipes);
  if (error) throw error;

  // Once to warm up the server, then measured.
  await page.goto("/recept");
  await expect(rows(page)).toHaveCount(200);
  const started = Date.now();
  await page.goto("/recept");
  await expect(rows(page)).toHaveCount(200);
  await expect(rows(page).last()).toContainText(gryta);
  const elapsed = Date.now() - started;
  testInfo.annotations.push({ type: "Recept med 200 recept", description: `${elapsed} ms` });
  console.log(`/recept with 200 recipes: ${elapsed} ms`);
  // Measured against the built app (CI); the dev server compiles on demand.
  if (process.env.CI) expect(elapsed).toBeLessThan(1000);
});
