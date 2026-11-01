import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, type Page, request, test } from "@playwright/test";
import { photoTimeText } from "@/features/pantry/domain/place-photo";
import {
  adminClient,
  e2eUserId,
  outsiderEmail,
  photoViewEmail,
  photoViewStorageState,
  placePhotoBucket,
  removePlacePhotos,
  boendeButton,
  pickBoende,
} from "./support";

// Story 10.2: the latest photo of a place in Matvaror (/hemma). The spec has an E2E user
// of its own (photoViewEmail). Before each test the service role removes the
// user's photos (rows and files) and places, adds the places Hemma
// (selected) and Stugan, and seeds photos with the drawn kyl.png (720 x 900): Hemma's
// fridge with a reading and points, Hemma's pantry without points,
// Stugan's fridge, and Stugan's freezer taken 31 days ago. The image is
// never sent anywhere but to the page. The tests run in order, since they
// share the user.

const kyl = new Uint8Array(readFileSync("tests/fixtures/ai/kyl.png"));
const minute = 60 * 1000;
const day = 24 * 60 * minute;

test.use({ storageState: photoViewStorageState, viewport: { width: 375, height: 812 } });
test.describe.configure({ mode: "serial" });

type Seeded = { id: string; path: string; takenAt: Date };
type Location = "Kyl" | "Frys" | "Skafferi";
const folders: Record<Location, string> = { Kyl: "kyl", Frys: "frys", Skafferi: "skafferi" };

let userId = "";
let outsiderId = "";
let sites: { Hemma: string; Stugan: string } = { Hemma: "", Stugan: "" };
let photos: { hemmaKyl: Seeded; hemmaSkafferi: Seeded; stuganKyl: Seeded; stuganFrys: Seeded };
/** A photo of the outsider's, another user than the spec's. */
let othersPhoto: Seeded | null = null;
let othersSite: string | null = null;

/** A photo of `location` on `siteId` for `owner`: the file uploaded and the row added with the service role. */
async function seedPhoto(
  owner: string,
  siteId: string,
  location: Location,
  takenAt: Date,
  reading: string[],
  points: { n: number; x: number; y: number }[] | null,
): Promise<Seeded> {
  const id = randomUUID();
  const path = `${owner}/${siteId}/${folders[location]}/${id}.png`;
  const uploaded = await adminClient()
    .storage.from(placePhotoBucket)
    .upload(path, kyl, { contentType: "image/png", upsert: false });
  if (uploaded.error) throw uploaded.error;
  const inserted = await adminClient().from("pantry_photo").insert({
    id,
    user_id: owner,
    site_id: siteId,
    location,
    object_path: path,
    media_type: "image/png",
    width: 720,
    height: 900,
    taken_at: takenAt.toISOString(),
    reading,
    points,
  });
  if (inserted.error) throw inserted.error;
  return { id, path, takenAt };
}

async function clearUser(owner: string) {
  await removePlacePhotos(owner);
  for (const table of ["pantry_photo", "pantry_item", "pantry_removal", "pantry_site"] as const) {
    const removed = await adminClient().from(table).delete().eq("user_id", owner);
    if (removed.error) throw removed.error;
  }
}

test.beforeAll(async () => {
  userId = await e2eUserId(photoViewEmail);
  outsiderId = await e2eUserId(outsiderEmail);
});

test.afterAll(async () => {
  await clearUser(userId);
  if (othersPhoto) await adminClient().storage.from(placePhotoBucket).remove([othersPhoto.path]);
  // The row goes with its place (on delete cascade).
  if (othersSite) await adminClient().from("pantry_site").delete().eq("id", othersSite);
});

