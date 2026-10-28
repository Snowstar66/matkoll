import { expect, type Page, test } from "@playwright/test";
import { normalizeIngredientText } from "@/features/catalog";
import { adminClient, cardTitles, e2eUserId, suggestionsEmail, suggestionsStorageState } from "./support";

// Story 6.2: confirming, correcting and rejecting lagerförslag on Hemma, with
// AI_PROVIDER=mock. kyl.png gives six suggestions (kyl.analyze.json): grädde,
// gurka, ketchup, mjölk, smör and ägg. Kyl has mjölk and smör, so a photo of
// it is compared with them (Story 6.4): smör matches and has no card, mjölk
// is "Ändrat", and the other four "Nytt". The plain list of Story 6.2 is
// tested with a photo of the empty Skafferi. The spec has an E2E user of its own
// (suggestionsEmail): before each test the service role empties its pantry
// and synonyms and makes the catalog ingredients "Mjölk" and "Smör" and the
// pantry items "Mjölk 2 förp" and "Smör" (unlimited) in Kyl. Catalog
// ingredients cannot be deleted, so the ones a test creates stay for the next
// (and for a retry); no test creates "Grädde" or "Ketchup". The tests run in
// order, since they share the user.

const kyl = "tests/fixtures/ai/kyl.png";

test.use({ storageState: suggestionsStorageState, viewport: { width: 375, height: 812 } });
test.describe.configure({ mode: "serial" });

let userId = "";
test.beforeAll(async () => {
  userId = await e2eUserId(suggestionsEmail);
});

test.beforeEach(async () => {
  const admin = adminClient();
  for (const table of ["pantry_item", "ingredient_synonym"] as const) {
    const removed = await admin.from(table).delete().eq("user_id", userId);
    if (removed.error) throw removed.error;
  }
  const catalog = await admin
    .from("ingredient")
    .upsert(
      [
        { user_id: userId, name: "Mjölk", normalized_name: "mjölk", section: "Mejeri", location: "Kyl", default_unit: "förp" },
        { user_id: userId, name: "Smör", normalized_name: "smör", section: "Mejeri", location: "Kyl", default_unit: "förp" },
      ],
      { onConflict: "user_id,normalized_name" },
    )
    .select("id, name");
  if (catalog.error) throw catalog.error;
  // Story 10.4: the catalog stores the name with a capital, so it is found normalised.
  const id = (name: string) =>
    catalog.data.find((row) => normalizeIngredientText(row.name) === normalizeIngredientText(name))!.id;
  const inserted = await admin.from("pantry_item").insert([
    { user_id: userId, ingredient_id: id("Mjölk"), location: "Kyl", amount: 2, unit: "förp" },
    { user_id: userId, ingredient_id: id("Smör"), location: "Kyl", amount: null, unit: null },
  ]);
  if (inserted.error) throw inserted.error;
});

