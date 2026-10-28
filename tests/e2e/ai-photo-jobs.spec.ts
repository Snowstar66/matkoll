import { expect, type Page, test } from "@playwright/test";
import {
  adminClient,
  aiPhotoEmail,
  aiPhotoStorageState,
  cardTitles,
  e2eUserId,
  placePhotoBucket,
  plainPng,
  removePlacePhotos,
} from "./support";

// Story 12.5: the photo of a place is an AI job (AI_PROVIDER=mock, and
// AI_MOCK_DELAY_MS=3000 from playwright.config.ts). The mock keeps a photo it
// does not know waiting 3 s for the reading and 3 s more for the numbers, so
// a plain PNG (plainPng) gets the default answer, the same as kyl.png (six items,
// kyl.analyze.json, a point on each, kyl.locate.json), and can be seen in the
// queue. The spec has an E2E user of its own (aiPhotoEmail): before each test
// its AI jobs, photos and pantry are removed and its catalog is made, so a
// photo of the fridge gives the plain list of six cards. The tests run in
// order, since they share the user.

const titles = ["Vispgrädde 3 dl", "Gurka", "Ketchup", "Smör 500 g", "Ägg", "Mellanmjölk 1,5 %"];

test.use({ storageState: aiPhotoStorageState, viewport: { width: 375, height: 812 } });
test.describe.configure({ mode: "serial" });

let userId = "";

test.beforeAll(async () => {
  userId = await e2eUserId(aiPhotoEmail);
});

test.afterAll(async () => {
  await removePlacePhotos(userId);
});

test.beforeEach(async () => {
  const admin = adminClient();
  await removePlacePhotos(userId);
  for (const table of ["ai_job", "pantry_photo", "pantry_item"] as const) {
    const removed = await admin.from(table).delete().eq("user_id", userId);
    if (removed.error) throw removed.error;
  }
});

type JobRow = { kind: string; status: string; context: Record<string, unknown>; result: unknown };
/** The user's AI jobs, oldest first, read by the service role. */
async function jobs(): Promise<JobRow[]> {
  const { data, error } = await adminClient()
    .from("ai_job")
    .select("kind, status, context, result")
    .eq("user_id", userId)
    .order("created_at");
  if (error) throw error;
  return data as JobRow[];
}

// Earlier routes stay mounted but hidden after a client navigation, so every locator is scoped to what is visible.
const camera = (page: Page) => page.getByTestId("pantry-camera").filter({ visible: true });
const section = (page: Page) => page.getByTestId("pantry-suggestions").filter({ visible: true });
const cards = (page: Page) => section(page).getByTestId("pantry-suggestion");
const locationCard = (page: Page, name: "Kyl" | "Frys" | "Skafferi") =>
  page.getByRole("navigation", { name: "Platser" }).getByRole("link", { name: new RegExp(`^${name}`) });
const nav = (page: Page) => page.getByRole("navigation", { name: "Huvudmeny" }).filter({ visible: true });
const toast = (page: Page) => page.getByTestId("toast");
const jobRow = (page: Page) => page.getByTestId("ai-job-row").filter({ visible: true });

async function photograph(page: Page, button: string, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  const chooser = page.waitForEvent("filechooser");
  await camera(page).getByRole("button", { name: button }).click();
  await (await chooser).setFiles(file);
}

/** The reading takes 3 s, the numbers 3 s more, and the page reads the jobs every 2 s. */
const longWait = { timeout: 25_000 };

