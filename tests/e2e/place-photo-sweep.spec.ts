import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import {
  adminClient,
  e2eUserId,
  photoSweepEmail,
  photoSweepStorageState,
  placePhotoBucket,
  removePlacePhotos,
} from "./support";

// Story 10.3: the sweep of the latest photos. The spec has an E2E user of its
// own (photoSweepEmail). Before each test the service role removes the
// user's photos (rows and files), pantry and places, and adds Hemma
// (selected) and Stugan (empty). Photos are seeded with the service role as a
// row in pantry_photo and a file in the bucket, from the drawn kyl.png; they
// are read back the same way. The tests run in order, since they share the
// user. No AI is asked.

test.use({ storageState: photoSweepStorageState, viewport: { width: 375, height: 812 } });
test.describe.configure({ mode: "serial" });

const kylPng = readFileSync("tests/fixtures/ai/kyl.png");
const day = 24 * 60 * 60 * 1000;
const folders = { Kyl: "kyl", Frys: "frys", Skafferi: "skafferi" } as const;

let userId = "";
let sites: { Hemma: string; Stugan: string } = { Hemma: "", Stugan: "" };

test.beforeAll(async () => {
  userId = await e2eUserId(photoSweepEmail);
});

async function clear() {
  const admin = adminClient();
  await removePlacePhotos(userId);
  for (const table of ["pantry_photo", "pantry_item", "pantry_removal", "pantry_site"] as const) {
    const removed = await admin.from(table).delete().eq("user_id", userId);
    if (removed.error) throw removed.error;
  }
}

test.afterAll(clear);

test.beforeEach(async () => {
  await clear();
  // In one statement, so exactly one place is selected at its commit; a millisecond apart for the order.
  const start = Date.now();
  const added = await adminClient()
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
});

type Seeded = { id: string; path: string };

/** A photo of `location` on `site`, taken `takenAt`: its file uploaded and its row added with the service role. */
async function seedPhoto(site: string, location: keyof typeof folders, takenAt: Date): Promise<Seeded> {
  const id = randomUUID();
  const path = `${userId}/${site}/${folders[location]}/${id}.png`;
  const uploaded = await adminClient().storage.from(placePhotoBucket).upload(path, kylPng, { contentType: "image/png" });
  if (uploaded.error) throw uploaded.error;
  const inserted = await adminClient().from("pantry_photo").insert({
    id,
    user_id: userId,
    site_id: site,
    location,
    object_path: path,
    media_type: "image/png",
    width: 720,
    height: 900,
    taken_at: takenAt.toISOString(),
    reading: ["Mjölk"],
  });
  if (inserted.error) throw inserted.error;
  return { id, path };
}

/** The ids of the user's photo rows, read with the service role. */
async function photoIds(): Promise<string[]> {
  const { data, error } = await adminClient().from("pantry_photo").select("id").eq("user_id", userId);
  if (error) throw error;
  return data.map((row) => row.id as string).sort();
}

/** Whether the file is in the bucket, read with the service role. */
async function fileThere(path: string): Promise<boolean> {
  const { error } = await adminClient().storage.from(placePhotoBucket).download(path);
  return error === null;
}

/** Counts the Server Action calls the page makes (POST with a Next-Action header). */
function watchActions(page: Page): { count: () => number } {
  let count = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) count += 1;
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
const sitesButton = (page: Page) => page.getByRole("button", { name: "Hantera boenden", exact: true }).filter({ visible: true });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Ställen" });
const emptyButton = (page: Page) => page.getByRole("button", { name: "Töm kylen", exact: true }).filter({ visible: true });
const toast = (page: Page) => page.getByTestId("toast");

async function openHemma(page: Page) {
  await page.goto("/hemma");
  await expect(sitesButton(page)).toBeEnabled();
}

