import { expect, type Locator, type Page, type Route, test } from "@playwright/test";
import { normalizeIngredientText } from "@/features/catalog/domain/normalize";
import { adminClient, e2eUserId, recipesLookEmail, recipesLookStorageState, thisMonday } from "./support";

// Story 11.5: Recept and Matsedel in the new look. The library shows recipe
// cards (the image on top, the status bottom left and the heart bottom right
// on the light plate, the title and "35 min · 4 portioner" under it; two
// columns from 1024 px), and Matsedel shows dish cards (a 56 px image, the
// title, "35 min · 6 port. · 6 av 8 hemma" and a meter, the portion selector
// in the ⋯ sheet) with a shopping row above the list (Story 3.11). The spec has an E2E user of its own
// (recipesLookEmail). Before each test the meal plan, the pantry and the
// recipes are emptied and made again with the service role:
//
// - Korv stroganoff, 15 min: falukorv, gul lök, grädde; all at home.
// - Kycklinggryta, 35 min, a favourite: eight ingredients, six at home
//   (kycklingfilé and kokosmjölk are not), so "Saknar 2 varor" and "6 av 8
//   hemma". 1 msk curry at home is just enough for 4 portions, not for 5.
// - Fiskgratäng, whose image answers 404, and Pannkakor (with a long title,
//   which must never be cut short) without an image.
//
// The meal plan has Kycklinggryta and Korv stroganoff, 4 portions each. The
// images come from a made-up recipe site that the browser's route answers.

const mobile = { width: 375, height: 812 };
const desktop = { width: 1280, height: 900 };
const korv = "Korv stroganoff";
const gryta = "Kycklinggryta";
const fisk = "Fiskgratäng";
const pannkakor = "Pannkakor med lingonsylt, vispad grädde och rostade mandelflingor";
const imageSite = "https://bilder.matkoll.test";

test.use({ storageState: recipesLookStorageState, viewport: mobile });
// One user for all the tests: each seeds it again, so they must not run at the same time.
test.describe.configure({ mode: "serial" });

let userId = "";
const recipeIds: Record<string, string> = {};

/** Upserts the catalog ingredients (they are never deleted) and returns their ids by name. */
async function seedIngredients(names: string[]): Promise<Map<string, string>> {
  const { data, error } = await adminClient()
    .from("ingredient")
    .upsert(
      names.map((name) => ({
        user_id: userId,
        name,
        normalized_name: normalizeIngredientText(name),
        section: "Övrigt",
        location: "Skafferi",
      })),
      { onConflict: "user_id,normalized_name" },
    )
    .select("id, name");
  if (error) throw error;
  const ids = new Map((data as { id: string; name: string }[]).map((row) => [row.name, row.id]));
  const missing = names.filter((name) => !ids.has(name));
  if (missing.length > 0) throw new Error(`The catalog upsert did not return ${missing.join(", ")}`);
  return ids;
}

type SeedRecipe = {
  title: string;
  minutes: number;
  createdAt: string;
  imageUrl: string | null;
  isFavorite?: boolean;
  lines: { text: string; amount: number; unit: string; ingredientId: string }[];
};

async function seedRecipe({ title, minutes, createdAt, imageUrl, isFavorite = false, lines }: SeedRecipe) {
  const admin = adminClient();
  const recipe = await admin
    .from("recipe")
    .insert({
      user_id: userId,
      title,
      original_servings: 4,
      total_minutes: minutes,
      source_kind: "text",
      image_url: imageUrl,
      is_favorite: isFavorite,
      created_at: createdAt,
    })
    .select("id")
    .single();
  if (recipe.error) throw recipe.error;
  const recipeId = (recipe.data as { id: string }).id;
  const inserted = await admin.from("recipe_ingredient").insert(
    lines.map((line, position) => ({
      user_id: userId,
      recipe_id: recipeId,
      position,
      original_text: line.text,
      amount: line.amount,
      unit: line.unit,
      is_vague: false,
      ingredient_id: line.ingredientId,
    })),
  );
  if (inserted.error) throw inserted.error;
  recipeIds[title] = recipeId;
}

