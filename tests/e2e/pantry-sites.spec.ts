import { type Browser, expect, type Page, test } from "@playwright/test";
import { adminClient, e2eUserId, sitesEmail, sitesStorageState } from "./support";

// Story 8.2: choosing and managing places in Hemma. The spec has an E2E user
// of its own (sitesEmail). Before each test the service role removes the
// user's pantry items and every place, and adds the places the test needs,
// with Hemma selected unless the test says otherwise; places and items are
// written in one statement each, so exactly one place is selected at every
// commit (pantry_site_one_selected). A selection made "on another device" is
// a second browser context with the same session. The tests run in order,
// since they share the user.

const mobile = { width: 375, height: 812 };

let userId = "";

/** The catalog ingredients the tests put in the pantry, upserted: the catalog is never deleted from. */
async function ingredientIds(): Promise<Record<"Mjölk" | "Smör", string>> {
  const { data, error } = await adminClient()
    .from("ingredient")
    .upsert(
      [
        { user_id: userId, name: "Mjölk", normalized_name: "mjölk", section: "Mejeri", location: "Kyl", default_unit: "l" },
        { user_id: userId, name: "Smör", normalized_name: "smör", section: "Mejeri", location: "Kyl", default_unit: "g" },
      ],
      { onConflict: "user_id,normalized_name" },
    )
    .select("id, name");
  if (error) throw error;
  const ids = new Map((data as { id: string; name: string }[]).map((row) => [row.name, row.id]));
  return { Mjölk: ids.get("Mjölk")!, Smör: ids.get("Smör")! };
}

type Item = { site: string; name: "Mjölk" | "Smör"; location: "Kyl" | "Frys" | "Skafferi"; amount: number; unit: string };

/**
 * The user's places, in order, with `selected` selected, and `items` on
 * them; every other place and item goes. Returns the places' ids by name.
 */
async function resetPlaces(names: string[], selected = "Hemma", items: Item[] = []): Promise<Record<string, string>> {
  const admin = adminClient();
  const removedItems = await admin.from("pantry_item").delete().eq("user_id", userId);
  if (removedItems.error) throw removedItems.error;
  // A user without places is allowed, so every place goes in one statement.
  const removedSites = await admin.from("pantry_site").delete().eq("user_id", userId);
  if (removedSites.error) throw removedSites.error;
  // In one statement, so exactly one is selected at its commit; created_at
  // a millisecond apart gives the order.
  const start = Date.now();
  const added = await admin
    .from("pantry_site")
    .insert(
      names.map((name, index) => ({
        user_id: userId,
        name,
        normalized_name: name.toLocaleLowerCase("sv"),
        is_selected: name === selected,
        created_at: new Date(start + index).toISOString(),
      })),
    )
    .select("id, name");
  if (added.error) throw added.error;
  const sites = Object.fromEntries((added.data as { id: string; name: string }[]).map((site) => [site.name, site.id]));
  if (items.length > 0) {
    const ids = await ingredientIds();
    const inserted = await admin.from("pantry_item").insert(
      items.map((item) => ({
        user_id: userId,
        site_id: sites[item.site],
        ingredient_id: ids[item.name],
        location: item.location,
        amount: item.amount,
        unit: item.unit,
      })),
    );
    if (inserted.error) throw inserted.error;
  }
  return sites;
}

type SiteRow = { id: string; name: string; is_selected: boolean };

async function storedPlaces(): Promise<SiteRow[]> {
  const { data, error } = await adminClient()
    .from("pantry_site")
    .select("id, name, is_selected")
    .eq("user_id", userId)
    .order("created_at")
    .order("id");
  if (error) throw error;
  return data as SiteRow[];
}

async function selectedPlace(): Promise<string | undefined> {
  return (await storedPlaces()).find((site) => site.is_selected)?.name;
}

type ItemRow = { id: string; site_id: string; location: string; amount: number; unit: string; ingredient: { name: string } };