test("the fridge and the freezer one after the other: the queue is seen, the result waits in Recept, and the fridge's numbers are confirmed", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/hemma");

  // The fridge is read in the background: the page is free at once.
  await photograph(page, "Fotografera kylen", plainPng(1));
  await expect(camera(page).getByText("Tittar på bilden … Du kan göra annat under tiden.")).toBeVisible();
  await expect(camera(page).getByRole("button", { name: "Avbryt" })).toBeVisible();

  // Another place can be photographed straight away; its job waits behind the fridge's.
  await locationCard(page, "Frys").click();
  await photograph(page, "Fotografera frysen", plainPng(2));
  await expect(camera(page).getByText("I kö, 1 före.")).toBeVisible();
  await expect(jobRow(page)).toContainText("1 i kö");
  await locationCard(page, "Kyl").click();
  await expect(camera(page).getByText("Tittar på bilden … Du kan göra annat under tiden.")).toBeVisible();

  // Leave Lagersaldo: the fridge's cards come while Pontus is in Recept, with a confirmation and a badge.
  await nav(page).getByRole("link", { name: "Recept" }).click();
  await expect(page).toHaveURL(/\/recept$/);
  await expect(toast(page)).toContainText("förslag från fotot av kylen är klara.", longWait);
  await expect(nav(page).getByTestId("tab-badge")).toHaveText("1");

  // Visa: Lagersaldo on the fridge, with the cards and the numbers on them (the photo is still in the tab's memory).
  await toast(page).getByRole("button", { name: "Visa" }).click();
  await expect(page).toHaveURL(/\/hemma\?plats=kyl$/);
  await expect(cards(page)).toHaveCount(6);
  await expect(section(page).getByRole("heading", { level: 3 }).first()).toHaveText(cardTitles([titles[0]]));
  await expect(section(page).getByTestId("pantry-photo-number")).toHaveCount(6, longWait);

  // The freezer's cards wait for these: its card says so.
  await expect(locationCard(page, "Frys")).toContainText("Förslag klara", longWait);

  const before = await adminClient().from("pantry_item").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (before.error) throw before.error;
  expect(before.count).toBe(0);
  await section(page).getByRole("button", { name: "Bekräfta alla" }).click();
  // The fridge's cards are all handled: the freezer's result, which waited, takes their place.
  await expect(section(page).getByRole("heading", { level: 2 })).toHaveText("Lagerförslag från frysen", { timeout: 10_000 });
  await expect(cards(page)).toHaveCount(6);

  // The fridge's job is closed, its photo is saved as the latest of the fridge, and the pantry has the six items.
  await expect.poll(async () => (await jobs()).filter((job) => job.status === "done").length).toBe(1);
  const pantry = await adminClient().from("pantry_item").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (pantry.error) throw pantry.error;
  expect(pantry.count).toBe(6);
  await expect
    .poll(async () => {
      const { data, error } = await adminClient().from("pantry_photo").select("location").eq("user_id", userId);
      if (error) throw error;
      return (data as { location: string }[]).map((row) => row.location);
    })
    .toEqual(["Kyl"]);
  expect(errors).toEqual([]);
});

test("a new photo of the fridge replaces the one before: the first is replaced, and never shown", async ({ page }) => {
  await page.goto("/hemma");
  await photograph(page, "Fotografera kylen", plainPng(1));
  await expect(camera(page).getByText("Tittar på bilden …")).toBeVisible();
  await expect.poll(async () => (await jobs()).map((job) => job.status)).toEqual(["running"]);

  // The photo is taken again, from another tab or device, while the first is still being read.
  const site = await adminClient().from("pantry_site").select("id").eq("user_id", userId).eq("is_selected", true).single();
  if (site.error) throw site.error;
  const second = await page.request.post("/api/ai/jobs/photo", {
    multipart: {
      image: plainPng(3),
      kind: "analyze",
      clientKey: crypto.randomUUID(),
      location: "Kyl",
      site: (site.data as { id: string }).id,
      takenAt: new Date().toISOString(),
    },
  });
  expect(second.status()).toBe(202);
  // The first is replaced at once; the new one waits for its turn or has it already.
  await expect.poll(async () => (await jobs()).map((job) => job.status).includes("superseded")).toBe(true);
  expect(await jobs()).toHaveLength(2);

  await expect(cards(page)).toHaveCount(6, longWait);
  await expect.poll(async () => (await jobs()).map((job) => job.status).sort(), longWait).toEqual(["done", "superseded"]);
  // Only one result was ever shown.
  await expect(section(page)).toHaveCount(1);
  await page.waitForTimeout(3_000);
  await expect(cards(page)).toHaveCount(6);
});

test("the jobs keep only the place, the location and the time, and the photo is nowhere on the server", async ({ page }) => {
  await page.goto("/hemma");
  await photograph(page, "Fotografera kylen", plainPng(4));
  await expect(cards(page)).toHaveCount(6, longWait);
  await expect.poll(async () => (await jobs()).map((job) => job.status), longWait).toEqual(["done"]);

  const [row] = await jobs();
  expect(Object.keys(row.context).sort()).toEqual(["location", "siteId", "takenAt"]);
  expect(JSON.stringify(row.result)).not.toContain("iVBOR");
  // Nothing was saved as a photo: nothing was confirmed.
  const files = await adminClient().storage.from(placePhotoBucket).list(userId);
  expect(files.data ?? []).toEqual([]);
});

test("a photo as a job survives a reload: the cards come back, without the photo, and no latest photo is saved", async ({ page }) => {
  await page.goto("/hemma");
  await photograph(page, "Fotografera kylen", plainPng(5));
  // The page is reloaded while the fridge is read.
  await expect.poll(async () => (await jobs()).map((job) => job.status)).toEqual(["running"]);
  await page.reload();

  await expect(cards(page)).toHaveCount(6, longWait);
  await expect(section(page).getByText("Fotot finns inte kvar efter omladdningen.")).toBeVisible();
  await expect(section(page).getByRole("button", { name: /Fotot av kylen/ })).toHaveCount(0);
  await section(page).getByRole("button", { name: "Bekräfta Gurka" }).click();
  await expect(cards(page)).toHaveCount(5);
  // The photo was only in the tab's memory: there is none to save as the latest.
  await page.waitForTimeout(1_000);
  const saved = await adminClient().from("pantry_photo").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (saved.error) throw saved.error;
  expect(saved.count).toBe(0);
});