test.beforeEach(async () => {
  userId = await e2eUserId(recipesLookEmail);
  const admin = adminClient();
  // Children before parents, so nothing relies on the cascades: the meal plan's
  // dishes and the shopping list's rows before the plan, the lines before the recipes.
  const tables = [
    "shopping_check",
    "shopping_custom_item",
    "shopping_line_override",
    "meal_plan_recipe",
    "meal_plan",
    "pantry_item",
    "recipe_ingredient",
    "recipe_step",
    "recipe",
  ] as const;
  for (const table of tables) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  const names = ["Falukorv", "Gul lök", "Grädde", "Kycklingfilé", "Vitlök", "Curry", "Ris", "Paprika", "Kokosmjölk", "Torsk", "Mjölk"];
  const ids = await seedIngredients(names);
  const id = (name: string) => ids.get(name)!;

  await seedRecipe({
    title: pannkakor,
    minutes: 30,
    createdAt: "2026-10-01T08:00:00Z",
    imageUrl: null,
    lines: [{ text: "6 dl mjölk", amount: 6, unit: "dl", ingredientId: id("Mjölk") }],
  });
  await seedRecipe({
    title: fisk,
    minutes: 45,
    createdAt: "2026-10-02T08:00:00Z",
    imageUrl: `${imageSite}/saknas.jpg`,
    lines: [{ text: "400 g torsk", amount: 400, unit: "g", ingredientId: id("Torsk") }],
  });
  await seedRecipe({
    title: gryta,
    minutes: 35,
    createdAt: "2026-10-03T08:00:00Z",
    imageUrl: `${imageSite}/kycklinggryta.png`,
    isFavorite: true,
    lines: [
      { text: "600 g kycklingfilé", amount: 600, unit: "g", ingredientId: id("Kycklingfilé") },
      { text: "2 dl grädde", amount: 2, unit: "dl", ingredientId: id("Grädde") },
      { text: "1 gul lök", amount: 1, unit: "st", ingredientId: id("Gul lök") },
      { text: "2 klyftor vitlök", amount: 2, unit: "klyfta", ingredientId: id("Vitlök") },
      { text: "1 msk curry", amount: 1, unit: "msk", ingredientId: id("Curry") },
      { text: "4 dl ris", amount: 4, unit: "dl", ingredientId: id("Ris") },
      { text: "1 paprika", amount: 1, unit: "st", ingredientId: id("Paprika") },
      { text: "4 dl kokosmjölk", amount: 4, unit: "dl", ingredientId: id("Kokosmjölk") },
    ],
  });
  await seedRecipe({
    title: korv,
    minutes: 15,
    createdAt: "2026-10-04T08:00:00Z",
    imageUrl: `${imageSite}/korv-stroganoff.png`,
    lines: [
      { text: "400 g falukorv", amount: 400, unit: "g", ingredientId: id("Falukorv") },
      { text: "1 gul lök", amount: 1, unit: "st", ingredientId: id("Gul lök") },
      { text: "2 dl grädde", amount: 2, unit: "dl", ingredientId: id("Grädde") },
    ],
  });

  const pantry = await admin.from("pantry_item").insert(
    (
      [
        ["Falukorv", 800, "g", "Kyl"],
        ["Gul lök", 3, "st", "Skafferi"],
        ["Grädde", 5, "dl", "Kyl"],
        ["Vitlök", 5, "klyfta", "Skafferi"],
        ["Curry", 1, "msk", "Skafferi"],
        ["Ris", 10, "dl", "Skafferi"],
        ["Paprika", 2, "st", "Kyl"],
      ] as const
    ).map(([name, amount, unit, location]) => ({ user_id: userId, ingredient_id: id(name), location, amount, unit })),
  );
  if (pantry.error) throw pantry.error;

  const plan = await admin.from("meal_plan").insert({ user_id: userId, name: "Vecka 44", is_current: true, week_start: thisMonday() }).select("id").single();
  if (plan.error) throw plan.error;
  const dishes = await admin.from("meal_plan_recipe").insert(
    [gryta, korv].map((title, position) => ({
      user_id: userId,
      meal_plan_id: (plan.data as { id: string }).id,
      recipe_id: recipeIds[title],
      recipe_title: title,
      servings: 4,
      position,
    })),
  );
  if (dishes.error) throw dishes.error;
});

