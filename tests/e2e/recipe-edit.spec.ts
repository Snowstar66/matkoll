import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { adminClient, recipesStorageState } from "./support";

// Story 1.11: "Ändra" in the recipe view's menu (⋯) opens the preview's form
// for the saved recipe; "Spara ändringar" keeps Pontus in the recipe view, and
// "Ta bort recept" asks first, then removes the recipe and goes to the
// library. As the E2E user for saving recipes (e2e-recept), like
// recipe.spec.ts, so the main E2E user's library stays empty. The specs run
// in parallel and add to that user's catalog, so nothing here assumes an
// ingredient is new or missing: the relinked ingredient (smör) is one that
// saving fiskgratäng itself creates or finds.

const fiskgratang = readFileSync("tests/fixtures/ai/fiskgratang.txt", "utf8");
const mobile = { width: 390, height: 844 };
const recipePath = /\/recept\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

const importSheet = (page: Page) => page.getByRole("dialog", { name: "Importera recept" });
const editSheet = (page: Page) => page.getByRole("dialog", { name: "Ändra recept" });

/** Collects console errors and uncaught exceptions for the page. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** Saves the fiskgratäng fixture as `title` and returns its id, on its recipe view. */
async function saveRecipe(page: Page, title: string): Promise<string> {
  await page.goto("/recept");
  await page.locator("header").getByRole("button", { name: "Importera recept" }).click();
  await importSheet(page).getByRole("tab", { name: "Text" }).click();
  await importSheet(page).getByLabel("Recepttext").fill(fiskgratang);
  await importSheet(page).getByRole("button", { name: "Tolka" }).click();
  await importSheet(page).getByLabel("Titel").fill(title);
  await importSheet(page).getByRole("button", { name: "Spara recept" }).click();
  await expect(page).toHaveURL(recipePath);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  return recipePath.exec(page.url())![1];
}

async function openEdit(page: Page) {
  await page.getByRole("button", { name: "Fler val" }).click();
  await page.getByRole("menuitem", { name: "Ändra" }).click();
  await expect(editSheet(page)).toBeVisible();
}

async function savedIds(recipeId: string) {
  const steps = await adminClient().from("recipe_step").select("id").eq("recipe_id", recipeId).order("position");
  const lines = await adminClient().from("recipe_ingredient").select("id").eq("recipe_id", recipeId).order("position");
  expect(steps.error).toBeNull();
  expect(lines.error).toBeNull();
  return { steps: steps.data!.map(({ id }) => id as string), lines: lines.data!.map(({ id }) => id as string) };
}

const uniqueTitle = (base: string) => `${base} ${Date.now()}`;

test.use({ storageState: recipesStorageState, viewport: mobile });

test("Ändra changes the title, a line's ingredient and the steps, and stays in the recipe view", async ({ page }) => {
  const errors = watchErrors(page);
  const recipeId = await saveRecipe(page, uniqueTitle("Fiskgratäng"));
  const before = await savedIds(recipeId);

  await openEdit(page);
  const sheet = editSheet(page);
  await expect(sheet.getByLabel("Titel")).toHaveValue(/^Fiskgratäng \d+$/);
  await expect(sheet.getByTestId("recipe-line")).toHaveCount(8);
  await expect(sheet.getByLabel("Steg 6")).toHaveValue(/^Toppa med hackad dill/);
  await expect(sheet.getByRole("button", { name: "Ta bort recept" })).toBeVisible();

  const title = uniqueTitle("Fiskgratäng med purjo");
  await sheet.getByLabel("Titel").fill(title);

  // Relink the leek line to smör.
  const leek = sheet.getByTestId("recipe-line").filter({ hasText: "1 purjolök" });
  await leek.getByRole("button", { name: /^Purjolök/ }).click();
  await sheet.getByLabel("Sök ingrediens").fill("smör");
  await sheet.getByRole("list", { name: "Träffar" }).getByRole("button", { name: "Smör", exact: true }).click();
  await expect(leek.getByRole("button", { name: /^Smör/ })).toBeVisible();

  // Remove the last step, and add one.
  await sheet.getByRole("button", { name: "Ta bort steg 6" }).click();
  await expect(sheet.getByLabel("Steg 6")).toHaveCount(0);
  await sheet.getByRole("button", { name: "Lägg till steg" }).click();
  const newStep = sheet.getByLabel("Steg 6");
  await expect(newStep).toBeFocused();
  // An empty step cannot be saved.
  await expect(sheet.getByRole("button", { name: "Spara ändringar" })).toBeDisabled();
  await newStep.fill("Servera med kokt potatis.");

  await sheet.getByRole("button", { name: "Spara ändringar" }).click();
  await expect(editSheet(page)).toBeHidden();
  await expect(page.getByTestId("toast")).toHaveText("Ändringarna är sparade.");
  await expect(page).toHaveURL(new RegExp(`/recept/${recipeId}$`));
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

  const lines = page.getByRole("region", { name: "Ingredienser" }).getByTestId("recipe-view-line");
  await expect(lines).toHaveCount(8);
  await expect(lines.filter({ hasText: "1 purjolök" })).toHaveText(/^Smör\s*1 purjolök\s*1$/);
  const steps = page.getByRole("region", { name: "Steg" }).getByRole("listitem");
  await expect(steps).toHaveCount(6);
  await expect(steps.last()).toHaveText(/^6\s*Servera med kokt potatis\.$/);

  // The kept lines and steps kept their ids; the removed step went and the new one is new.
  const after = await savedIds(recipeId);
  expect(after.lines).toEqual(before.lines);
  expect(after.steps.slice(0, 5)).toEqual(before.steps.slice(0, 5));
  expect(before.steps).not.toContain(after.steps[5]);

  // The form opens again from the saved recipe.
  await openEdit(page);
  await expect(editSheet(page).getByLabel("Titel")).toHaveValue(title);
  await expect(editSheet(page).getByLabel("Steg 6")).toHaveValue("Servera med kokt potatis.");
  expect(errors).toEqual([]);
});

