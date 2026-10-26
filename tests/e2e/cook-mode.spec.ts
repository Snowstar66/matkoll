import { expect, type Page, test } from "@playwright/test";
import { normalizeIngredientText } from "@/features/catalog/domain/normalize";
import { adminClient, cookModeEmail, cookModeStorageState, e2eUserId } from "./support";

// Story 4.2: the step mode with the screen kept on. The spec has an E2E user
// of its own (cookModeEmail). Before each test the meal plan, the pantry and
// the recipes are emptied, and Krämig kycklinggryta (4 portions) is made with
// the service role: three steps, with 1 gul lök on step 1, 2 dl grädde on
// step 2, nothing on step 3, and "persilja efter smak" on no step, so it is
// shown on step 1 under "Övriga ingredienser". At home: 2 dl grädde
// and 5 st gul lök, so at 6 portions the cream (3 dl) is short.
//
// navigator.wakeLock is replaced before the page loads (page.addInitScript):
// with a fake that counts requests and releases on window.__wakeLock, or
// removed, as in a browser without support.

const mobile = { width: 375, height: 812 };
const title = "Krämig kycklinggryta";
const unavailableText = "Skärmen kan släckas i den här webbläsaren.";

test.use({ storageState: cookModeStorageState, viewport: mobile });
// One user for all the tests: each seeds it again, so they must not run at the same time.
test.describe.configure({ mode: "serial" });

let userId = "";
let recipeId = "";

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
  return new Map((data as { id: string; name: string }[]).map((row) => [row.name, row.id]));
}

