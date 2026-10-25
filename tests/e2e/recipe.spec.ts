import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { adminClient, userStorageState } from "./support";

// Story 1.7: "Spara recept" in the preview saves the recipe and opens the
// recipe view, with AI_PROVIDER=mock. global-setup empties the E2E user's data
// before each run. Within a run the spec files share that user and run at the
// same time, so this spec saves fiskgratäng: saving linssoppa would add its
// carrots to the catalog while import.spec.ts expects them to be new ("Ny").

const fiskgratang = readFileSync("tests/fixtures/ai/fiskgratang.txt", "utf8");
const fixtureTitle = "Fiskgratäng med räkor";
const mobile = { width: 390, height: 844 };
const recipePath = /\/recept\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

/** On a recipe view, Recept is the current surface in the menu, and nothing else is. */
async function expectReceptCurrent(page: Page) {
  const menu = page.getByRole("navigation", { name: "Huvudmeny" });
  await expect(menu.getByRole("link", { name: "Recept" })).toHaveAttribute("aria-current", "true");
  await expect(menu.locator("[aria-current]")).toHaveCount(1);
}

/** Imports the fiskgratäng fixture and gives it a title of its own. */
async function previewRecipe(page: Page, title: string) {
  await page.goto("/recept");
  await page.locator("header").getByRole("button", { name: "Importera recept" }).click();
  await sheet(page).getByLabel("Recepttext").fill(fiskgratang);
  await sheet(page).getByRole("button", { name: "Tolka" }).click();
  await expect(sheet(page).getByLabel("Titel")).toHaveValue(fixtureTitle);
  await sheet(page).getByLabel("Titel").fill(title);
}

const uniqueTitle = (base: string) => `${base} ${Date.now()}`;

test.use({ storageState: userStorageState, viewport: mobile });

test("Spara recept saves the recipe and opens the recipe view", async ({ page }) => {
  const errors = watchErrors(page);
  const title = uniqueTitle("Fiskgratäng");
  await previewRecipe(page, title);

  const save = sheet(page).getByRole("button", { name: "Spara recept" });
  await expect(save).toBeEnabled();
  await save.click();

  await expect(page).toHaveURL(recipePath);
  await expect(sheet(page)).toBeHidden();
  await expect(page.getByTestId("toast")).toHaveText("Receptet är sparat.");
  await expect(page.getByRole("status").filter({ hasText: "Receptet är sparat." })).toHaveCount(1);

  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page).toHaveTitle(`${title} – Matkoll`);
  await expectReceptCurrent(page);
  // The recipe has no time, so only the servings.
  await expect(page.getByText("4 portioner", { exact: true })).toBeVisible();
  await expect(page.getByText("Källa: Inklistrad text")).toBeVisible();
  // No image address from pasted text: the placeholder takes its place.
  await expect(page.getByTestId("recipe-image-placeholder")).toBeVisible();

  const ingredients = page.getByRole("region", { name: "Ingredienser" });
  const lines = ingredients.getByTestId("recipe-view-line");
  await expect(lines).toHaveCount(8);
  await expect(lines.first()).toHaveText(/^torskfilé\s*600 g$/);
  await expect(lines.filter({ hasText: "purjolök" })).toHaveText(/^purjolök\s*1$/);
  // A vague line shows its original text.
  await expect(lines.filter({ hasText: "färsk dill" })).toHaveText("färsk dill");

  const steps = page.getByRole("region", { name: "Steg" }).getByRole("listitem");
  await expect(steps).toHaveCount(6);
  await expect(steps.first()).toHaveText(/^1\s*Sätt ugnen på 200 grader/);

  // Mobile: the ingredients come above the steps.
  const ingredientsBox = await ingredients.boundingBox();
  const stepsBox = await page.getByRole("region", { name: "Steg" }).boundingBox();
  expect(ingredientsBox!.y + ingredientsBox!.height).toBeLessThanOrEqual(stepsBox!.y);

  // The view is the saved recipe: it is the same after a reload.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expectReceptCurrent(page);
  await expect(lines).toHaveCount(8);
  expect(errors).toEqual([]);
});