test("closing with changes asks first, and nothing is saved", async ({ page }) => {
  const title = uniqueTitle("Fiskgratäng");
  await saveRecipe(page, title);
  await openEdit(page);
  await editSheet(page).getByLabel("Titel").fill("Något annat");
  await editSheet(page).getByRole("button", { name: "Stäng" }).click();
  await expect(editSheet(page).getByText("Släng ändringarna?")).toBeVisible();
  await editSheet(page).getByRole("button", { name: "Släng ändringarna" }).click();
  await expect(editSheet(page)).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
});

test("a failed save shows a notice and keeps the form", async ({ page }) => {
  const recipeId = await saveRecipe(page, uniqueTitle("Fiskgratäng"));
  await openEdit(page);
  const title = uniqueTitle("Ändrad gratäng");
  await editSheet(page).getByLabel("Titel").fill(title);

  // The Server Action is a POST to the page; break the connection once.
  let attempts = 0;
  await page.route(
    (url) => url.pathname === `/recept/${recipeId}`,
    async (route) => {
      const request = route.request();
      if (request.method() === "POST" && (await request.headerValue("next-action")) && attempts++ === 0) {
        await route.abort("connectionfailed");
      } else {
        await route.continue();
      }
    },
  );
  await editSheet(page).getByRole("button", { name: "Spara ändringar" }).click();
  await expect(editSheet(page).getByRole("alert")).toHaveText("Det gick inte att spara receptet. Försök igen.");
  await expect(editSheet(page).getByLabel("Titel")).toHaveValue(title);

  await editSheet(page).getByRole("button", { name: "Spara ändringar" }).click();
  await expect(editSheet(page)).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
});

test("Ta bort recept asks first, then removes the recipe and opens the library", async ({ page }) => {
  const errors = watchErrors(page);
  const title = uniqueTitle("Borttagen gratäng");
  const recipeId = await saveRecipe(page, title);

  await openEdit(page);
  await editSheet(page).getByRole("button", { name: "Ta bort recept" }).click();
  const confirm = page.getByRole("dialog", { name: "Ta bort recept" });
  await expect(confirm.getByText(`Ta bort ${title}? Det går inte att ångra.`)).toBeVisible();

  // Avbryt: nothing happens, and the form is back.
  await confirm.getByRole("button", { name: "Avbryt" }).click();
  await expect(editSheet(page).getByLabel("Titel")).toHaveValue(title);
  await editSheet(page).getByRole("button", { name: "Ta bort recept" }).click();
  // Watch for the gone recipe's "Sidan finns inte." at any moment until the library shows.
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { notFoundSeen: string[] }).notFoundSeen = seen;
    new MutationObserver(() => {
      if (document.body.innerText.includes("Sidan finns inte.")) seen.push(location.pathname);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await confirm.getByRole("button", { name: "Ta bort", exact: true }).click();

  await expect(page).toHaveURL(/\/recept$/);
  await expect(page.getByTestId("toast")).toHaveText("Receptet är borttaget.");
  await expect(page.getByRole("heading", { level: 1, name: "Recept" })).toBeVisible();
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { notFoundSeen: string[] }).notFoundSeen)).toEqual([]);

  const { count } = await adminClient().from("recipe").select("id", { count: "exact", head: true }).eq("id", recipeId);
  expect(count).toBe(0);
  const steps = await adminClient().from("recipe_step").select("id", { count: "exact", head: true }).eq("recipe_id", recipeId);
  expect(steps.count).toBe(0);
  const lines = await adminClient().from("recipe_ingredient").select("id", { count: "exact", head: true }).eq("recipe_id", recipeId);
  expect(lines.count).toBe(0);

  // Back does not lead to the removed recipe.
  await page.goto(`/recept/${recipeId}`);
  await expect(page.getByText("Sidan finns inte.")).toBeVisible();
  expect(errors.filter((error) => !error.includes("404"))).toEqual([]);
});