test.beforeEach(async () => {
  userId = await e2eUserId(cookModeEmail);
  const admin = adminClient();
  for (const table of ["meal_plan", "pantry_item", "recipe"] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  const ids = await seedIngredients(["Grädde", "Gul lök"]);
  const id = (name: string) => ids.get(name)!;

  const recipe = await admin
    .from("recipe")
    .insert({ user_id: userId, title, original_servings: 4, total_minutes: 35, source_kind: "text" })
    .select("id")
    .single();
  if (recipe.error) throw recipe.error;
  recipeId = (recipe.data as { id: string }).id;

  const steps = await admin
    .from("recipe_step")
    .insert(
      ["Fräs löken.", "Häll i grädden och låt puttra.", "Servera med ris."].map((text, position) => ({
        user_id: userId,
        recipe_id: recipeId,
        position,
        text,
      })),
    )
    .select("id, position");
  if (steps.error) throw steps.error;
  const stepId = (position: number) =>
    (steps.data as { id: string; position: number }[]).find((step) => step.position === position)!.id;

  const lines = await admin.from("recipe_ingredient").insert(
    [
      { original_text: "1 gul lök", amount: 1, unit: "st", ingredient_id: id("Gul lök"), step_id: stepId(0) },
      { original_text: "2 dl grädde", amount: 2, unit: "dl", ingredient_id: id("Grädde"), step_id: stepId(1) },
      // Vague, so it may have no amount.
      { original_text: "persilja efter smak", amount: null, unit: null, ingredient_id: null, step_id: null },
    ].map((line, position) => ({
      ...line,
      is_vague: line.amount === null,
      user_id: userId,
      recipe_id: recipeId,
      position,
    })),
  );
  if (lines.error) throw lines.error;

  const pantry = await admin.from("pantry_item").insert(
    [
      { ingredient_id: id("Grädde"), location: "Kyl", amount: 2, unit: "dl" },
      { ingredient_id: id("Gul lök"), location: "Skafferi", amount: 5, unit: "st" },
    ].map((item) => ({ ...item, user_id: userId })),
  );
  if (pantry.error) throw pantry.error;
});

declare global {
  interface Window {
    __wakeLock?: { requests: number; releases: number; held: number };
  }
}

/** A navigator.wakeLock that grants every request and counts requests and releases. */
async function fakeWakeLock(page: Page) {
  await page.addInitScript(() => {
    const calls = { requests: 0, releases: 0, held: 0 };
    window.__wakeLock = calls;
    const wakeLock = {
      request: async (type: string) => {
        calls.requests += 1;
        calls.held += 1;
        const sentinel = Object.assign(new EventTarget(), {
          type,
          released: false,
          release: async () => {
            if (sentinel.released) return;
            sentinel.released = true;
            calls.releases += 1;
            calls.held -= 1;
            sentinel.dispatchEvent(new Event("release"));
          },
        });
        return sentinel;
      },
    };
    Object.defineProperty(Navigator.prototype, "wakeLock", { configurable: true, get: () => wakeLock });
  });
}

const wakeLockCalls = (page: Page) => page.evaluate(() => window.__wakeLock);
/**
 * How many locks the page holds now. The dev server's Strict Mode runs effects
 * twice (request, release, request), so the count held is what is compared.
 */
const heldLocks = async (page: Page) => (await wakeLockCalls(page))?.held;

/** Collects console errors and uncaught exceptions for the page. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** Counts Server Action calls and RSC fetches from now on (not link prefetches). */
function countServerCalls(page: Page): () => number {
  let calls = 0;
  page.on("request", (request) => {
    const headers = request.headers();
    const action = request.method() === "POST" && "next-action" in headers;
    const rsc = (request.url().includes("_rsc=") || "rsc" in headers) && !("next-router-prefetch" in headers);
    if (action || rsc) calls += 1;
  });
  return () => calls;
}

// getByRole only matches what is visible, so routes kept hidden after a
// client navigation never match.
const cookButton = (page: Page) => page.getByRole("button", { name: "Laga nu" });
const stepMode = (page: Page) => page.getByRole("dialog", { name: `Stegläge: ${title}` });
const heading = (page: Page) => stepMode(page).getByRole("heading", { level: 2 });
const rows = (page: Page) => stepMode(page).getByTestId("recipe-view-line");

/** A real touch swipe over the step, by `dx` px, through Chromium's input (CDP). */
async function swipe(page: Page, dx: number) {
  const step = await stepMode(page).getByTestId("cook-step").boundingBox();
  if (!step) throw new Error("the step has no box");
  const start = { x: step.x + step.width / 2, y: step.y + step.height - 60 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
  for (const share of [0.1, 0.25, 0.5, 0.75, 1]) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: start.x + dx * share, y: start.y + 2 * share }],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

test("Laga nu opens the step mode with the chosen servings; the steps change with buttons, keys and a swipe, and the lock is released on close", async ({
  page,
}) => {
  await fakeWakeLock(page);
  const errors = watchErrors(page);
  await page.goto(`/recept/${recipeId}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Fler portioner" }).click();
  await expect(page.getByText("6 portioner", { exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const serverCalls = countServerCalls(page);

  await cookButton(page).click();
  await expect(stepMode(page)).toBeVisible();
  await expect(heading(page)).toHaveText("Steg 1 av 3");
  await expect(heading(page)).toBeFocused();
  await expect(stepMode(page).getByText("6 portioner", { exact: true })).toBeVisible();
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).first()).toContainText("Gul lök");
  await expect(rows(page).first().getByText("1,5 st", { exact: true })).toBeVisible();
  await expect(stepMode(page).getByRole("heading", { level: 3, name: "Övriga ingredienser" })).toBeVisible();
  await expect(rows(page).nth(1)).toHaveText("persilja efter smak");
  // The page behind does not scroll while the step mode is open.
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
  await expect(stepMode(page).getByTestId("cook-step-text")).toHaveCSS("font-size", "24px");
  await expect(stepMode(page).getByText(unavailableText)).toHaveCount(0);
  await expect.poll(() => heldLocks(page)).toBe(1);

  // Full screen, nothing sideways, and both buttons at least 44 px inside the screen.
  const box = await stepMode(page).boundingBox();
  expect(box).toEqual({ x: 0, y: 0, width: mobile.width, height: mobile.height });
  for (const name of ["Föregående", "Nästa"]) {
    const button = await stepMode(page).getByRole("button", { name }).boundingBox();
    expect(button && button.width >= 44 && button.height >= 44).toBe(true);
    expect(button && button.y + button.height <= mobile.height && button.y > mobile.height / 2).toBe(true);
  }

  // Föregående is aria-disabled on step 1 and does nothing; Playwright will not click it, so press it.
  const previous = stepMode(page).getByRole("button", { name: "Föregående" });
  const next = stepMode(page).getByRole("button", { name: "Nästa" });
  await expect(previous).toHaveAttribute("aria-disabled", "true");
  await previous.press("Enter");
  await expect(heading(page)).toHaveText("Steg 1 av 3");

  await next.click();
  await expect(heading(page)).toHaveText("Steg 2 av 3");
  const cream = rows(page).filter({ hasText: "Grädde" });
  await expect(cream.getByText("3 dl", { exact: true })).toHaveClass(/text-sky-ink/);
  await expect(cream.getByRole("img")).toHaveAccessibleName("saknas");
  await expect(cream.getByText("hemma: 2 dl")).toBeVisible();
  await previous.click();
  await expect(heading(page)).toHaveText("Steg 1 av 3");

  // The keys work after a click on the step's text too.
  await stepMode(page).getByTestId("cook-step-text").click();
  await page.keyboard.press("ArrowRight");
  await expect(heading(page)).toHaveText("Steg 2 av 3");
  await expect(stepMode(page).getByTestId("cook-step-announcement")).toHaveText(
    "Steg 2 av 3: Häll i grädden och låt puttra.",
  );
  await page.keyboard.press("ArrowRight");
  await expect(heading(page)).toHaveText("Steg 3 av 3");
  // A step without lines shows only its text.
  await expect(rows(page)).toHaveCount(0);
  await expect(stepMode(page).getByTestId("cook-step-text")).toHaveText("Servera med ris.");
  await expect(next).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(heading(page)).toHaveText("Steg 2 av 3");

  // A finger's swipe to the right over the step, then one to the left.
  await swipe(page, 120);
  await expect(heading(page)).toHaveText("Steg 1 av 3");
  await swipe(page, -120);
  await expect(heading(page)).toHaveText("Steg 2 av 3");
  await swipe(page, 120);
  await expect(heading(page)).toHaveText("Steg 1 av 3");

  await stepMode(page).getByRole("button", { name: "Stäng" }).click();
  await expect(stepMode(page)).toHaveCount(0);
  await expect(cookButton(page)).toBeFocused();
  await expect(page.getByText("6 portioner", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
  await expect.poll(() => heldLocks(page)).toBe(0);
  const afterFirst = await wakeLockCalls(page);
  expect(afterFirst?.requests).toBeGreaterThanOrEqual(1);
  expect(afterFirst?.releases).toBe(afterFirst?.requests);

  // Esc closes too, and the step mode starts again at step 1.
  await cookButton(page).click();
  await expect(heading(page)).toHaveText("Steg 1 av 3");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await expect(stepMode(page)).toHaveCount(0);
  await expect(cookButton(page)).toBeFocused();
  await expect.poll(() => heldLocks(page)).toBe(0);
  expect((await wakeLockCalls(page))?.requests).toBeGreaterThan(afterFirst?.requests ?? 0);
  await cookButton(page).click();
  await expect(heading(page)).toHaveText("Steg 1 av 3");

  // The step mode reads and writes nothing on the server.
  expect(serverCalls()).toBe(0);
  expect(errors).toEqual([]);
});

test("a client navigation away closes the step mode and releases the lock", async ({ page }) => {
  await fakeWakeLock(page);
  await page.goto("/recept");
  await page.getByRole("link", { name: new RegExp(title) }).first().click();
  await expect(page).toHaveURL(new RegExp(`/recept/${recipeId}$`));
  await cookButton(page).click();
  await expect(heading(page)).toHaveText("Steg 1 av 3");
  await expect.poll(() => heldLocks(page)).toBe(1);

  await page.goBack();
  await expect(page).toHaveURL(/\/recept$/);
  await expect(stepMode(page)).toHaveCount(0);
  await expect.poll(() => heldLocks(page)).toBe(0);
  // The recipe list is usable: nothing modal is left in front of it.
  await expect(page.getByRole("link", { name: new RegExp(title) }).first()).toBeVisible();
  await page.getByRole("link", { name: new RegExp(title) }).first().click();
  await expect(page).toHaveURL(new RegExp(`/recept/${recipeId}$`));
  await expect(stepMode(page)).toHaveCount(0);
  await expect(cookButton(page)).toBeVisible();
});

test("without Wake Lock the step mode says the screen may dim, and still works", async ({ page }) => {
  await page.addInitScript(() => {
    delete (Navigator.prototype as { wakeLock?: unknown }).wakeLock;
  });
  const errors = watchErrors(page);
  await page.goto(`/recept/${recipeId}`);
  await cookButton(page).click();
  await expect(stepMode(page).getByText(unavailableText)).toBeVisible();
  await expect(stepMode(page).getByRole("alert")).toHaveCount(0);
  await stepMode(page).getByRole("button", { name: "Nästa" }).click();
  await expect(heading(page)).toHaveText("Steg 2 av 3");
  await stepMode(page).getByRole("button", { name: "Stäng" }).click();
  await expect(stepMode(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test.describe("with large text", () => {
  // 187 px wide is a 375 px phone at 200 % zoom.
  test.use({ viewport: { width: 187, height: 406 }, deviceScaleFactor: 2 });

  test("Lägg på matsedeln and Laga nu wrap onto a row each, and the end of the page stays clear of them", async ({
    page,
  }) => {
    await fakeWakeLock(page);
    await page.goto(`/recept/${recipeId}`);
    const add = await page.getByRole("button", { name: "Lägg på matsedeln" }).boundingBox();
    const cook = await cookButton(page).boundingBox();
    if (!add || !cook) throw new Error("the buttons have no box");
    expect(cook.y).toBeGreaterThanOrEqual(add.y + add.height);
    // Scrolled to the end, the last step is above the buttons, not behind them.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const lastStep = page.getByText("Servera med ris.").filter({ visible: true });
    await expect(lastStep).toBeVisible();
    await expect
      .poll(async () => {
        const [text, top] = await Promise.all([
          lastStep.boundingBox(),
          page.getByRole("button", { name: "Lägg på matsedeln" }).boundingBox(),
        ]);
        return text && top ? text.y + text.height <= top.y : false;
      })
      .toBe(true);

    // The step mode fits too: no sideways scroll, the buttons on screen.
    await cookButton(page).click();
    await expect(heading(page)).toHaveText("Steg 1 av 3");
    const next = await stepMode(page).getByRole("button", { name: "Nästa" }).boundingBox();
    expect(next && next.x >= 0 && next.x + next.width <= 187 && next.y + next.height <= 406).toBe(true);
    expect(await stepMode(page).evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
  });
});