test.beforeEach(async () => {
  await clearUser(userId);
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

  const now = Date.now();
  photos = {
    hemmaKyl: await seedPhoto(userId, sites.Hemma, "Kyl", new Date(now - 5 * minute), ["Mellanmjölk 1,5 %", "Smör 500 g", "Ägg"], [
      { n: 1, x: 250, y: 300 },
      { n: 3, x: 700, y: 650 },
    ]),
    hemmaSkafferi: await seedPhoto(userId, sites.Hemma, "Skafferi", new Date(now - 2 * day), ["Ketchup"], null),
    stuganKyl: await seedPhoto(userId, sites.Stugan, "Kyl", new Date(now - day), ["Vispgrädde 3 dl"], [{ n: 1, x: 500, y: 500 }]),
    stuganFrys: await seedPhoto(userId, sites.Stugan, "Frys", new Date(now - 31 * day), ["Ärtor"], null),
  };
});

/** Collects console errors and uncaught exceptions for the page. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** Counts the page's requests for a saved photo. */
function watchPhotoReads(page: Page): { count: () => number } {
  let count = 0;
  page.on("request", (sent) => {
    if (new URL(sent.url()).pathname.startsWith("/api/pantry/photo/")) count += 1;
  });
  return { count: () => count };
}

// Earlier routes stay mounted but hidden after a client navigation, so every
// locator is scoped to what is visible.
const line = (page: Page) => page.getByTestId("pantry-latest-photo").filter({ visible: true });
const visa = (page: Page, place = "kylen") =>
  line(page).getByRole("button", { name: `Visa senaste foto av ${place}`, exact: true });
const photoSheet = (page: Page, place = "kylen") => page.getByRole("dialog", { name: `Fotot av ${place}` });
const question = (page: Page) => page.getByRole("dialog", { name: "Ta bort fotot av kylen?" });
const markers = (page: Page) => photoSheet(page).getByTestId("pantry-photo-marker");
const camera = (page: Page) => page.getByTestId("pantry-camera").filter({ visible: true });
const card = (page: Page, name: Location) =>
  page.getByRole("navigation", { name: "Platser" }).filter({ visible: true }).getByRole("link", { name: new RegExp(`^${name}`) });

async function openLagersaldo(page: Page) {
  await page.goto("/hemma");
  await expect(boendeButton(page)).toBeEnabled();
  // The photo of 31 days has Matvaror sweep it (Story 10.3), and the page is read again after:
  // wait for that, so a click never lands on a line that is being replaced.
  await page.waitForLoadState("networkidle");
}

/** Selects a place in the boende menu and waits until the page shows it. */
async function choose(page: Page, name: "Hemma" | "Stugan") {
  await pickBoende(page, name);
  await expect(page.getByTestId("site-announcement").filter({ visible: true })).toHaveText(`Valt boende: ${name}.`);
  await expect(page.getByTestId("site-content")).not.toHaveAttribute("aria-busy");
}

/** The photo's time as Matvaror writes it, counted now. */
const time = (photo: Seeded) => photoTimeText(photo.takenAt, new Date());

test("the line under the camera button opens the photo with its markers and the reading as a numbered list", async ({ page }) => {
  const errors = watchErrors(page);
  const reads = watchPhotoReads(page);
  await openLagersaldo(page);
  await expect(line(page)).toHaveText(new RegExp(`^Senaste ${time(photos.hemmaKyl)}\\s*·\\s*Visa$`));
  // Inside the camera area, under the button, with no thumbnail, and nothing fetched before "Visa".
  await expect(camera(page).getByTestId("pantry-latest-photo")).toBeVisible();
  await expect(line(page).getByRole("img")).toHaveCount(0);
  expect(reads.count()).toBe(0);
  // "Visa" keeps a 44 px target in the meta line (Epic 11).
  const target = await visa(page).boundingBox();
  expect(target!.height).toBeGreaterThanOrEqual(44);
  expect(target!.width).toBeGreaterThanOrEqual(44);

  await visa(page).click();
  await expect(photoSheet(page)).toHaveAccessibleDescription(
    `Taget ${time(photos.hemmaKyl)}. Numren visar vad AI:n läste av.`,
  );
  const image = photoSheet(page).getByRole("img", { name: "Senaste fotot av kylen" });
  await expect(image).toHaveAttribute("src", `/api/pantry/photo/${photos.hemmaKyl.id}`);
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(720);
  await expect(markers(page)).toHaveText(["1", "3"]);
  await expect(photoSheet(page).getByRole("heading", { name: "AI:n läste av:" })).toBeVisible();
  await expect(photoSheet(page).getByRole("list", { name: "AI:n läste av:" }).getByRole("listitem")).toHaveText([
    /Mellanmjölk 1,5 %$/,
    /Smör 500 g$/,
    /Ägg$/,
  ]);
  // Full size, and the markers come along.
  await photoSheet(page).getByRole("button", { name: "Visa i full storlek" }).click();
  await expect(photoSheet(page).getByRole("button", { name: "Visa i full storlek" })).toHaveAttribute("aria-pressed", "true");
  await expect(markers(page)).toHaveCount(2);
  // No sideways scroll at 375 px.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.keyboard.press("Escape");
  await expect(photoSheet(page)).toHaveCount(0);
  await expect(visa(page)).toBeFocused();
  expect(errors).toEqual([]);
});