test("Hemma sweeps a photo older than 30 days, row and file, and keeps yesterday's", async ({ page }) => {
  const errors = watchErrors(page);
  const actions = watchActions(page);
  const now = Date.now();
  const old = await seedPhoto(sites.Hemma, "Kyl", new Date(now - 31 * day));
  const recent = await seedPhoto(sites.Hemma, "Frys", new Date(now - day));
  const almostOld = await seedPhoto(sites.Stugan, "Skafferi", new Date(now - 29 * day));

  await openHemma(page);
  await expect.poll(photoIds).toEqual([recent.id, almostOld.id].sort());
  await expect.poll(() => fileThere(old.path)).toBe(false);
  expect(await fileThere(recent.path)).toBe(true);
  expect(await fileThere(almostOld.path)).toBe(true);
  expect(actions.count()).toBe(1);

  // Nothing left to sweep: the next view calls nothing.
  await openHemma(page);
  await page.waitForLoadState("networkidle");
  expect(actions.count()).toBe(1);
  expect(errors).toEqual([]);
});

test("Hemma calls nothing when every photo is younger than 30 days", async ({ page }) => {
  const actions = watchActions(page);
  const recent = await seedPhoto(sites.Hemma, "Kyl", new Date(Date.now() - day));
  await openHemma(page);
  await page.waitForLoadState("networkidle");
  expect(actions.count()).toBe(0);
  expect(await photoIds()).toEqual([recent.id]);
  expect(await fileThere(recent.path)).toBe(true);
});

test("removing an empty place in the sheet Ställen removes its photos' files too", async ({ page }) => {
  const errors = watchErrors(page);
  const kyl = await seedPhoto(sites.Stugan, "Kyl", new Date(Date.now() - day));
  const frys = await seedPhoto(sites.Stugan, "Frys", new Date(Date.now() - 2 * day));
  const home = await seedPhoto(sites.Hemma, "Kyl", new Date(Date.now() - day));

  await openHemma(page);
  await sitesButton(page).click();
  await sheet(page).getByRole("button", { name: "Ta bort Stugan" }).click();
  await expect(sheet(page).getByTestId("sites-status")).toHaveText("Tog bort Stugan.");

  expect(await photoIds()).toEqual([home.id]);
  expect(await fileThere(kyl.path)).toBe(false);
  expect(await fileThere(frys.path)).toBe(false);
  expect(await fileThere(home.path)).toBe(true);
  expect(errors).toEqual([]);
});

test("Töm kylen and Ångra leave the photo of the fridge", async ({ page }) => {
  const admin = adminClient();
  const catalog = await admin
    .from("ingredient")
    .upsert(
      [{ user_id: userId, name: "mjölk", normalized_name: "mjölk", section: "Mejeri", location: "Kyl", default_unit: "förp" }],
      { onConflict: "user_id,normalized_name" },
    )
    .select("id");
  if (catalog.error) throw catalog.error;
  const item = await admin
    .from("pantry_item")
    .insert({ user_id: userId, site_id: sites.Hemma, ingredient_id: catalog.data[0].id, location: "Kyl", amount: 2, unit: "förp" });
  if (item.error) throw item.error;
  const photo = await seedPhoto(sites.Hemma, "Kyl", new Date(Date.now() - day));

  await openHemma(page);
  await emptyButton(page).click();
  await page.getByRole("dialog", { name: "Töm kylen" }).getByRole("button", { name: "Töm kylen" }).click();
  // With two places the toast names the place (Story 8.4).
  await expect(toast(page)).toContainText("Tog bort 1 vara ur kylen för Hemma.");
  expect(await photoIds()).toEqual([photo.id]);
  expect(await fileThere(photo.path)).toBe(true);

  await toast(page).getByRole("button", { name: "Ångra" }).click();
  await expect(page.getByTestId("pantry-row").filter({ visible: true })).toHaveCount(1);
  expect(await photoIds()).toEqual([photo.id]);
  expect(await fileThere(photo.path)).toBe(true);
});