async function storedItems(): Promise<ItemRow[]> {
  const { data, error } = await adminClient()
    .from("pantry_item")
    .select("id, site_id, location, amount, unit, ingredient!inner(name)")
    .eq("user_id", userId)
    .order("id");
  if (error) throw error;
  return (data as unknown as ItemRow[]).map((row) => ({ ...row, amount: Number(row.amount) }));
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
const pills = (page: Page) => page.getByRole("radiogroup", { name: "Ställe" }).filter({ visible: true });
const pill = (page: Page, name: string) => pills(page).getByRole("radio", { name, exact: true });
const sitesButton = (page: Page) => page.getByRole("button", { name: "Ställen", exact: true }).filter({ visible: true });
const addSiteButton = (page: Page) => page.getByRole("button", { name: "Lägg till ställe" }).filter({ visible: true });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Ställen" });
const sheetStatus = (page: Page) => sheet(page).getByTestId("sites-status");
const newField = (page: Page) => sheet(page).getByLabel("Nytt ställe");
const addButton = (page: Page) => sheet(page).getByRole("button", { name: "Lägg till", exact: true });
const places = (page: Page) => page.getByRole("navigation", { name: "Platser" }).filter({ visible: true });
const card = (page: Page, name: "Kyl" | "Frys" | "Skafferi") => places(page).getByRole("link", { name: new RegExp(`^${name}`) });
const rows = (page: Page) => page.getByTestId("pantry-row").filter({ visible: true });
const announcement = (page: Page) => page.getByTestId("site-announcement").filter({ visible: true });
const toast = (page: Page) => page.getByTestId("toast");
const itemSheet = (page: Page) => page.getByRole("dialog", { name: "Lagervara" });

/** Hemma, once React runs: the switch's text button (or "Lägg till ställe" with one place) is enabled. */
async function openHemma(page: Page, path = "/hemma") {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1, name: "Lagersaldo" })).toBeVisible();
  const ready = (await storedPlaces()).length > 1 ? sitesButton(page) : addSiteButton(page);
  await expect(ready).toBeEnabled();
}

/** Selects a place with its pill and waits until the page shows it. */
async function choose(page: Page, name: string) {
  await pill(page, name).click();
  await expect(announcement(page)).toHaveText(`Valt ställe: ${name}.`);
  await expect(page.getByTestId("site-content")).not.toHaveAttribute("aria-busy");
}

/** A second device: another browser context with the same session. */
async function otherDevice(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: sitesStorageState, viewport: mobile });
  return context.newPage();
}

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function expectTapSize(target: ReturnType<Page["getByRole"]>) {
  const box = await target.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box?.width).toBeGreaterThanOrEqual(44);
}

test.use({ storageState: sitesStorageState, viewport: mobile });
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  userId = await e2eUserId(sitesEmail);
});

test("with one place there is no switch, and Lägg till ställe is at the bottom, under Töm kylen", async ({ page }) => {
  const errors = watchErrors(page);
  await resetPlaces(["Hemma"], "Hemma", [{ site: "Hemma", name: "Mjölk", location: "Kyl", amount: 1, unit: "l" }]);
  await openHemma(page);

  await expect(pills(page)).toHaveCount(0);
  await expect(sitesButton(page)).toHaveCount(0);
  const empty = page.getByRole("button", { name: "Töm kylen" }).filter({ visible: true });
  const emptyBox = await empty.boundingBox();
  const addBox = await addSiteButton(page).boundingBox();
  expect(addBox!.y).toBeGreaterThan(emptyBox!.y);
  await expectTapSize(addSiteButton(page));
  expect(errors).toEqual([]);
});

