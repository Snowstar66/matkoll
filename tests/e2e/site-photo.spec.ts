import { expect, type Page, test } from "@playwright/test";
import { normalizeIngredientText } from "@/features/catalog";
import { adminClient, cardTitles, e2eUserId, sitePhotoEmail, sitePhotoStorageState, boendeButton, pickBoende, } from "./support";

// Story 8.4: a photo, its inventory and "Töm kylen" stay with the place they
// were for, with AI_PROVIDER=mock: kyl.png gives grädde, gurka, ketchup,
// mjölk 1 förp, smör and ägg 6 st (kyl.analyze.json). The spec has an E2E
// user of its own (sitePhotoEmail). Before each test the service role
// removes the user's pantry, removal records and places, and adds Hemma
// (selected) and Stugan in one statement, the catalog ingredients of the
// photo plus "Yoghurt" and "Senap" (so the comparison is complete), and:
// - Hemma's fridge: mjölk 1 l and yoghurt 2 förp, and Hemma's freezer: ärtor;
// - Stugan's fridge: mjölk 2 förp and senap (unlimited); Stugan's freezer is empty.
// The tests run in order, since they share the user.

const kyl = "tests/fixtures/ai/kyl.png";

test.use({ storageState: sitePhotoStorageState, viewport: { width: 375, height: 812 } });
test.describe.configure({ mode: "serial" });

let userId = "";
let sites: { Hemma: string; Stugan: string } = { Hemma: "", Stugan: "" };

test.beforeAll(async () => {
  userId = await e2eUserId(sitePhotoEmail);
});

test.beforeEach(async () => {
  const admin = adminClient();
  for (const table of ["pantry_item", "pantry_removal", "ingredient_synonym", "pantry_site"] as const) {
    const removed = await admin.from(table).delete().eq("user_id", userId);
    if (removed.error) throw removed.error;
  }
  // In one statement, so exactly one place is selected at its commit; a millisecond apart for the order.
  const start = Date.now();
  const added = await admin
    .from("pantry_site")
    .insert(
      ["Hemma", "Stugan"].map((name, index) => ({
        user_id: userId,
        name,
        normalized_name: name.toLocaleLowerCase("sv"),
        is_selected: name === "Hemma",
        created_at: new Date(start + index).toISOString(),
      })),
    )
    .select("id, name");
  if (added.error) throw added.error;
  const siteId = (name: string) => (added.data as { id: string; name: string }[]).find((row) => row.name === name)!.id;
  sites = { Hemma: siteId("Hemma"), Stugan: siteId("Stugan") };

  const catalog = await admin
    .from("ingredient")
    .upsert(
      [
        ["Mjölk", "Mejeri", "Kyl", "förp"],
        ["Smör", "Mejeri", "Kyl", "förp"],
        ["Ägg", "Mejeri", "Kyl", "st"],
        ["Yoghurt", "Mejeri", "Kyl", "förp"],
        ["Senap", "Skafferi", "Kyl", "förp"],
        ["Grädde", "Mejeri", "Kyl", "förp"],
        ["Gurka", "Frukt och grönt", "Kyl", "st"],
        ["Ketchup", "Skafferi", "Skafferi", "förp"],
        ["Ärtor", "Frys", "Frys", "förp"],
      ].map(([name, section, location, unit]) => ({
        user_id: userId,
        name,
        normalized_name: name.toLocaleLowerCase("sv-SE"),
        section,
        location,
        default_unit: unit,
      })),
      { onConflict: "user_id,normalized_name" },
    )
    .select("id, name");
  if (catalog.error) throw catalog.error;
  // Story 10.4: the catalog stores the name with a capital, so it is found normalised.
  const id = (name: string) =>
    catalog.data.find((row) => normalizeIngredientText(row.name) === normalizeIngredientText(name))!.id;
  const inserted = await admin.from("pantry_item").insert([
    { user_id: userId, site_id: sites.Hemma, ingredient_id: id("Mjölk"), location: "Kyl", amount: 1, unit: "l" },
    { user_id: userId, site_id: sites.Hemma, ingredient_id: id("Yoghurt"), location: "Kyl", amount: 2, unit: "förp" },
    { user_id: userId, site_id: sites.Hemma, ingredient_id: id("Ärtor"), location: "Frys", amount: 1, unit: "förp" },
    { user_id: userId, site_id: sites.Stugan, ingredient_id: id("Mjölk"), location: "Kyl", amount: 2, unit: "förp" },
    { user_id: userId, site_id: sites.Stugan, ingredient_id: id("Senap"), location: "Kyl", amount: null, unit: null },
  ]);
  if (inserted.error) throw inserted.error;
});

type Row = { id: string; site: "Hemma" | "Stugan"; name: string; location: string; amount: number | null; unit: string | null };