/** A 1 × 1 px PNG, the recipe site's picture. */
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** Answers the recipe site's images: a picture, or 404 for saknas.jpg. Returns the referers sent. */
async function serveImages(page: Page): Promise<(string | undefined)[]> {
  const referers: (string | undefined)[] = [];
  await page.route(`${imageSite}/**`, async (route: Route) => {
    referers.push(route.request().headers()["referer"]);
    if (route.request().url().endsWith("/saknas.jpg")) await route.fulfill({ status: 404, body: "" });
    else await route.fulfill({ status: 200, contentType: "image/png", body: png });
  });
  return referers;
}

/** Collects console errors and uncaught exceptions for the page; a 404 image is expected. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("404")) errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

// Earlier routes stay mounted but hidden after a client navigation, so every
// locator is scoped to what is visible.
const cards = (page: Page) => page.getByTestId("recipe-card").filter({ visible: true });
const card = (page: Page, title: string) => cards(page).filter({ has: page.getByRole("link", { name: title, exact: true }) });
const dish = (page: Page, title: string) => page.getByTestId("plan-dish").filter({ visible: true }).filter({ hasText: title });
const heart = (scope: Locator, title: string) => scope.getByRole("button", { name: `Favorit, ${title}` });

async function box(locator: Locator) {
  const found = await locator.boundingBox();
  if (!found) throw new Error("no box");
  return found;
}

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

/** Waits for the answer to the next Server Action call (a POST with a Next-Action header). */
const actionAnswer = (page: Page) =>
  page.waitForResponse((response) => response.request().method() === "POST" && Boolean(response.request().headers()["next-action"]));