test("Lägg till ställe adds Stugan, not selected, and Hemma shows the pills and Ställen", async ({ page }) => {
  const errors = watchErrors(page);
  await resetPlaces(["Hemma"]);
  await openHemma(page);

  await addSiteButton(page).click();
  await expect(sheet(page)).toBeVisible();
  await expect(newField(page)).toHaveAttribute("placeholder", "Till exempel Stugan");
  await newField(page).fill("Stugan");
  await addButton(page).click();
  await expect(sheetStatus(page)).toHaveText("Lade till Stugan. Välj det för att se och fylla dess lager.");
  await expect(newField(page)).toHaveValue("");
  expect((await storedPlaces()).map((site) => [site.name, site.is_selected])).toEqual([
    ["Hemma", true],
    ["Stugan", false],
  ]);
  await expectTapSize(addButton(page));
  await expectTapSize(sheet(page).getByRole("button", { name: "Byt namn på Stugan" }));

  await sheet(page).getByRole("button", { name: "Klar" }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(pills(page).getByRole("radio")).toHaveText(["Hemma", "Stugan"]);
  await expect(pill(page, "Hemma")).toHaveAttribute("aria-checked", "true");
  await expect(pill(page, "Stugan")).toHaveAttribute("aria-checked", "false");
  await expect(sitesButton(page)).toBeVisible();
  await expect(addSiteButton(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lagersaldo");
  for (const target of [pill(page, "Hemma"), pill(page, "Stugan"), sitesButton(page)]) await expectTapSize(target);
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test("the field says why a name cannot be saved: taken, empty, too long, and the eleventh place", async ({ page }) => {
  const errors = watchErrors(page);
  await resetPlaces(["Hemma", "Stugan"]);
  await openHemma(page);
  await sitesButton(page).click();

  await newField(page).fill(" STUGAN ");
  await addButton(page).click();
  await expect(sheet(page).getByText("Det finns redan ett ställe som heter Stugan.")).toBeVisible();
  await expect(newField(page)).toHaveAttribute("aria-invalid", "true");

  await newField(page).fill("   ");
  await addButton(page).click();
  await expect(sheet(page).getByText("Ange ett namn på stället.")).toBeVisible();

  await newField(page).fill("a".repeat(41));
  await addButton(page).click();
  await expect(sheet(page).getByText("Namnet får vara högst 40 tecken.")).toBeVisible();
  expect(await storedPlaces()).toHaveLength(2);

  // Nine places besides Hemma: ten in all.
  await resetPlaces(["Hemma", ...Array.from({ length: 9 }, (_, index) => `Ställe ${index + 2}`)]);
  await openHemma(page);
  await sitesButton(page).click();
  await expect(newField(page)).toBeDisabled();
  await expect(addButton(page)).toBeDisabled();
  await expect(sheet(page).getByText("Du kan ha högst 10 ställen.")).toBeVisible();
  // Ten pills wrap, never scroll sideways.
  await sheet(page).getByRole("button", { name: "Klar" }).click();
  await expect(pills(page).getByRole("radio")).toHaveCount(10);
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test("a tap on Stugan selects it, keeps Frys chosen, says so, and shows its empty locations", async ({ page }) => {
  const errors = watchErrors(page);
  await resetPlaces(["Hemma", "Stugan"], "Hemma", [{ site: "Hemma", name: "Mjölk", location: "Frys", amount: 1, unit: "l" }]);
  await openHemma(page, "/hemma?plats=frys");
  await expect(card(page, "Frys")).toHaveText(/^Frys\s*1 vara$/);

  await choose(page, "Stugan");
  await expect(page).toHaveURL(/\/hemma\?plats=frys$/);
  await expect(pill(page, "Stugan")).toHaveAttribute("aria-checked", "true");
  await expect(card(page, "Frys")).toHaveAttribute("aria-current", "true");
  for (const name of ["Kyl", "Frys", "Skafferi"] as const) await expect(card(page, name)).toHaveText(new RegExp(`^${name}\\s*0 varor$`));
  await expect(page.getByText("Inget i frysen än.").filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fotografera frysen" }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lagersaldo");
  expect(await selectedPlace()).toBe("Stugan");
  expect(errors).toEqual([]);
});

test("another device opening Matkoll shows the place selected on this one", async ({ page, browser }) => {
  await resetPlaces(["Hemma", "Stugan"]);
  await openHemma(page);
  await choose(page, "Stugan");

  const other = await otherDevice(browser);
  try {
    await other.goto("/hemma");
    await expect(pill(other, "Stugan")).toHaveAttribute("aria-checked", "true");
    await expect(pill(other, "Hemma")).toHaveAttribute("aria-checked", "false");
  } finally {
    await other.context().close();
  }
});

test("milk added with Stugan selected is on Stugan, and Hemma's fridge is as it was", async ({ page }) => {
  const errors = watchErrors(page);
  const sites = await resetPlaces(["Hemma", "Stugan"], "Hemma", [
    { site: "Hemma", name: "Mjölk", location: "Kyl", amount: 2, unit: "l" },
  ]);
  const hemmaBefore = await storedItems();
  await openHemma(page);
  await choose(page, "Stugan");
  await expect(rows(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Lägg till vara" }).filter({ visible: true }).first().click();
  await itemSheet(page).getByRole("searchbox", { name: "Sök ingrediens" }).fill("mjö");
  await itemSheet(page).getByRole("button", { name: "Mjölk" }).click();
  await itemSheet(page).getByLabel("Mängd").fill("1");
  await itemSheet(page).getByLabel("Enhet").selectOption("l");
  await itemSheet(page).getByRole("button", { name: "Lägg till vara" }).click();
  await expect(toast(page)).toHaveText("Mjölk är sparad i kylen.");
  await expect(rows(page)).toHaveText([/^Mjölk Tillagd idag$/]);

  const after = await storedItems();
  expect(after.filter((item) => item.site_id === sites.Stugan)).toMatchObject([
    { location: "Kyl", amount: 1, unit: "l", ingredient: { name: "Mjölk" } },
  ]);
  expect(after.filter((item) => item.site_id === sites.Hemma)).toEqual(hemmaBefore);
  expect(errors).toEqual([]);
});

test("a view showing Stugan still writes on Stugan after Hemma was selected on another device", async ({ page, browser }) => {
  const sites = await resetPlaces(["Hemma", "Stugan"], "Stugan", [
    { site: "Stugan", name: "Mjölk", location: "Kyl", amount: 1, unit: "l" },
    { site: "Stugan", name: "Smör", location: "Kyl", amount: 250, unit: "g" },
  ]);
  const other = await otherDevice(browser);
  try {
    // A change in the old view.
    await openHemma(page);
    await expect(rows(page)).toHaveText([/^Mjölk /, /^Smör /]);
    await openHemma(other);
    await choose(other, "Hemma");
    expect(await selectedPlace()).toBe("Hemma");

    await rows(page).filter({ hasText: "Smör" }).click();
    await itemSheet(page).getByLabel("Mängd").fill("300");
    await itemSheet(page).getByRole("button", { name: "Spara ändringar" }).click();
    await expect(toast(page)).toHaveText("Smör är sparad i kylen.");
    await expect
      .poll(async () => (await storedItems()).map((item) => [item.ingredient.name, item.site_id, item.amount]))
      .toEqual(
        expect.arrayContaining([
          ["Smör", sites.Stugan, 300],
          ["Mjölk", sites.Stugan, 1],
        ]),
      );
    expect((await storedItems()).filter((item) => item.site_id === sites.Hemma)).toEqual([]);

    // A removal and "Ångra" in an old view.
    await choose(other, "Stugan");
    await openHemma(page);
    await expect(pill(page, "Stugan")).toHaveAttribute("aria-checked", "true");
    await choose(other, "Hemma");
    const mjolk = (await storedItems()).find((item) => item.ingredient.name === "Mjölk")!;

    await rows(page).filter({ hasText: "Mjölk" }).click();
    await itemSheet(page).getByRole("button", { name: "Ta bort" }).click();
    await expect(toast(page)).toContainText("Tog bort Mjölk.");
    await expect.poll(async () => (await storedItems()).some((item) => item.id === mjolk.id)).toBe(false);
    await toast(page).getByRole("button", { name: "Ångra" }).click();
    await expect.poll(async () => (await storedItems()).find((item) => item.id === mjolk.id)?.site_id).toBe(sites.Stugan);
    expect((await storedItems()).filter((item) => item.site_id === sites.Hemma)).toEqual([]);
    expect(await selectedPlace()).toBe("Hemma");
  } finally {
    await other.context().close();
  }
});

test("the sheet renames a place and removes an empty one, and offers Ta bort only where it can go", async ({ page }) => {
  const errors = watchErrors(page);
  await resetPlaces(["Hemma", "Stugan", "Torpet"], "Hemma", [
    { site: "Hemma", name: "Mjölk", location: "Kyl", amount: 1, unit: "l" },
    { site: "Torpet", name: "Smör", location: "Skafferi", amount: 250, unit: "g" },
  ]);
  await openHemma(page);
  await sitesButton(page).click();

  const siteRows = sheet(page).getByTestId("site-row");
  await expect(siteRows).toHaveText([/^Hemma\s*1 vara\s*Valt$/, /^Stugan\s*0 varor\s*Ta bort$/, /^Torpet\s*1 vara$/]);
  await expect(sheet(page).getByRole("button", { name: "Ta bort Hemma" })).toHaveCount(0);
  await expect(sheet(page).getByRole("button", { name: "Ta bort Torpet" })).toHaveCount(0);

  await sheet(page).getByRole("button", { name: "Byt namn på Stugan" }).click();
  await sheet(page).getByLabel("Namn", { exact: true }).fill("Vinterstugan");
  await sheet(page).getByRole("button", { name: "Spara" }).click();
  await expect(sheetStatus(page)).toHaveText("Stället heter nu Vinterstugan.");
  await expect(pill(page, "Vinterstugan")).toHaveCount(1);
  expect((await storedPlaces()).map((site) => site.name)).toEqual(["Hemma", "Vinterstugan", "Torpet"]);

  await sheet(page).getByRole("button", { name: "Ta bort Vinterstugan" }).click();
  await expect(sheetStatus(page)).toHaveText("Tog bort Vinterstugan.");
  await expect(siteRows).toHaveCount(2);
  expect((await storedPlaces()).map((site) => site.name)).toEqual(["Hemma", "Torpet"]);

  // The last place has no Ta bort either.
  await resetPlaces(["Hemma"]);
  await openHemma(page);
  await addSiteButton(page).click();
  await expect(sheet(page).getByTestId("site-row")).toHaveText([/^Hemma\s*0 varor\s*Valt$/]);
  await expect(sheet(page).getByRole("button", { name: /^Ta bort/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the page waits while a switch is on its way: + and the list are unavailable until the new place shows", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await resetPlaces(["Hemma", "Stugan"]);
  await openHemma(page);
  // The Server Action that saves the selection is held until the test lets it go, as a slow network would.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname === "/hemma",
    async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) await held;
      await route.continue();
    },
  );
  const plus = page.getByRole("button", { name: "Lägg till vara" }).filter({ visible: true }).first();
  const content = page.getByTestId("site-content").filter({ visible: true });

  await pill(page, "Stugan").click();
  await expect(pill(page, "Stugan")).toHaveAttribute("aria-checked", "true");
  await expect(plus).toBeDisabled();
  await expect(sitesButton(page)).toBeDisabled();
  await expect(content).toHaveAttribute("aria-busy", "true");

  release();
  await expect(announcement(page)).toHaveText("Valt ställe: Stugan.");
  await expect(content).not.toHaveAttribute("aria-busy");
  await expect(plus).toBeEnabled();
  expect(await selectedPlace()).toBe("Stugan");
  expect(errors).toEqual([]);
});

// Story 8.4 replaces the stopgap of Story 8.2 (the suggestions went with a
// switch): they stay, say which place they are for, and are saved there.
test("a photo's suggestions stay when another place is selected, and are saved on the photo's place", async ({ page }) => {
  const errors = watchErrors(page);
  const sites = await resetPlaces(["Hemma", "Stugan"]);
  await openHemma(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Fotografera kylen" }).filter({ visible: true }).click();
  await (await chooser).setFiles("tests/fixtures/ai/kyl.png");
  const suggestions = page.getByTestId("pantry-suggestion").filter({ visible: true });
  await expect(suggestions.first()).toBeVisible();
  const count = await suggestions.count();
  const placeLine = page.getByTestId("pantry-suggestions-site").filter({ visible: true });
  await expect(placeLine).toHaveCount(0);

  await choose(page, "Stugan");
  await expect(suggestions).toHaveCount(count);
  await expect(placeLine).toHaveText("Förslagen gäller Hemma.");
  await page.getByRole("button", { name: "Bekräfta alla" }).filter({ visible: true }).click();
  await expect(suggestions).toHaveCount(0);
  await expect.poll(async () => (await storedItems()).length).toBeGreaterThan(0);
  const stored = await storedItems();
  expect(stored.every((item) => item.site_id === sites.Hemma)).toBe(true);
  await expect(rows(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});