/** The user's catalog names, and each pantry row as "name amount unit place". */
async function saved(): Promise<{ catalog: string[]; pantry: string[]; synonyms: number }> {
  const admin = adminClient();
  const ingredients = await admin.from("ingredient").select("id, name, location").eq("user_id", userId);
  if (ingredients.error) throw ingredients.error;
  const pantry = await admin.from("pantry_item").select("ingredient_id, location, amount, unit").eq("user_id", userId);
  if (pantry.error) throw pantry.error;
  const synonyms = await admin.from("ingredient_synonym").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (synonyms.error) throw synonyms.error;
  const nameOf = (id: string) => ingredients.data.find((row) => row.id === id)?.name ?? "?";
  return {
    catalog: ingredients.data.map((row) => `${row.name} ${row.location}`).sort(),
    pantry: pantry.data
      .map((row) => [nameOf(row.ingredient_id), row.amount === null ? "-" : Number(row.amount), row.unit ?? "-", row.location].join(" "))
      .sort(),
    synonyms: synonyms.count ?? 0,
  };
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
const cameraButton = (page: Page) => camera(page).getByRole("button", { name: "Fotografera kylen" });
const section = (page: Page) => page.getByTestId("pantry-suggestions").filter({ visible: true });
const cards = (page: Page) => section(page).getByTestId("pantry-suggestion");
/** The cards' names: h4 under the groups of a compared photo, h3 in the plain list. */
const cardNames = (page: Page, level: 3 | 4 = 4) => cards(page).getByRole("heading", { level });
const kylCard = (page: Page) => page.getByRole("navigation", { name: "Platser" }).getByRole("link", { name: /^Kyl/ });
const skafferiCard = (page: Page) =>
  page.getByRole("navigation", { name: "Platser" }).getByRole("link", { name: /^Skafferi/ });
// Story 11.3: one row per item, with or without an amount, and no amount shown; saved() reads the amounts.
const rows = (page: Page) => page.getByTestId("pantry-row").filter({ visible: true });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Lagervara" });
const toast = (page: Page) => page.getByTestId("toast");

async function photographFridge(page: Page) {
  await page.goto("/hemma");
  await expect(kylCard(page)).toHaveText(/^Kyl\s*2 varor(\s?Förslag klara)?$/);
  const chooser = page.waitForEvent("filechooser");
  await cameraButton(page).click();
  await (await chooser).setFiles(kyl);
  await expect(cards(page)).toHaveCount(5);
}

async function photographPantry(page: Page) {
  await page.goto("/hemma?plats=skafferi");
  await expect(skafferiCard(page)).toHaveText(/^Skafferi\s*0 varor(\s?Förslag klara)?$/);
  const chooser = page.waitForEvent("filechooser");
  await camera(page).getByRole("button", { name: "Fotografera skafferiet" }).click();
  await (await chooser).setFiles(kyl);
  await expect(cards(page)).toHaveCount(6);
}

test("confirm, correct, reject and Bekräfta alla save only what Pontus confirmed", async ({ page }) => {
  const errors = watchErrors(page);
  await photographFridge(page);

  // Five cards, each with its three buttons, and Bekräfta alla; smör matches the fridge and is only counted.
  // Story 6.5: the title is the label on the package; the buttons keep the catalog name.
  await expect(cardNames(page)).toHaveText(cardTitles(["Vispgrädde 3 dl", "Gurka", "Ketchup", "Ägg", "Mellanmjölk 1,5 %"]));
  await expect(section(page).getByText("1 vara stämmer med lagret.")).toBeVisible();
  await expect(cards(page).filter({ hasText: "Mjölk" }).getByText("nu: 2 förp → bilden: 1 förp")).toBeVisible();
  // Story 10.4: new catalog names start with a capital; mjölk is seeded as it was before.
  for (const name of ["Grädde", "Gurka", "Ketchup", "Ägg", "Mjölk"]) {
    const card = cards(page).filter({ has: page.getByRole("button", { name: `Bekräfta ${name}`, exact: true }) });
    await expect(card).toContainText("· Kyl");
    for (const verb of ["Bekräfta", "Rätta", "Avvisa"]) {
      const button = card.getByRole("button", { name: `${verb} ${name}`, exact: true });
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  }
  await expect(section(page).getByRole("button", { name: "Bekräfta alla" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Bekräfta mjölk: set to 1 förp, not added to; Kyl has as many items as before.
  await section(page).getByRole("button", { name: "Bekräfta Mjölk" }).click();
  await expect(toast(page)).toHaveText("Mjölk är sparad i kylen.");
  await expect(cardNames(page)).toHaveText(cardTitles(["Vispgrädde 3 dl", "Gurka", "Ketchup", "Ägg"]));
  // mjölk was the last card: focus goes to the one before it.
  await expect(section(page).getByRole("button", { name: "Bekräfta Ägg" })).toBeFocused();
  await expect(rows(page).filter({ hasText: /^Mjölk / })).toHaveCount(1);
  await expect(kylCard(page)).toHaveText(/^Kyl\s*2 varor(\s?Förslag klara)?$/);

  // Rätta grädde: the sheet filled in; another new ingredient, 2 dl, and Bekräfta.
  await section(page).getByRole("button", { name: "Rätta Grädde" }).click();
  await expect(sheet(page).getByTestId("pantry-sheet-ingredient")).toHaveText("Grädde");
  await expect(sheet(page).getByLabel("Mängd")).toHaveValue("1");
  await expect(sheet(page).getByLabel("Enhet")).toHaveValue("förp");
  await expect(sheet(page).getByRole("radio", { name: "Kyl" })).toHaveAttribute("aria-checked", "true");
  await expect(sheet(page).getByRole("button", { name: "Avvisa" })).toBeVisible();
  await sheet(page).getByRole("button", { name: "Byt ingrediens" }).click();
  await sheet(page).getByRole("searchbox", { name: "Sök ingrediens" }).fill("Matlagningsgrädde");
  // New on a first run; already in the catalog on a retry.
  await sheet(page)
    .getByRole("button", { name: "Lägg till Matlagningsgrädde som ny" })
    .or(sheet(page).getByRole("button", { name: "Matlagningsgrädde", exact: true }))
    .click();
  await sheet(page).getByLabel("Mängd").fill("2");
  await sheet(page).getByLabel("Enhet").selectOption("dl");
  await sheet(page).getByRole("button", { name: "Bekräfta" }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(toast(page)).toHaveText("Matlagningsgrädde är sparad i kylen.");
  await expect(cardNames(page)).toHaveText(cardTitles(["Gurka", "Ketchup", "Ägg"]));
  await expect(rows(page).filter({ hasText: /^Matlagningsgrädde / })).toHaveCount(1);
  await expect(kylCard(page)).toHaveText(/^Kyl\s*3 varor(\s?Förslag klara)?$/);

  // Avvisa ketchup, Ångra, and Avvisa again: nothing asks the server.
  await section(page).getByRole("button", { name: "Avvisa Ketchup" }).click();
  await expect(toast(page)).toContainText("Ketchup är avvisad.");
  await expect(cardNames(page)).toHaveText(cardTitles(["Gurka", "Ägg"]));
  await toast(page).getByRole("button", { name: "Ångra" }).click();
  await expect(cardNames(page)).toHaveText(cardTitles(["Gurka", "Ketchup", "Ägg"]));
  await section(page).getByRole("button", { name: "Avvisa Ketchup" }).click();
  await expect(cardNames(page)).toHaveText(cardTitles(["Gurka", "Ägg"]));

  // Bekräfta alla: the two left in one call; smör, which matches, is left as it is.
  await section(page).getByRole("button", { name: "Bekräfta alla" }).click();
  await expect(toast(page)).toHaveText("Kylen är uppdaterad: 2 nya.");
  await expect(section(page)).toHaveCount(0);
  await expect(cameraButton(page)).toBeFocused();
  await expect(kylCard(page)).toHaveText(/^Kyl\s*5 varor(\s?Förslag klara)?$/);
  await expect(rows(page).filter({ hasText: /^Smör / })).toHaveCount(1);

  expect(await saved()).toEqual({
    catalog: ["Gurka Kyl", "Matlagningsgrädde Kyl", "Mjölk Kyl", "Smör Kyl", "Ägg Kyl"].sort(),
    pantry: ["Gurka 2 st Kyl", "Matlagningsgrädde 2 dl Kyl", "Mjölk 1 förp Kyl", "Smör - - Kyl", "Ägg 6 st Kyl"].sort(),
    synonyms: 0,
  });
  expect(errors).toEqual([]);
});

test("a confirmation that gets no answer keeps the suggestions with a notice, and trying again saves them", async ({ page }) => {
  // The plain list of Story 6.2: Skafferi has nothing to compare with.
  await photographPantry(page);
  await expect(cardNames(page, 3)).toHaveText(cardTitles(["Vispgrädde 3 dl", "Gurka", "Ketchup", "Mellanmjölk 1,5 %", "Smör 500 g", "Ägg"]));
  await expect(section(page).getByRole("heading", { name: "Nytt" })).toHaveCount(0);
  const before = await saved();

  // The Server Action's request fails, as without a connection.
  await page.route("**/hemma**", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
  await section(page).getByRole("button", { name: "Bekräfta alla" }).click();
  await expect(section(page).getByRole("alert")).toHaveText("Det gick inte att lägga förslagen i lagret. Försök igen.");
  await expect(cards(page)).toHaveCount(6);
  await expect(section(page).getByRole("button", { name: "Bekräfta alla" })).toBeEnabled();
  expect(await saved()).toEqual(before);

  await page.unroute("**/hemma**");
  await section(page).getByRole("button", { name: "Avvisa Grädde" }).click();
  await section(page).getByRole("button", { name: "Avvisa Ketchup" }).click();
  await section(page).getByRole("button", { name: "Bekräfta alla" }).click();
  await expect(toast(page)).toHaveText("Lagt 4 varor i lagret.");
  await expect(section(page)).toHaveCount(0);
  await expect(skafferiCard(page)).toHaveText(/^Skafferi\s*4 varor(\s?Förslag klara)?$/);
  const after = await saved();
  expect(after.catalog.filter((name) => /^(Grädde|Ketchup) /.test(name))).toEqual([]);
  expect(after.pantry).toEqual(
    [
      "Gurka 2 st Skafferi",
      "Mjölk 1 förp Skafferi",
      "Mjölk 2 förp Kyl",
      "Smör - - Kyl",
      "Smör 1 förp Skafferi",
      "Ägg 6 st Skafferi",
    ].sort(),
  );
  expect(after.synonyms).toBe(0);
});
