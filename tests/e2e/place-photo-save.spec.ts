import { expect, type Page, test } from "@playwright/test";
import {
  adminClient,
  e2eUserId,
  photoSaveEmail,
  photoSaveStorageState,
  placePhotoBucket,
  removePlacePhotos,
} from "./support";

// Story 10.1: the latest photo of a place is saved once something from its
// suggestions is in the pantry, with AI_PROVIDER=mock: kyl.png gives grädde,
// gurka, ketchup, mjölk, smör and ägg (kyl.analyze.json), on an empty fridge
// as the plain list. The spec has an E2E user of its own (photoSaveEmail).
// Before each test the service role removes the user's photos (rows and
// files), pantry and places, adds Hemma (selected) and Stugan, and the
// catalog ingredients of the photo. The rows and files are read with the
// service role. The tests run in order, since they share the user.

const kyl = "tests/fixtures/ai/kyl.png";

test.use({ storageState: photoSaveStorageState, viewport: { width: 375, height: 812 } });
test.describe.configure({ mode: "serial" });

let userId = "";
let sites: { Hemma: string; Stugan: string } = { Hemma: "", Stugan: "" };

test.beforeAll(async () => {
  userId = await e2eUserId(photoSaveEmail);
});

test.afterAll(async () => {
  await removePlacePhotos(userId);
  const removed = await adminClient().from("pantry_photo").delete().eq("user_id", userId);
  if (removed.error) throw removed.error;
});

test.beforeEach(async () => {
  const admin = adminClient();
  await removePlacePhotos(userId);
  for (const table of ["pantry_photo", "pantry_item", "pantry_removal", "pantry_site"] as const) {
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

  const catalog = await admin.from("ingredient").upsert(
    [
      ["Mjölk", "Mejeri", "Kyl", "förp"],
      ["Smör", "Mejeri", "Kyl", "förp"],
      ["Ägg", "Mejeri", "Kyl", "st"],
      ["Grädde", "Mejeri", "Kyl", "förp"],
      ["Gurka", "Frukt och grönt", "Kyl", "st"],
      ["Ketchup", "Skafferi", "Skafferi", "förp"],
    ].map(([name, section, location, unit]) => ({
      user_id: userId,
      name,
      normalized_name: name.toLocaleLowerCase("sv-SE"),
      section,
      location,
      default_unit: unit,
    })),
    { onConflict: "user_id,normalized_name" },
  );
  if (catalog.error) throw catalog.error;
});

type PhotoRow = { id: string; site_id: string; location: string; object_path: string; media_type: string; points: unknown };

/** The user's saved photos, read with the service role. */
async function photos(): Promise<PhotoRow[]> {
  const { data, error } = await adminClient()
    .from("pantry_photo")
    .select("id, site_id, location, object_path, media_type, points")
    .eq("user_id", userId);
  if (error) throw error;
  return data as PhotoRow[];
}

/** The files in the bucket under a place's location folder, read with the service role. */
async function files(site: string, folder = "kyl"): Promise<string[]> {
  const { data, error } = await adminClient().storage.from(placePhotoBucket).list(`${userId}/${site}/${folder}`);
  if (error) throw error;
  return data.filter((file) => file.id !== null).map((file) => `${userId}/${site}/${folder}/${file.name}`);
}

/** Counts the posts to /api/pantry/photo from the page. */
function watchPhotoSaves(page: Page): { count: () => number } {
  let count = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/pantry/photo") count += 1;
  });
  return { count: () => count };
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
const pill = (page: Page, name: string) =>
  page.getByRole("radiogroup", { name: "Ställe" }).filter({ visible: true }).getByRole("radio", { name, exact: true });
const toast = (page: Page) => page.getByTestId("toast");

async function openHemma(page: Page) {
  await page.goto("/hemma");
  await expect(page.getByRole("button", { name: "Hantera boenden", exact: true }).filter({ visible: true })).toBeEnabled();
}

/** Selects a place with its pill and waits until the page shows it. */
async function choose(page: Page, name: "Hemma" | "Stugan") {
  await pill(page, name).click();
  await expect(page.getByTestId("site-announcement").filter({ visible: true })).toHaveText(`Valt ställe: ${name}.`);
  await expect(page.getByTestId("site-content")).not.toHaveAttribute("aria-busy");
}

/** Photographs the fridge with kyl.png and waits for the suggestions. */
async function photograph(page: Page) {
  const chooser = page.waitForEvent("filechooser");
  await camera(page).getByRole("button", { name: "Fotografera kylen" }).click();
  await (await chooser).setFiles(kyl);
  await expect(section(page).getByRole("heading", { level: 2 })).toBeVisible();
}