/** The user's pantry rows with their place and catalog names, as the database has them, in a fixed order. */
async function pantry(): Promise<Row[]> {
  const admin = adminClient();
  const ingredients = await admin.from("ingredient").select("id, name").eq("user_id", userId);
  if (ingredients.error) throw ingredients.error;
  const { data, error } = await admin
    .from("pantry_item")
    .select("id, site_id, ingredient_id, location, amount, unit")
    .eq("user_id", userId);
  if (error) throw error;
  const nameOf = (id: string) => ingredients.data.find((row) => row.id === id)?.name ?? "?";
  return data
    .map((row) => ({
      id: row.id,
      site: row.site_id === sites.Hemma ? ("Hemma" as const) : ("Stugan" as const),
      name: nameOf(row.ingredient_id),
      location: row.location,
      amount: row.amount === null ? null : Number(row.amount),
      unit: row.unit,
    }))
    .sort((a, b) => `${a.site} ${a.location} ${a.name} ${a.unit}`.localeCompare(`${b.site} ${b.location} ${b.name} ${b.unit}`, "sv"));
}

const on = (rows: Row[], site: Row["site"]) => rows.filter((row) => row.site === site);

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
const placeLine = (page: Page) => page.getByTestId("pantry-suggestions-site").filter({ visible: true });
const placeCard = (page: Page, name: "Kyl" | "Frys") =>
  page.getByRole("navigation", { name: "Platser" }).filter({ visible: true }).getByRole("link", { name: new RegExp(`^${name}`) });
const rows = (page: Page) => page.getByTestId("pantry-row").filter({ visible: true });
const toast = (page: Page) => page.getByTestId("toast");
/** The cards' names under a group heading ("Nytt", "Ändrat", "Syns inte längre"). */
const group = (page: Page, title: string) =>
  section(page)
    .locator("div")
    .filter({ has: page.getByRole("heading", { level: 3, name: title, exact: true }) })
    .getByRole("heading", { level: 4 });

/** Hemma, once React runs. */
async function openHemma(page: Page, path = "/hemma") {
  await page.goto(path);
  await expect(boendeButton(page)).toBeEnabled();
}

/** Selects a place in the boende menu and waits until the page shows it. */
async function choose(page: Page, name: "Hemma" | "Stugan") {
  await pickBoende(page, name);
  await expect(page.getByTestId("site-announcement").filter({ visible: true })).toHaveText(`Valt boende: ${name}.`);
  await expect(page.getByTestId("site-content")).not.toHaveAttribute("aria-busy");
}

/**
 * Before the page loads: notes the field `site` of every form posted to
 * /api/ai/jobs/photo. Chromium gives Playwright no body for a request with a
 * file, so the form is read in the page as it is sent.
 */
async function watchAnalyzeSites(page: Page) {
  await page.addInitScript(() => {
    const sent: string[] = [];
    (window as unknown as { analyzeSites: string[] }).analyzeSites = sent;
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/ai/jobs/photo") && init?.body instanceof FormData) sent.push(String(init.body.get("site")));
      return original(input, init);
    };
  });
}

const analyzeSites = (page: Page) => page.evaluate(() => (window as unknown as { analyzeSites: string[] }).analyzeSites);

/** Photographs the location with kyl.png and waits for the suggestions. */
async function photograph(page: Page, button: string) {
  const chooser = page.waitForEvent("filechooser");
  await camera(page).getByRole("button", { name: button }).click();
  await (await chooser).setFiles(kyl);
  await expect(section(page).getByRole("heading", { level: 2 })).toBeVisible();
}

test("a photo of Stugan's fridge is compared with Stugan's fridge, and the request names Stugan", async ({ page }) => {
  const errors = watchErrors(page);
  const before = await pantry();
  await watchAnalyzeSites(page);
  await openHemma(page);
  await choose(page, "Stugan");
  await photograph(page, "Fotografera kylen");

  expect(await analyzeSites(page)).toEqual([sites.Stugan]);
  await expect(group(page, "Ändrat")).toHaveText(cardTitles(["Mellanmjölk 1,5 %"]));
  await expect(section(page).getByText("nu: 2 förp → bilden: 1 förp")).toBeVisible();
  await expect(group(page, "Syns inte längre")).toHaveText(["Senap"]);
  await expect(section(page).getByText("Yoghurt")).toHaveCount(0);
  // Hemma shows the photo's place: no line about another.
  await expect(placeLine(page)).toHaveCount(0);
  expect(await pantry()).toEqual(before);
  expect(errors).toEqual([]);
});