test("an invalid draft cannot be saved", async ({ page }) => {
  await previewRecipe(page, uniqueTitle("Fiskgratäng"));
  const save = sheet(page).getByRole("button", { name: "Spara recept" });
  await sheet(page).getByLabel("Titel").fill(" ");
  await expect(sheet(page).getByText("Ange en titel.")).toBeVisible();
  await expect(save).toBeDisabled();
  await sheet(page).getByLabel("Titel").fill("Fiskgratäng");
  await sheet(page).getByLabel("Steg 1").fill("");
  await expect(save).toBeDisabled();
  await sheet(page).getByLabel("Steg 1").fill("Hacka allt.");
  await expect(save).toBeEnabled();
});

test("a failed save shows a notice and keeps the preview as it was", async ({ page }) => {
  const title = uniqueTitle("Avbruten soppa");
  await previewRecipe(page, title);

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

  await sheet(page).getByRole("button", { name: "Spara recept" }).click();
  await expect(sheet(page).getByRole("alert")).toHaveText("Det gick inte att spara receptet. Försök igen.");
  await expect(page).toHaveURL(/\/recept$/);
  await expect(sheet(page).getByLabel("Titel")).toHaveValue(title);
  await expect(sheet(page).getByTestId("recipe-line")).toHaveCount(8);

  // Trying again works, and the notice goes away.
  await sheet(page).getByRole("button", { name: "Spara recept" }).click();
  await expect(page).toHaveURL(recipePath);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  expect(attempts).toBe(2);
});

test("an answer lost after the save does not make a copy when Pontus tries again", async ({ page }) => {
  const title = uniqueTitle("Tappad soppa");
  await previewRecipe(page, title);

  // The first save reaches the server, but its answer never comes back.
  let attempts = 0;
  await page.route(
    (url) => url.pathname === "/recept",
    async (route) => {
      const request = route.request();
      if (request.method() === "POST" && (await request.headerValue("next-action")) && attempts++ === 0) {
        await route.fetch();
        await route.abort("connectionfailed");
      } else {
        await route.continue();
      }
    },
  );

  await sheet(page).getByRole("button", { name: "Spara recept" }).click();
  await expect(sheet(page).getByRole("alert")).toHaveText("Det gick inte att spara receptet. Försök igen.");
  await sheet(page).getByRole("button", { name: "Spara recept" }).click();
  await expect(page).toHaveURL(recipePath);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

  const { count, error } = await adminClient()
    .from("recipe")
    .select("id", { count: "exact", head: true })
    .eq("title", title);
  expect(error).toBeNull();
  expect(count).toBe(1);
});

for (const [what, id] of [
  ["an unknown id", "00000000-0000-4000-8000-000000000000"],
  ["an id that is not a uuid", "inte-ett-id"],
] as const) {
  test(`${what} shows "Sidan finns inte."`, async ({ page }) => {
    await page.goto(`/recept/${id}`);
    await expect(page.getByText("Sidan finns inte.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Gå till recepten" })).toBeVisible();
  });
}

test.describe("desktop, 1280 × 800", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("ingredients and steps sit side by side", async ({ page }) => {
    const title = uniqueTitle("Fiskgratäng");
    await previewRecipe(page, title);
    await sheet(page).getByRole("button", { name: "Spara recept" }).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

    const ingredientsBox = await page.getByRole("region", { name: "Ingredienser" }).boundingBox();
    const stepsBox = await page.getByRole("region", { name: "Steg" }).boundingBox();
    expect(ingredientsBox!.x + ingredientsBox!.width).toBeLessThanOrEqual(stepsBox!.x);
    await expectReceptCurrent(page);
    expect(Math.abs(ingredientsBox!.y - stepsBox!.y)).toBeLessThan(2);
  });
});
