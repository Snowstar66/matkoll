import { expect, type Page, test } from "@playwright/test";
import { addTicked, adminClient, cardTitles, e2eUserId, imageReadingEmail, imageReadingStorageState } from "./support";

// Story 6.5: a photo is read with labels and confidence, with
// AI_PROVIDER=mock: kyl-dorr.png gives "Lantmejeriet vispgrädde 36 % 3 dl"
// four times (the model repeating itself, merged into one), "Solgården
// apelsinjuice 1 l" and "Gul flaska, troligen senap" marked osäker
// (kyl-dorr.analyze.json). The spec has an E2E user of its own
// (imageReadingEmail): before each test the service role empties its pantry
// and makes the catalog ingredients "Vispgrädde", "Apelsinjuice" and "Senap",
// so Kyl is empty and the cards are the plain list of Story 6.2.

const door = "tests/fixtures/ai/kyl-dorr.png";

test.use({ storageState: imageReadingStorageState, viewport: { width: 375, height: 812 } });

let userId = "";
test.beforeAll(async () => {
  userId = await e2eUserId(imageReadingEmail);
});

test.beforeEach(async () => {
  const admin = adminClient();
  for (const table of ["pantry_item", "pantry_removal", "ingredient_synonym"] as const) {
    const removed = await admin.from(table).delete().eq("user_id", userId);
    if (removed.error) throw removed.error;
  }
  // The photo's ingredients are in the catalog, so every run shows the same cards (no "Ny"),
  // with an uppercase first letter as the catalog stores names (Story 10.4).
  const catalog = await admin.from("ingredient").upsert(
    [
      { user_id: userId, name: "Vispgrädde", normalized_name: "vispgrädde", section: "Mejeri", location: "Kyl", default_unit: "förp" },
      { user_id: userId, name: "Apelsinjuice", normalized_name: "apelsinjuice", section: "Dryck", location: "Kyl", default_unit: "förp" },
      { user_id: userId, name: "Senap", normalized_name: "senap", section: "Skafferi", location: "Kyl", default_unit: "förp" },
    ],
    { onConflict: "household_id,normalized_name" },
  );
  if (catalog.error) throw catalog.error;
});

/** The user's pantry as "name amount unit place", sorted. */
async function pantry(): Promise<string[]> {
  const admin = adminClient();
  const ingredients = await admin.from("ingredient").select("id, name").eq("user_id", userId);
  if (ingredients.error) throw ingredients.error;
  const { data, error } = await admin.from("pantry_item").select("ingredient_id, location, amount, unit").eq("user_id", userId);
  if (error) throw error;
  const nameOf = (id: string) => ingredients.data.find((row) => row.id === id)?.name ?? "?";
  return data
    .map((row) => `${nameOf(row.ingredient_id)} ${row.amount === null ? "-" : Number(row.amount)} ${row.unit ?? "-"} ${row.location}`)
    .sort((a, b) => a.localeCompare(b, "sv"));
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

// Earlier routes stay mounted but hidden after a client navigation, so every
// locator is scoped to what is visible.
const camera = (page: Page) => page.getByTestId("pantry-camera").filter({ visible: true });
const section = (page: Page) => page.getByTestId("pantry-suggestions").filter({ visible: true });
const cards = (page: Page) => section(page).getByTestId("pantry-suggestion");
const titles = (page: Page) => cards(page).getByRole("heading", { level: 3 });
const kylCard = (page: Page) => page.getByRole("navigation", { name: "Platser" }).getByRole("link", { name: /^Kyl/ });
const toast = (page: Page) => page.getByTestId("toast");

async function photographDoor(page: Page) {
  await page.goto("/hemma");
  await expect(kylCard(page)).toHaveText(/^\S*Kyl\s*0 varor$/);
  const chooser = page.waitForEvent("filechooser");
  await camera(page).getByRole("button", { name: "Fota" }).click();
  await (await chooser).setFiles(door);
  await expect(section(page).getByRole("heading", { level: 2, name: "Förslag från fotot av kylen" })).toBeVisible();
}

test("labels are the rows' titles, a repeat is one row, and an unsure item starts unticked", async ({ page }) => {
  const errors = watchErrors(page);
  await photographDoor(page);

  // Three cards: the cream the model repeated is one, with one package.
  await expect(titles(page)).toHaveText(cardTitles([
    "Solgården apelsinjuice 1 l",
    "Gul flaska, troligen senap",
    "Lantmejeriet vispgrädde 36 % 3 dl",
  ]));
  const cream = cards(page).filter({ hasText: "Lantmejeriet" });
  await expect(cream.getByText("Vispgrädde · Kyl", { exact: true })).toBeVisible();
  await expect(cream.getByText("1 förp", { exact: true })).toBeVisible();
  const mustard = cards(page).filter({ hasText: "Gul flaska" });
  await expect(mustard.getByText("Senap · Kyl", { exact: true })).toBeVisible();
  // Kylfoto D: the unsure one has a "?" and starts unticked; the others are ticked.
  await expect(mustard.getByText("?", { exact: true })).toBeVisible();
  await expect(mustard.getByRole("checkbox", { name: "Ta med Senap" })).not.toBeChecked();
  await expect(cream.getByRole("checkbox", { name: "Ta med Vispgrädde" })).toBeChecked();
  await expect(section(page).getByText("?", { exact: true })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // The analysis writes nothing.
  expect(await pantry()).toEqual([]);

  // Lägg till saves the two ticked ones, and the unsure row stays.
  await addTicked(section(page));
  await expect(toast(page)).toHaveText("Lagt 2 varor i Matvaror.");
  await expect(titles(page)).toHaveText(cardTitles(["Gul flaska, troligen senap"]));
  await expect(section(page).getByRole("button", { name: "Lägg till 0 varor" })).toBeDisabled();
  await expect.poll(pantry).toEqual(["Apelsinjuice 1 förp Kyl", "Vispgrädde 1 förp Kyl"]);

  // Ticked, it is saved too.
  await section(page).getByRole("checkbox", { name: "Ta med Senap" }).click();
  await addTicked(section(page));
  await expect(toast(page)).toHaveText("Senap är sparad i kylen.");
  await expect(section(page)).toHaveCount(0);
  await expect(kylCard(page)).toHaveText(/^\S*Kyl\s*3 varor$/);
  await expect.poll(pantry).toEqual(["Apelsinjuice 1 förp Kyl", "Senap 1 förp Kyl", "Vispgrädde 1 förp Kyl"]);
  expect(errors).toEqual([]);
});