test("the line follows the location and the place, and a photo older than 30 days has none", async ({ page }) => {
  const errors = watchErrors(page);
  await openLagersaldo(page);
  await expect(line(page)).toContainText("Senaste");

  await card(page, "Frys").click();
  await expect(camera(page).getByRole("button", { name: "Fotografera frysen" })).toBeVisible();
  await expect(line(page)).toHaveCount(0);

  await card(page, "Skafferi").click();
  await expect(line(page)).toHaveText(new RegExp(`^Senaste ${time(photos.hemmaSkafferi)}`));
  await visa(page, "skafferiet").click();
  // Without points: no markers, the time only, and the whole reading.
  await expect(photoSheet(page, "skafferiet")).toHaveAccessibleDescription(`Taget ${time(photos.hemmaSkafferi)}.`);
  const image = photoSheet(page, "skafferiet").getByRole("img", { name: "Senaste fotot av skafferiet" });
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(720);
  await expect(photoSheet(page, "skafferiet").getByTestId("pantry-photo-marker")).toHaveCount(0);
  await expect(photoSheet(page, "skafferiet").getByRole("listitem")).toHaveText([/Ketchup$/]);
  await photoSheet(page, "skafferiet").getByRole("button", { name: "Klar" }).click();

  await card(page, "Kyl").click();
  await choose(page, "Stugan");
  await expect(line(page)).toHaveText(new RegExp(`^Senaste ${time(photos.stuganKyl)}`));
  await visa(page).click();
  await expect(photoSheet(page).getByRole("img")).toHaveAttribute("src", `/api/pantry/photo/${photos.stuganKyl.id}`);
  await photoSheet(page).getByRole("button", { name: "Klar" }).click();

  // Stugan's freezer has a photo from 31 days ago.
  await card(page, "Frys").click();
  await expect(camera(page).getByRole("button", { name: "Fotografera frysen" })).toBeVisible();
  await expect(line(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the route sends the photo privately, and the same 404 for another user's photo, an old one and a made-up id", async ({
  page,
  baseURL,
}) => {
  await openLagersaldo(page);
  const own = await page.request.get(`/api/pantry/photo/${photos.hemmaKyl.id}`);
  expect(own.status()).toBe(200);
  expect(own.headers()["content-type"]).toBe("image/png");
  expect(own.headers()["cache-control"]).toBe("private, no-store");
  expect(own.headers()["x-content-type-options"]).toBe("nosniff");
  expect(new Uint8Array(await own.body())).toEqual(kyl);
  // HEAD checks without sending the file.
  const ownHead = await page.request.head(`/api/pantry/photo/${photos.hemmaKyl.id}`);
  expect(ownHead.status()).toBe(200);
  expect(ownHead.headers()["cache-control"]).toBe("private, no-store");

  // A place of its own for the outsider, so nothing else of theirs is touched. A user with
  // places must have exactly one selected, so it is the selected one when the outsider has
  // none yet (a fresh database in CI); deleting it again leaves the outsider with no places.
  const name = `Foto ${randomUUID().slice(0, 8)}`;
  const selected = await adminClient()
    .from("pantry_site")
    .select("id", { count: "exact", head: true })
    .eq("user_id", outsiderId)
    .eq("is_selected", true);
  if (selected.error) throw selected.error;
  const outsiderSite = await adminClient()
    .from("pantry_site")
    .insert({ user_id: outsiderId, name, normalized_name: name.toLocaleLowerCase("sv"), is_selected: selected.count === 0 })
    .select("id")
    .single();
  if (outsiderSite.error) throw outsiderSite.error;
  const othersPlace: string = outsiderSite.data.id;
  othersSite = othersPlace;
  othersPhoto = await seedPhoto(outsiderId, othersPlace, "Kyl", new Date(), ["Mjölk"], null);

  for (const path of [
    `/api/pantry/photo/${othersPhoto.id}`,
    `/api/pantry/photo/${photos.stuganFrys.id}`,
    `/api/pantry/photo/${randomUUID()}`,
    "/api/pantry/photo/abc",
  ]) {
    const answer = await page.request.get(path);
    expect(answer.status(), path).toBe(404);
    expect((await answer.body()).length, path).toBe(0);
    expect((await page.request.head(path)).status(), path).toBe(404);
  }

  // Without a session: 401, and no image.
  const anonymous = await request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const answer = await anonymous.get(`/api/pantry/photo/${photos.hemmaKyl.id}`);
    expect(answer.status()).toBe(401);
    expect(answer.headers()["content-type"]).not.toMatch(/^image\//);
    expect(answer.headers()["cache-control"]).toBe("private, no-store");
    expect(answer.headers()["x-content-type-options"]).toBe("nosniff");
  } finally {
    await anonymous.dispose();
  }
});

test("Ta bort fotot asks first, Avbryt brings the photo back, and Ta bort removes the row and the file", async ({ page }) => {
  const errors = watchErrors(page);
  await openLagersaldo(page);
  await visa(page).click();
  await photoSheet(page).getByRole("button", { name: "Ta bort fotot" }).click();
  await expect(photoSheet(page)).toHaveCount(0);
  await expect(question(page)).toContainText("Det går inte att ångra.");
  await expect(question(page).getByRole("button", { name: "Avbryt" })).toBeFocused();
  await question(page).getByRole("button", { name: "Avbryt" }).click();
  await expect(photoSheet(page)).toBeVisible();

  await photoSheet(page).getByRole("button", { name: "Ta bort fotot" }).click();
  await question(page).getByRole("button", { name: "Ta bort", exact: true }).click();
  await expect(page.getByTestId("toast")).toContainText("Tog bort fotot av kylen.");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(line(page)).toHaveCount(0);
  await expect(camera(page).getByRole("button", { name: "Fotografera kylen" })).toBeFocused();

  const rows = await adminClient().from("pantry_photo").select("id").eq("user_id", userId);
  if (rows.error) throw rows.error;
  expect(rows.data.map((row) => row.id)).not.toContain(photos.hemmaKyl.id);
  const download = await adminClient().storage.from(placePhotoBucket).download(photos.hemmaKyl.path);
  expect(download.data).toBeNull();
  // Read again, Matvaror has no line for the fridge.
  await page.reload();
  await expect(boendeButton(page)).toBeEnabled();
  await expect(line(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a photo removed elsewhere says it is gone", async ({ page }) => {
  await openLagersaldo(page);
  await expect(line(page)).toBeVisible();
  // Another device removes the photo.
  const removed = await adminClient().from("pantry_photo").delete().eq("id", photos.hemmaKyl.id);
  if (removed.error) throw removed.error;
  await adminClient().storage.from(placePhotoBucket).remove([photos.hemmaKyl.path]);

  await visa(page).click();
  await expect(photoSheet(page).getByText("Fotot finns inte längre.")).toBeVisible();
  await expect(markers(page)).toHaveCount(0);
  // The page is read again, so the dead line goes.
  await expect(line(page)).toHaveCount(0);
});
