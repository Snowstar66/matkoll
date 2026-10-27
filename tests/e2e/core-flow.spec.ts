import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { adminClient, coreFlowEmail, deleteMailsTo, mailHtml, mailsTo, openMagicLink, recreateE2eUser } from "./support";

// Story 3.8: the whole core of Epic 1–3 in one go, as Pontus uses it. Sign in
// through the real /logga-in and the link in Mailpit (no saved session, no
// test route), import a recipe from pasted text (AI_PROVIDER=mock), put it on
// the meal plan, check one line off on Lista and put it in the pantry. The
// spec has an E2E user of its own (coreFlowEmail), made again before the test
// so it starts empty, also on a retry.

const kycklinggryta = readFileSync("tests/fixtures/ai/kycklinggryta.txt", "utf8");
const title = "Krämig kycklinggryta med curry";
const mobile = { width: 375, height: 812 };

test.use({ viewport: mobile });

/** Collects console errors and uncaught exceptions for the page. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

// Earlier routes stay mounted but hidden after a client navigation, so the
// locators below are scoped to what is visible.
const tab = (page: Page, name: "Recept" | "Matsedel" | "Inköpslista" | "Lagersaldo") =>
  page.getByRole("navigation", { name: "Huvudmeny" }).getByRole("link", { name });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Importera recept" });
const toast = (page: Page) => page.getByTestId("toast");
const lines = (page: Page) => page.getByTestId("shopping-line").filter({ visible: true });

test.beforeAll(async () => {
  // A new user: no recipes, catalog, plan, list state or pantry (they all go
  // with the old one), and Auth's limit on new links starts over, so a retry
  // can ask for a link at once.
  const userId = await recreateE2eUser(coreFlowEmail);
  for (const table of ["recipe", "ingredient", "meal_plan", "shopping_check", "shopping_custom_item", "shopping_line_override", "pantry_item"]) {
    const { count, error } = await adminClient().from(table).select("*", { count: "exact", head: true }).eq("user_id", userId);
    if (error) throw error;
    expect(count, table).toBe(0);
  }
});

test("sign in, import a recipe, plan it, check a line off and put it in the pantry", async ({ page }) => {
  const errors = watchErrors(page);

  // Sign in with the link from the e-mail.
  await deleteMailsTo(coreFlowEmail);
  await page.goto("/recept");
  await expect(page).toHaveURL(/\/logga-in\?next=%2Frecept$/);
  await page.getByLabel("E-postadress").fill(coreFlowEmail);
  await page.getByRole("button", { name: "Skicka länk" }).click();
  await expect(page.getByText("Vi har skickat en länk och en kod till din e-post.")).toBeVisible();
  await expect.poll(async () => (await mailsTo(coreFlowEmail)).length, { timeout: 10_000 }).toBe(1);
  const [mail] = await mailsTo(coreFlowEmail);
  const href = (await mailHtml(mail.ID)).match(/href="([^"]*\/auth\/confirm\?[^"]*)"/)?.[1]?.replaceAll("&amp;", "&");
  expect(href).toBeDefined();
  expect(new URL(href!).pathname).toBe("/auth/confirm");
  await openMagicLink(page, href!);
  await expect(page).toHaveURL(/\/recept$/);
  await expect(page.getByRole("heading", { level: 1, name: "Recept" })).toBeVisible();

  // Import from pasted text and save.
  await page.locator("header").getByRole("button", { name: "Importera recept" }).click();
  await expect(sheet(page)).toBeVisible();
  await sheet(page).getByRole("tab", { name: "Text" }).click();
  await sheet(page).getByLabel("Recepttext").fill(kycklinggryta);
  await sheet(page).getByRole("button", { name: "Tolka" }).click();
  await expect(sheet(page).getByLabel("Titel")).toHaveValue(title);
  await sheet(page).getByRole("button", { name: "Spara recept" }).click();
  await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);

  // Put it on the meal plan.
  await page.getByRole("button", { name: "Lägg på matsedeln" }).filter({ visible: true }).click();
  await expect(toast(page)).toHaveText("Lagt på matsedeln.");

  // Lista: check one line off and put it in the pantry.
  await tab(page, "Inköpslista").click();
  await expect(page).toHaveURL(/\/lista$/);
  const chicken = lines(page).filter({ hasText: /kycklinglårfilé/i });
  await expect(chicken).toHaveCount(1);
  const count = await lines(page).count();
  expect(count).toBeGreaterThan(1);
  const check = chicken.getByRole("checkbox");
  await check.click();
  await expect(check).toBeChecked();
  await page.getByRole("button", { name: "Lägg i lagret", exact: true }).filter({ visible: true }).click();
  await expect(toast(page)).toHaveText("Lagt 1 vara i lagret.");
  await expect(chicken).toHaveCount(0);
  await expect(lines(page)).toHaveCount(count - 1);

  // Lagersaldo: the chicken is in the fridge.
  await tab(page, "Lagersaldo").click();
  await expect(page).toHaveURL(/\/hemma/);
  const rows = page.getByTestId("pantry-row").filter({ visible: true });
  // Story 11.3: the row says when it was added; the sheet Lagervara has the amount.
  await expect(rows.filter({ hasText: /kycklinglårfilé/i })).toHaveText(/^kycklinglårfilé Tillagd idag$/i);
  await rows.filter({ hasText: /kycklinglårfilé/i }).click();
  const itemSheet = page.getByRole("dialog", { name: "Lagervara" });
  await expect(itemSheet.getByLabel("Mängd")).toHaveValue("600");
  await expect(itemSheet.getByLabel("Enhet")).toHaveValue("g");
  await page.keyboard.press("Escape");
  await expect(itemSheet).toHaveCount(0);
  expect(errors).toEqual([]);
});