/** Avvisa on every card, which writes nothing, until the section is gone. */
async function rejectAll(page: Page) {
  const reject = section(page).getByRole("button", { name: /^Avvisa(?:\s|$)/ });
  while ((await reject.count()) > 0) {
    const left = await reject.count();
    await reject.first().click();
    await expect(reject).toHaveCount(left - 1);
  }
  await expect(section(page)).toHaveCount(0);
}

async function confirm(page: Page, name: string) {
  await section(page).getByRole("button", { name: `Bekräfta ${name}`, exact: true }).click();
  await expect(toast(page)).toContainText(`${name} är sparad i kylen.`);
}

test("a confirmation saves the photo once, as a row and a file for Stugan's fridge, with its points", async ({ page }) => {
  const errors = watchErrors(page);
  const saves = watchPhotoSaves(page);
  await openHemma(page);
  await choose(page, "Stugan");
  await photograph(page);
  // The sheet says the photo is kept once something is confirmed.
  await section(page).getByRole("button", { name: "Fotot av kylen, visa större" }).click();
  await expect(page.getByRole("dialog", { name: "Fotot av kylen" })).toHaveAccessibleDescription(
    "Jämför förslagen med fotot. Det sparas som senaste foto när du bekräftar något.",
  );
  await page.getByRole("dialog", { name: "Fotot av kylen" }).getByRole("button", { name: "Stäng" }).click();
  expect(saves.count()).toBe(0);
  expect(await photos()).toEqual([]);

  await confirm(page, "Mjölk");
  await expect.poll(async () => (await photos()).length).toBe(1);
  const [saved] = await photos();
  expect(saved).toMatchObject({ site_id: sites.Stugan, location: "Kyl", media_type: "image/png" });
  expect(saved.object_path).toBe(`${userId}/${sites.Stugan}/kyl/${saved.id}.png`);
  expect(await files(sites.Stugan)).toEqual([saved.object_path]);
  // The mock's points come with it, or once after it.
  await expect.poll(async () => (await photos())[0].points).not.toBeNull();

  await confirm(page, "Ägg");
  await section(page).getByRole("button", { name: "Bekräfta alla" }).click();
  await expect(toast(page)).toBeVisible();
  await expect.poll(async () => (await photos()).map((photo) => photo.id)).toEqual([saved.id]);
  expect(saves.count()).toBe(1);
  expect(await files(sites.Stugan)).toEqual([saved.object_path]);
  expect(errors).toEqual([]);
});

test("only rejections save nothing", async ({ page }) => {
  const errors = watchErrors(page);
  const saves = watchPhotoSaves(page);
  await openHemma(page);
  await photograph(page);
  await rejectAll(page);
  expect(saves.count()).toBe(0);
  expect(await photos()).toEqual([]);
  expect(await files(sites.Hemma)).toEqual([]);
  expect(errors).toEqual([]);
});

test("a new photo of the place replaces the row and the file", async ({ page }) => {
  const errors = watchErrors(page);
  await openHemma(page);
  await photograph(page);
  await confirm(page, "Mjölk");
  await expect.poll(async () => (await photos()).length).toBe(1);
  const [first] = await photos();
  // The first photo's cards go without a write, so the next cards are the new photo's.
  await rejectAll(page);

  await photograph(page);
  await confirm(page, "Ägg");
  await expect.poll(async () => (await photos()).map((photo) => photo.id)).not.toEqual([first.id]);
  const [second] = await photos();
  expect(await photos()).toHaveLength(1);
  expect(second).toMatchObject({ site_id: sites.Hemma, location: "Kyl" });
  await expect.poll(() => files(sites.Hemma)).toEqual([second.object_path]);
  expect(errors).toEqual([]);
});

test("a photo of Stugan is saved on Stugan after Hemma is selected", async ({ page }) => {
  const errors = watchErrors(page);
  await openHemma(page);
  await choose(page, "Stugan");
  await photograph(page);
  await choose(page, "Hemma");
  await expect(page.getByTestId("pantry-suggestions-site").filter({ visible: true })).toHaveText("Förslagen gäller Stugan.");
  await confirm(page, "Mjölk");
  await expect.poll(async () => (await photos()).length).toBe(1);
  expect((await photos())[0]).toMatchObject({ site_id: sites.Stugan, location: "Kyl" });
  expect(await files(sites.Stugan)).toHaveLength(1);
  expect(await files(sites.Hemma)).toEqual([]);
  expect(errors).toEqual([]);
});