test("the library shows recipe cards with the image on top, the status and the heart on it, and the time under it", async ({
  page,
}) => {
  const errors = watchErrors(page);
  const referers = await serveImages(page);
  await page.goto("/recept");
  await expect(cards(page)).toHaveCount(4);

  // Story 14.4: two columns on a phone, as in the sketch.
  const [firstTile, secondTile] = [await box(cards(page).nth(0)), await box(cards(page).nth(1))];
  expect(secondTile.y).toBeCloseTo(firstTile.y, 0);
  expect(secondTile.x).toBeGreaterThan(firstTile.x + firstTile.width - 1);

  const korvCard = card(page, korv);
  await expect(korvCard.getByText("15 min · 4 portioner", { exact: true })).toBeVisible();
  await expect(korvCard.getByText("Kan lagas nu", { exact: true })).toBeVisible();
  await expect(heart(korvCard, korv)).toHaveAttribute("aria-pressed", "false");
  const grytaCard = card(page, gryta);
  await expect(grytaCard.getByText("Saknar 2 varor", { exact: true })).toBeVisible();
  await expect(heart(grytaCard, gryta)).toHaveAttribute("aria-pressed", "true");

  // The recipe's own picture, loaded without a referrer (AD-15), the card's full width.
  const image = korvCard.locator("img");
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(referers.length).toBeGreaterThan(0);
  expect(referers.every((referer) => referer === undefined)).toBe(true);
  const imageBox = await box(image);
  const cardBox = await box(korvCard);
  expect(imageBox.width).toBeCloseTo(cardBox.width, 0);
  expect(imageBox.height).toBe(104);
  expect(imageBox.y).toBeCloseTo(cardBox.y, 0);

  // The status bottom left and the heart bottom right, on the image.
  const status = await box(korvCard.getByText("Kan lagas nu", { exact: true }));
  const heartBox = await box(heart(korvCard, korv));
  expect(status.x).toBeLessThan(imageBox.x + imageBox.width / 2);
  expect(heartBox.x).toBeGreaterThan(imageBox.x + imageBox.width / 2);
  for (const inside of [status, heartBox]) {
    expect(inside.y).toBeGreaterThanOrEqual(imageBox.y);
    expect(inside.y + inside.height).toBeLessThanOrEqual(imageBox.y + imageBox.height + 0.5);
  }
  expect(heartBox.width).toBeGreaterThanOrEqual(44);
  expect(heartBox.height).toBeGreaterThanOrEqual(44);
  // The title under the image.
  expect((await box(korvCard.getByRole("link", { name: korv }))).y).toBeGreaterThanOrEqual(imageBox.y + imageBox.height);

  // No image, or one that answers 404: the mint placeholder.
  await expect(card(page, pannkakor).getByTestId("recipe-image-placeholder")).toBeVisible();
  await expect(card(page, fisk).getByTestId("recipe-image-placeholder")).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test("the view switch is a labelled segmented control named Vy with Kort and Lista, with a 44 px tap area", async ({ page }) => {
  await serveImages(page);
  await page.goto("/recept");
  const group = page.getByRole("radiogroup", { name: "Vy" });
  await expect(group.getByRole("radio")).toHaveText([/Kort/, /Lista/]);
  await expect(group.getByRole("radio", { name: "Kort", exact: true })).toBeChecked();
  // The 44 px tap area reaches 9 px above the 26 px segment: a tap there still chooses it.
  await group.getByRole("radio", { name: "Lista", exact: true }).click({ position: { x: 10, y: -8 } });
  await expect(group.getByRole("radio", { name: "Lista", exact: true })).toBeChecked();
});

test("the heart toggles the favourite without opening the recipe; a tap on the image opens it", async ({ page }) => {
  const errors = watchErrors(page);
  await serveImages(page);
  await page.goto("/recept");
  const korvCard = card(page, korv);
  const answered = actionAnswer(page);
  await heart(korvCard, korv).click();
  await answered;
  await expect(heart(korvCard, korv)).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\/recept$/);
  await expect
    .poll(async () => {
      const { data } = await adminClient().from("recipe").select("is_favorite").eq("id", recipeIds[korv]).single();
      return (data as { is_favorite: boolean } | null)?.is_favorite;
    })
    .toBe(true);

  // Anywhere on the card, the status on the image too, opens the recipe: the
  // stretched link lies over the badge, so the tap goes by the badge's place.
  const badge = await box(korvCard.getByText("Kan lagas nu", { exact: true }));
  await page.mouse.click(badge.x + badge.width / 2, badge.y + badge.height / 2);
  await expect(page).toHaveURL(new RegExp(`/recept/${recipeIds[korv]}$`));
  expect(errors).toEqual([]);
});

test("with the keyboard, the card's link comes before its heart, and the card has no bin", async ({ page }) => {
  await serveImages(page);
  await page.goto("/recept");
  const korvCard = card(page, korv);
  await korvCard.getByRole("link", { name: korv }).focus();
  // Story 1.16: removing a recipe is done from its own page, so the card has no soptunna.
  await expect(korvCard.getByRole("button", { name: /^Ta bort/ })).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(heart(korvCard, korv)).toBeFocused();
});

test.describe("on a computer", () => {
  test.use({ viewport: desktop });

  test("the cards stand in two columns", async ({ page }) => {
    await serveImages(page);
    await page.goto("/recept");
    await expect(cards(page)).toHaveCount(4);
    const [first, second, third] = [await box(cards(page).nth(0)), await box(cards(page).nth(1)), await box(cards(page).nth(2))];
    expect(second.y).toBeCloseTo(first.y, 0);
    expect(second.x).toBeGreaterThan(first.x + first.width);
    expect(third.y).toBeGreaterThan(first.y + first.height);
    await expectNoHorizontalScroll(page);
  });
});

/** Opens a dish row's ⋯ sheet; its parts stay inside the row. */
async function openMore(row: Locator, title: string) {
  await row.getByRole("button", { name: `Fler val för ${title}` }).click();
}

test("Matsedel shows dish rows with what is at home, a meter and the portion selector in the sheet", async ({ page }) => {
  const errors = watchErrors(page);
  await serveImages(page);
  await page.goto("/matsedel");
  const grytaDish = dish(page, gryta);
  await expect(grytaDish.getByTestId("dish-meta")).toHaveText("35 min · 4 port.6 av 8 hemma");
  const meter = grytaDish.getByTestId("meter");
  await expect(meter).toHaveAttribute("aria-hidden", "true");
  await expect(meter.locator("div")).toHaveAttribute("style", /width: ?75%/);
  const thumb = await box(grytaDish.locator("img"));
  expect(thumb.width).toBe(56);
  expect(thumb.height).toBe(56);

  const korvDish = dish(page, korv);
  await expect(korvDish.getByTestId("dish-meta")).toHaveText("15 min · 4 port.✓ Allt hemma");
  // Everything at home: no meter.
  await expect(korvDish.getByTestId("meter")).toHaveCount(0);

  // 1 msk curry is not enough for 5 portions: 5 of 8 at home, and the meter follows.
  await openMore(grytaDish, gryta);
  await expect(grytaDish.getByText("4 portioner", { exact: true })).toBeVisible();
  const answered = actionAnswer(page);
  await grytaDish.getByRole("button", { name: `Fler portioner, ${gryta}` }).click();
  await answered;
  await expect(grytaDish.getByText("5 portioner", { exact: true })).toBeVisible();
  await expect(grytaDish.getByTestId("dish-meta")).toHaveText("35 min · 5 port.5 av 8 hemma");
  await expect(meter.locator("div")).toHaveAttribute("style", /width: ?62\.5%/);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test("the shopping row above the list in Matsedel goes to Inköpslistan", async ({ page }) => {
  const errors = watchErrors(page);
  await serveImages(page);
  await page.goto("/matsedel");
  const show = page.getByTestId("shopping-row").filter({ visible: true });
  await expect(show).toHaveText(/^🛒Inköpslista för vecka \d{1,2}›$/);
  // Above the dishes, and no big buttons under them.
  expect((await box(show)).y).toBeLessThan((await box(dish(page, korv))).y);
  await expect(page.getByRole("link", { name: "Visa inköpslistan" })).toHaveCount(0);
  await show.click();
  await expect(page).toHaveURL(/\/lista$/);
  await expect(page.getByRole("heading", { level: 1, name: "Inköpslista" })).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe("with large text", () => {
  // 187 px wide is a 375 px phone at 200 % zoom.
  test.use({ viewport: { width: 187, height: 406 }, deviceScaleFactor: 2 });

  test("the cards wrap their titles, keep the status and the heart on the image, and never scroll sideways", async ({
    page,
  }) => {
    await serveImages(page);
    await page.goto("/recept");
    const grytaCard = card(page, gryta);
    const imageBox = await box(grytaCard.locator("img"));
    const heartBox = await box(heart(grytaCard, gryta));
    const status = await box(grytaCard.getByText("Saknar 2 varor", { exact: true }));
    for (const inside of [heartBox, status]) {
      expect(inside.x).toBeGreaterThanOrEqual(imageBox.x);
      expect(inside.x + inside.width).toBeLessThanOrEqual(imageBox.x + imageBox.width + 0.5);
      expect(inside.y + inside.height).toBeLessThanOrEqual(imageBox.y + imageBox.height + 0.5);
    }
    await expectNoHorizontalScroll(page);

    // Story 14.4: the title wraps but is cut after two lines (the full text stays in the page).
    const long = card(page, pannkakor).getByRole("link", { name: pannkakor });
    await expect(long).toHaveText(pannkakor);
    expect(await long.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    const lineHeight = await long.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    expect((await box(long)).height).toBeGreaterThan(lineHeight * 1.5);
    expect((await box(long)).height).toBeLessThanOrEqual(lineHeight * 2 + 1);

    await page.goto("/matsedel");
    await expect(dish(page, gryta).getByTestId("dish-meta")).toHaveText("35 min · 4 port.6 av 8 hemma");
    await openMore(dish(page, gryta), gryta);
    await expectStepperFits(page, dish(page, gryta), gryta);
    await expectNoHorizontalScroll(page);
  });

  test("the recipe view's portion selector fits, with the number alone and 44 px buttons", async ({ page }) => {
    await serveImages(page);
    await page.goto(`/recept/${recipeIds[gryta]}`);
    await expect(page.getByRole("heading", { level: 1, name: gryta })).toBeVisible();
    await expectStepperFits(page, page.getByRole("main"));
    await expectNoHorizontalScroll(page);
  });
});

/**
 * The portion selector in `scope` fits its place: − and + are 44 × 44 px and
 * inside the viewport, and only the number shows (the whole value is read out).
 */
async function expectStepperFits(page: Page, scope: Locator, title?: string) {
  const suffix = title ? `, ${title}` : "";
  const fewer = scope.getByRole("button", { name: `Färre portioner${suffix}` }).first();
  const more = scope.getByRole("button", { name: `Fler portioner${suffix}` }).first();
  const viewport = page.viewportSize()!;
  for (const button of [fewer, more]) {
    const found = await box(button);
    expect(found.width).toBeGreaterThanOrEqual(44);
    expect(found.height).toBeGreaterThanOrEqual(44);
    expect(found.x + found.width).toBeLessThanOrEqual(viewport.width);
  }
  const stepper = scope.getByTestId("stepper").first();
  await expect(stepper.locator("span[aria-hidden=true]")).toBeVisible();
  await expect(stepper.locator("output")).toHaveText(/\d+ portion(er)?/);
}

test.describe("with the root text at 200 %", () => {
  test("the cards fall to one column", async ({ page }) => {
    await serveImages(page);
    await page.goto("/recept");
    await page.addStyleTag({ content: "html { font-size: 200%; }" });
    const [first, second] = [await box(cards(page).nth(0)), await box(cards(page).nth(1))];
    expect(second.y).toBeGreaterThan(first.y + first.height - 1);
    await expectNoHorizontalScroll(page);
  });

  test("the badge stays on the image, clear of the heart", async ({ page }) => {
    await serveImages(page);
    await page.goto("/recept");
    await page.addStyleTag({ content: "html { font-size: 200%; }" });
    const grytaCard = card(page, gryta);
    const imageBox = await box(grytaCard.locator("img"));
    const heartBox = await box(heart(grytaCard, gryta));
    const plate = await box(grytaCard.locator(".text-badge"));
    expect(plate.x).toBeGreaterThanOrEqual(imageBox.x);
    expect(plate.x + plate.width).toBeLessThanOrEqual(heartBox.x);
    expect(plate.y).toBeGreaterThanOrEqual(imageBox.y);
    expect(plate.y + plate.height).toBeLessThanOrEqual(imageBox.y + imageBox.height + 0.5);
    await expectNoHorizontalScroll(page);
  });
});

test.describe("on a small phone", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test("+ stands still while the portions change", async ({ page }) => {
    await serveImages(page);
    await page.goto("/matsedel");
    const grytaDish = dish(page, gryta);
    await openMore(grytaDish, gryta);
    const more = grytaDish.getByRole("button", { name: `Fler portioner, ${gryta}` });
    const positions = [(await box(more)).x];
    for (const servings of [5, 6]) {
      const answered = actionAnswer(page);
      await more.click();
      await answered;
      await expect(grytaDish.getByText(`${servings} portioner`, { exact: true })).toBeAttached();
      positions.push((await box(more)).x);
    }
    expect(new Set(positions).size).toBe(1);
    await expectNoHorizontalScroll(page);
  });
});

test("a long page title keeps the header's actions beside it at 375 px", async ({ page }) => {
  await serveImages(page);
  await page.goto("/matsedel");
  const header = page.locator("header").filter({ visible: true });
  const title = header.getByRole("heading", { level: 1 });
  const previous = header.getByRole("button", { name: "Lägg till rätt" });
  for (const text of ["Matsedel", "Matsedel för hela veckan med släkten"]) {
    await title.evaluate((el, value) => (el.textContent = value), text);
    const titleBox = await box(title);
    const actionBox = await box(previous);
    // On the title's row (aligned to its last line), to its right; a wrapped
    // row would put the link's middle below the title.
    const middle = actionBox.y + actionBox.height / 2;
    expect(middle).toBeGreaterThan(titleBox.y);
    expect(middle).toBeLessThan(titleBox.y + titleBox.height);
    expect(actionBox.x).toBeGreaterThan(titleBox.x + titleBox.width - 1);
  }
  await expectNoHorizontalScroll(page);
});