test("Bekräfta alla changes only Stugan's rows, and Hemma's keep their ids, amounts and units", async ({ page }) => {
  const errors = watchErrors(page);
  const before = await pantry();
  await openHemma(page);
  await choose(page, "Stugan");
  await photograph(page, "Fotografera kylen");

  await section(page).getByRole("button", { name: "Bekräfta alla" }).click();
  await expect(toast(page)).toContainText("Kylen är uppdaterad:");
  await expect(section(page)).toHaveCount(0);
  const after = await pantry();
  expect(on(after, "Hemma")).toEqual(on(before, "Hemma"));
  const stugan = on(after, "Stugan").filter((row) => row.location === "Kyl");
  expect(stugan.find((row) => row.name === "Mjölk")).toMatchObject({ amount: 1, unit: "förp" });
  // mjölk is changed in its own row, and senap is gone.
  expect(stugan.find((row) => row.name === "Mjölk")!.id).toBe(before.find((row) => row.site === "Stugan" && row.name === "Mjölk")!.id);
  expect(stugan.find((row) => row.name === "Senap")).toBeUndefined();
  expect(errors).toEqual([]);
});

test("selecting Hemma while Stugan's suggestions show says so, and Bekräfta still saves on Stugan", async ({ page }) => {
  const errors = watchErrors(page);
  const before = await pantry();
  await openHemma(page);
  await choose(page, "Stugan");
  await photograph(page, "Fotografera kylen");
  await expect(placeLine(page)).toHaveCount(0);

  await choose(page, "Hemma");
  await expect(placeLine(page)).toHaveText("Förslagen gäller Stugan.");
  await expect(group(page, "Ändrat")).toHaveText(cardTitles(["Mellanmjölk 1,5 %"]));
  await section(page).getByRole("button", { name: "Bekräfta Mjölk" }).click();
  await expect(toast(page)).toContainText("Mjölk är sparad i kylen.");
  await expect(group(page, "Ändrat")).toHaveCount(0);

  const after = await pantry();
  expect(on(after, "Hemma")).toEqual(on(before, "Hemma"));
  expect(on(after, "Stugan").find((row) => row.name === "Mjölk")).toMatchObject({ amount: 1, unit: "förp" });
  // Hemma's list is Hemma's: 1 l, never Stugan's 1 förp.
  // Story 11.3: the rows show no amount; on(after, "Hemma") above holds the 1 l.
  await expect(rows(page).filter({ hasText: /^Mjölk(?:\s|$)/ })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("Töm kylen on Stugan asks with its name, empties only Stugan, and Ångra after selecting Hemma puts the rows back there", async ({
  page,
}) => {
  const errors = watchErrors(page);
  const before = await pantry();
  await openHemma(page);
  await choose(page, "Stugan");
  await expect(placeCard(page, "Kyl")).toHaveText(/^\S*Kyl\s*2 varor$/);
  await page.getByRole("button", { name: "Töm kylen" }).filter({ visible: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Ta bort alla 2 varor i kylen för Stugan?")).toBeVisible();
  await sheet.getByRole("button", { name: "Ta bort", exact: true }).click();
  await expect(toast(page)).toContainText("Tog bort 2 varor ur kylen för Stugan.");
  await expect.poll(async () => on(await pantry(), "Stugan")).toEqual([]);
  expect(on(await pantry(), "Hemma")).toEqual(on(before, "Hemma"));

  await choose(page, "Hemma");
  await toast(page).getByRole("button", { name: "Ångra" }).click();
  await expect.poll(async () => on(await pantry(), "Stugan")).toEqual(on(before, "Stugan"));
  expect(on(await pantry(), "Hemma")).toEqual(on(before, "Hemma"));
  // Hemma's list never shows Stugan's rows.
  await expect(rows(page)).toHaveText([/^Mjölk(?:\s|$)/, /^Yoghurt(?:\s|$)/]);
  expect(errors).toEqual([]);
});

test("an empty freezer on Stugan gives the plain list, although Hemma's freezer has items, and saves on Stugan", async ({
  page,
}) => {
  const errors = watchErrors(page);
  const before = await pantry();
  await openHemma(page, "/hemma?plats=frys");
  await choose(page, "Stugan");
  await expect(placeCard(page, "Frys")).toHaveText(/^\S*Frys\s*0 varor$/);
  await photograph(page, "Fotografera frysen");

  await expect(section(page).getByRole("heading", { level: 2 })).toHaveText("Lagerförslag från frysen");
  // The plain list: six cards, and none of the groups of a compared photo.
  await expect(section(page).getByTestId("pantry-suggestion")).toHaveCount(6);
  for (const title of ["Nytt", "Ändrat", "Syns inte längre"]) {
    await expect(section(page).getByRole("heading", { level: 3, name: title, exact: true })).toHaveCount(0);
  }
  await expect(section(page).getByTestId("pantry-missing")).toHaveCount(0);
  await expect(section(page).getByText("Ärtor")).toHaveCount(0);

  await section(page).getByRole("button", { name: "Bekräfta alla" }).click();
  await expect(section(page)).toHaveCount(0);
  await expect.poll(async () => on(await pantry(), "Stugan").filter((row) => row.location === "Frys").length).toBe(6);
  expect(on(await pantry(), "Hemma")).toEqual(on(before, "Hemma"));
  expect(errors).toEqual([]);
});
