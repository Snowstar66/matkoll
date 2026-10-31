import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { shortDateText } from "@/features/things";
import { adminClient, e2eUserId, thingsEmail, thingsStorageState } from "./support";

// Prylar (Epic 18, Stories 18.1 to 18.12) with AI_PROVIDER=mock and
// AI_MOCK_DELAY_MS=3000 from playwright.config.ts: any photo gets the mock's
// things (tests/fixtures/ai/skrapforrad.things.json, twelve things in six
// categories, one a guess, and three closed containers) after 3 s; the
// reserved images give their error codes. The spec has an E2E user of its own
// (thingsEmail): before each test its things, places, AI jobs and boenden are
// removed with the service role (and the card files), and Hemma (selected) is
// made. The tests run in order, since they share the user.

const photo = "tests/fixtures/ai/kyl.png";
const failing = "tests/fixtures/ai/reserved-ai_unavailable.png";

test.use({ storageState: thingsStorageState, viewport: { width: 390, height: 844 } });
test.describe.configure({ mode: "serial" });

let userId = "";
let hemma = "";

test.beforeAll(async () => {
  userId = await e2eUserId(thingsEmail);
});

async function removeCardFiles(): Promise<void> {
  const admin = adminClient();
  const { data } = await admin.from("thing_photo").select("object_path").eq("user_id", userId);
  const paths = (data ?? []).map((row) => (row as { object_path: string }).object_path);
  if (paths.length > 0) await admin.storage.from("thing-photo").remove(paths);
}

test.afterAll(removeCardFiles);

test.beforeEach(async () => {
  const admin = adminClient();
  await removeCardFiles();
  for (const table of ["ai_job", "ai_usage", "thing_place", "pantry_site"] as const) {
    const removed = await admin.from(table).delete().eq("user_id", userId);
    if (removed.error) throw removed.error;
  }
  const added = await admin
    .from("pantry_site")
    .insert({ user_id: userId, name: "Hemma", normalized_name: "hemma", is_selected: true })
    .select("id")
    .single();
  if (added.error) throw added.error;
  hemma = added.data.id;
});

const nav = (page: Page) => page.getByRole("navigation", { name: "Huvudmeny" }).filter({ visible: true });
const content = (page: Page) => page.locator("main").filter({ visible: true });

/** "Ta kort" or "Ta fler kort": the sheet, the room (an existing one, or a new one by name) and the images chosen in the picker. */
async function takeCards(page: Page, files: string | string[], { room, part, box = false, opener = /^Ta (fler )?kort$/ }: { room?: string; part?: string; box?: boolean; opener?: RegExp } = {}) {
  await page.getByRole("button", { name: opener }).filter({ visible: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Var tar du kortet?" });
  if (room) {
    const existing = dialog.getByRole("radio", { name: room, exact: true });
    if (await existing.count()) await existing.click();
    else {
      await dialog.getByRole("radio", { name: "+ Nytt rum" }).click();
      await dialog.getByLabel("Nytt rum").fill(room);
    }
  }
  if (part) {
    await dialog.getByRole("button", { name: /Mer exakt plats/ }).click();
    if (box) await dialog.getByRole("radio", { name: "Låda" }).click();
    await dialog.getByLabel(box ? "Namn på lådan" : "Del av rummet").fill(part);
  }
  const chooser = page.waitForEvent("filechooser");
  await dialog.getByRole("button", { name: "Välj bilder …" }).click();
  await (await chooser).setFiles(files);
}

const rooms = (page: Page) => page.getByTestId("room-row");
const cardsOf = async () => (await adminClient().from("thing_photo").select("id, status, place_id, object_path, replaces_photo_id").eq("user_id", userId)).data ?? [];

test("the fifth tab is Förråd with the toolbox, in the tab bar", async ({ page }) => {
  await page.goto("/prylar");
  const links = nav(page).getByRole("link");
  await expect(links).toHaveText(["📖Recept", "📅Matsedel", "🛒Inköpslista", "🥕Matvaror", "🧰Förråd"]);
  await expect(nav(page).getByRole("link", { name: "Förråd" })).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveTitle(/Förråd/);
});

test("without rooms it explains, and Ta kort is the first row; Ny plats is gone", async ({ page }) => {
  await page.goto("/prylar");
  await expect(page.getByText("Fotografera en hylla eller ett förråd, så listar Matkoll vad som finns där.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ta kort" })).toBeVisible();
  await expect(page.getByText("Fota ett rum, en hylla eller en låda")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ny plats" })).toHaveCount(0);
  // One boende: no pills.
  await expect(page.getByRole("radiogroup", { name: "Boende" })).toHaveCount(0);
});

test("Ta kort asks where, folds out the exact place, and says an empty room", async ({ page }) => {
  await page.goto("/prylar");
  await page.getByRole("button", { name: "Ta kort" }).click();
  const dialog = page.getByRole("dialog", { name: "Var tar du kortet?" });
  await expect(dialog.getByRole("radio", { name: "+ Nytt rum" })).toBeChecked();
  await expect(dialog.getByRole("button", { name: /Mer exakt plats \(valfritt\)/ })).toHaveAttribute("aria-expanded", "false");
  await expect(dialog.getByLabel("Del av rummet")).toBeHidden();
  await dialog.getByRole("button", { name: /Mer exakt plats/ }).click();
  await expect(dialog.getByLabel("Del av rummet")).toBeVisible();
  await expect(dialog.getByRole("radio", { name: "Del" })).toBeChecked();
  // No camera button on a desktop; the picker takes several images.
  await expect(dialog.getByRole("button", { name: /Öppna kameran/ })).toHaveCount(0);
  await expect(page.locator("input[type=file][multiple]")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Välj bilder …" }).click();
  await expect(dialog.getByText("Ange ett rum, till exempel Skräpförrådet.")).toBeVisible();
});

test("a photo taken first lands in the room's whole room, is read in the background, and the room says what it holds", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/prylar");
  await takeCards(page, photo, { room: "Skräpförrådet" });
  await expect(page.getByText(/Skickar kortet|Kortet läses i bakgrunden\./)).toBeVisible();

  // The room is made with a place without a part ("Hela rummet"); the reading runs in the background.
  await expect(rooms(page)).toHaveText([/Skräpförrådet\s*Tittar på kortet …|Skräpförrådet\s*12 prylar · 1 kort/], { timeout: 25_000 });
  await expect(rooms(page)).toContainText(`12 prylar · 1 kort · ${shortDateText(new Date())}`, { timeout: 25_000 });
  await expect(page.getByTestId("rooms-total")).toHaveText("1 rum · 12 prylar");
  const places = (await adminClient().from("thing_place").select("room, part, part_key, kind").eq("user_id", userId)).data;
  expect(places).toEqual([{ room: "Skräpförrådet", part: null, part_key: "", kind: "part" }]);

  await rooms(page).click();
  await expect(page).toHaveURL(/\/prylar\/rum\//);
  await expect(page).toHaveURL(new RegExp(`/prylar/rum/${hemma}/skr%C3%A4pf%C3%B6rr%C3%A5det$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Skräpförrådet");
  const summary = page.getByTestId("room-summary");
  await expect(summary).toContainText("12prylar");
  await expect(summary).toContainText("7kategorier");
  await expect(summary).toContainText("1kort");
  await expect(page.getByText(`Senaste kort ${shortDateText(new Date())}`)).toBeVisible();

  // The categories are folded in with their counts; a category's rows come only when it is opened.
  await expect(page.getByTestId("room-category")).toHaveCount(7);
  await expect(page.getByRole("button", { name: "Verktyg · 4" })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("thing")).toHaveCount(0);
  await page.getByRole("button", { name: "Verktyg · 4" }).click();
  await expect(page.getByTestId("thing")).toHaveCount(4);
  await expect(page.getByTestId("thing").filter({ hasText: "Hammare" })).toContainText("på väggen, mitten");
  // A guess says kanske, and only a guess.
  await page.getByRole("button", { name: "Hushåll · 1" }).click();
  await expect(page.getByText("kanske · överst, höger")).toBeVisible();
  await expect(page.getByText(/kanske/)).toHaveCount(1);
  await expect(page.getByTestId("unseen-note")).toHaveText("Innehållet i 3 lådor syns inte – fota insidan");

  // What is open is remembered on the device.
  await page.reload();
  await expect(page.getByRole("button", { name: "Verktyg · 4" })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Trädgård · 2" })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("thing").filter({ hasText: "Hammare" })).toBeVisible();

  // The Kort view: the card as a thumbnail with what it shows, its things and date.
  await page.getByRole("radio", { name: "Kort" }).click();
  const card = page.getByTestId("room-card");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Hela rummet");
  await expect(card).toContainText(`12 prylar · ${shortDateText(new Date())}`);
  await expect(card.getByRole("img")).toBeVisible();
  await expect(card.getByRole("button", { name: /^Ta om/ })).toBeVisible();
  await expect(card.getByRole("button", { name: /^Ta bort/ })).toBeVisible();

  // The photo is private: the route gives it to its owner, with no cache; the file is in the user's own folder.
  const photoId = (await card.getByRole("img").getAttribute("src"))!.split("/").pop()!;
  const image = await page.request.get(`/api/things/photo/${photoId}`);
  expect(image.status()).toBe(200);
  expect(image.headers()["cache-control"]).toContain("no-store");
  const stored = await adminClient().from("thing_photo").select("object_path, status").eq("id", photoId).single();
  expect(stored.data?.status).toBe("done");
  expect(stored.data?.object_path.startsWith(`${userId}/`)).toBe(true);
  expect((await adminClient().storage.from("thing-photo").download(stored.data!.object_path)).error).toBeNull();
  const anonymous = await page.context().browser()!.newContext({ baseURL: "http://localhost:3100", storageState: { cookies: [], origins: [] } });
  expect((await anonymous.request.get(`/api/things/photo/${photoId}`)).status()).toBe(401);
  await anonymous.close();

  // Prylar never touch the food: nothing in the pantry or the lists.
  const pantry = await adminClient().from("pantry_item").select("id", { count: "exact", head: true }).eq("user_id", userId);
  expect(pantry.count).toBe(0);
  expect(errors).toEqual([]);
});

test("several images at once are each a card, and a part or a box makes a place of its own", async ({ page }) => {
  await page.goto("/prylar");
  await takeCards(page, [photo, photo], { room: "Garaget", part: "Väggen" });
  await expect.poll(async () => (await cardsOf()).length, { timeout: 25_000 }).toBe(2);
  await expect.poll(async () => (await cardsOf()).filter((card) => card.status === "done").length, { timeout: 30_000 }).toBe(2);
  const jobs = await adminClient().from("ai_job").select("kind").eq("user_id", userId);
  expect(jobs.data).toEqual([{ kind: "things" }, { kind: "things" }]);
  expect(new Set((await cardsOf()).map((card) => card.place_id)).size).toBe(1);

  await takeCards(page, photo, { room: "Garaget", part: "Black box", box: true });
  await expect.poll(async () => (await cardsOf()).length, { timeout: 25_000 }).toBe(3);
  const places = (await adminClient().from("thing_place").select("part, kind").eq("user_id", userId).order("created_at")).data;
  expect(places).toEqual([{ part: "Väggen", kind: "part" }, { part: "Black box", kind: "box" }]);
  await expect.poll(async () => (await cardsOf()).filter((card) => card.status === "done").length, { timeout: 30_000 }).toBe(3);
});

test("a new card adds to the room and replaces nothing; Ta om replaces only that card once the new one is read", async ({ page }) => {
  await page.goto("/prylar");
  await takeCards(page, photo, { room: "Garaget" });
  await expect.poll(async () => (await cardsOf()).filter((card) => card.status === "done").length, { timeout: 25_000 }).toBe(1);
  await page.reload();
  await rooms(page).click();
  await expect(page).toHaveURL(/\/prylar\/rum\//);
  await takeCards(page, photo);
  await expect.poll(async () => (await cardsOf()).filter((card) => card.status === "done").length, { timeout: 25_000 }).toBe(2);
  const before = await cardsOf();
  expect(before).toHaveLength(2);
  expect(before.every((card) => card.replaces_photo_id === null)).toBe(true);

  await page.reload();
  await page.getByRole("radio", { name: "Kort" }).click();
  await expect(page.getByTestId("room-card")).toHaveCount(2);
  const [oldest] = (await adminClient().from("thing_photo").select("id, object_path").eq("user_id", userId).order("taken_at")).data!;
  const kept = before.find((card) => card.id !== oldest.id)!;

  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("room-card").first().getByRole("button", { name: /^Ta om/ }).click();
  await (await chooser).setFiles(photo);
  // The new card is read first: until then both old cards are there.
  await expect.poll(async () => (await cardsOf()).length, { timeout: 15_000 }).toBe(3);
  await expect(page.getByTestId("room-card").filter({ hasText: "Tittar på kortet" })).toHaveCount(1);
  // The new card is read: the replaced one goes, so two cards remain, all done.
  await expect.poll(async () => (await cardsOf()).map((card) => card.status).join(), { timeout: 30_000 }).toBe("done,done");
  const after = await cardsOf();
  expect(after).toHaveLength(2);
  const replacedId = (await adminClient().from("thing_photo").select("replaces_photo_id").eq("user_id", userId).not("replaces_photo_id", "is", null)).data;
  expect(replacedId?.length ?? 0).toBeLessThanOrEqual(1);
  // Exactly one of the two old cards is gone, with its things and its file; the other is untouched.
  const ids = after.map((card) => card.id);
  expect(ids.filter((id) => [oldest.id, kept.id].includes(id))).toHaveLength(1);
  const goneId = [oldest.id, kept.id].find((id) => !ids.includes(id))!;
  expect((await adminClient().from("thing_item").select("id").eq("photo_id", goneId)).data).toHaveLength(0);
  await expect(page.getByTestId("room-card")).toHaveCount(2);
});

test("a reading that does not go leaves the card with a calm notice and Försök igen", async ({ page }) => {
  await page.goto("/prylar");
  await takeCards(page, failing, { room: "Vinden" });
  await expect.poll(async () => (await cardsOf())[0]?.status, { timeout: 25_000 }).toBe("failed");
  // The card is kept, failed, with its file; nothing was listed.
  const cards = await adminClient().from("thing_photo").select("status, error_code, object_path").eq("user_id", userId);
  expect(cards.data).toMatchObject([{ status: "failed", error_code: "ai_unavailable" }]);
  expect((await adminClient().storage.from("thing-photo").download(cards.data![0].object_path)).error).toBeNull();

  await page.reload();
  await rooms(page).click();
  await expect(page).toHaveURL(/\/prylar\/rum\//);
  await page.getByRole("radio", { name: "Kort" }).click();
  const card = page.getByTestId("room-card");
  await expect(card).toContainText("Kunde inte läsas");
  await expect(card).toContainText("Det ligger kvar");
  // "Försök igen" reads the stored photo again (the mock fails the same photo the same way).
  await card.getByRole("button", { name: "Försök igen" }).click();
  await expect.poll(async () => (await adminClient().from("ai_job").select("kind").eq("user_id", userId)).data?.length, { timeout: 15_000 }).toBe(2);
  await expect.poll(async () => (await cardsOf())[0]?.status, { timeout: 25_000 }).toBe("failed");
  const jobs = await adminClient().from("ai_job").select("kind, status").eq("user_id", userId).order("created_at");
  expect(jobs.data?.map((job) => job.kind)).toEqual(["things", "things"]);
});

test("a finished reading is confirmed while Pontus is in another tab, with a badge and Visa", async ({ page }) => {
  await page.goto("/prylar");
  await takeCards(page, photo, { room: "Boden" });
  await expect(page.getByText(/Skickar kortet|Kortet läses i bakgrunden\./)).toBeVisible();
  await nav(page).getByRole("link", { name: "Recept" }).click();
  await expect(page).toHaveURL(/\/recept$/);
  await expect(page.getByTestId("toast")).toContainText("12 prylar är listade.", { timeout: 25_000 });
  await expect(nav(page).getByTestId("tab-badge")).toHaveText("1");
  await page.getByTestId("toast").getByRole("button", { name: "Visa" }).click();
  // The old place address opens the room the place is in.
  await expect(page).toHaveURL(/\/prylar\/rum\/[0-9a-f-]{36}\/boden$/);
  await expect(page.getByTestId("room-summary")).toContainText("12prylar");
  // Seen here: the badge goes.
  await expect(nav(page).getByTestId("tab-badge")).toHaveCount(0);
});

test("the side menu at desktop width has Förråd too, and the start page and a room read well", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/prylar");
  await expect(nav(page).getByRole("link", { name: "Förråd" })).toHaveAttribute("aria-current", "page");
  await expect(content(page)).toBeVisible();
});

/** A place with a finished card and things, written with the service role (no file: the page's thumbnail is not under test). */
async function seedPlace(
  siteId: string,
  room: string,
  names: { name: string; category: string; where?: string }[],
  { part = null, takenAt = "2026-10-31T10:00:00Z", hidden = 0, box = false }: { part?: string | null; takenAt?: string; hidden?: number; box?: boolean } = {},
): Promise<string> {
  const admin = adminClient();
  const place = await admin
    .from("thing_place")
    .insert({ user_id: userId, site_id: siteId, room, part, room_key: room.toLowerCase(), part_key: part ? (box ? "box:" : "") + part.toLowerCase() : "" })
    .select("id")
    .single();
  if (place.error) throw place.error;
  const cardId = randomUUID();
  const card = await admin.from("thing_photo").insert({
    id: cardId,
    user_id: userId,
    place_id: place.data.id,
    object_path: `${userId}/${place.data.id}/${cardId}.png`,
    media_type: "image/png",
    width: 10,
    height: 10,
    taken_at: takenAt,
    status: "done",
    unseen_count: hidden,
  });
  if (card.error) throw card.error;
  const items = await admin.from("thing_item").insert(
    names.map((thing, position) => ({
      user_id: userId,
      photo_id: cardId,
      place_id: place.data.id,
      name: thing.name,
      category: thing.category,
      where_hint: thing.where ?? null,
      confidence: "high",
      position,
    })),
  );
  if (items.error) throw items.error;
  return place.data.id;
}

const roomUrl = (room: string) => `/prylar/rum/${hemma}/${encodeURIComponent(room.toLowerCase())}`;

test("Ta bort kortet asks first, removes card, things and file, and Ångra brings the card back for a short while", async ({ page }) => {
  await page.goto("/prylar");
  await takeCards(page, photo, { room: "Garaget" });
  await expect.poll(async () => (await cardsOf())[0]?.status, { timeout: 25_000 }).toBe("done");
  await page.goto(roomUrl("Garaget"));
  await page.getByRole("radio", { name: "Kort" }).click();
  const cards = page.getByTestId("room-card");
  const admin = adminClient();
  const path = (await admin.from("thing_photo").select("object_path").eq("user_id", userId).single()).data!.object_path;
  const fileExists = async () => (await admin.storage.from("thing-photo").download(path)).error === null;

  // The question comes first; "Avbryt" leaves everything.
  await cards.getByRole("button", { name: /^Ta bort kortet/ }).click();
  const dialog = page.getByRole("dialog", { name: "Ta bort kortet" });
  await expect(dialog.getByText("Ta bort kortet?")).toBeVisible();
  await dialog.getByRole("button", { name: "Avbryt" }).click();
  await expect(cards).toHaveCount(1);
  expect((await admin.from("thing_photo").select("id").eq("user_id", userId)).data).toHaveLength(1);

  await cards.getByRole("button", { name: /^Ta bort kortet/ }).click();
  await dialog.getByRole("button", { name: "Ta bort kortet" }).click();
  await expect(page.getByTestId("toast")).toContainText("Tog bort kortet från");
  await expect(cards).toHaveCount(0);
  expect((await admin.from("thing_photo").select("id").eq("user_id", userId)).data).toHaveLength(0);
  expect((await admin.from("thing_item").select("id").eq("user_id", userId)).data).toHaveLength(0);
  // The file waits for Ångra.
  expect(await fileExists()).toBe(true);

  await page.getByTestId("toast").getByRole("button", { name: "Ångra" }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText("12 prylar");
  expect(await fileExists()).toBe(true);

  // Without Ångra the file goes when the time is out.
  await cards.getByRole("button", { name: /^Ta bort kortet/ }).click();
  await dialog.getByRole("button", { name: "Ta bort kortet" }).click();
  await expect(cards).toHaveCount(0);
  await expect.poll(fileExists, { timeout: 15_000 }).toBe(false);
  expect((await admin.from("thing_photo").select("id").eq("user_id", userId)).data).toHaveLength(0);
});

test("a thing the AI got wrong is renamed or removed alone, with Ångra, and the card stays as it was", async ({ page }) => {
  const place = await seedPlace(hemma, "Skräpförrådet", [
    { name: "Hammare", category: "Verktyg", where: "på väggen" },
    { name: "Spade", category: "Trädgård" },
  ]);
  const admin = adminClient();
  const cardBefore = (await admin.from("thing_photo").select("id, taken_at, created_at").eq("place_id", place).single()).data!;
  await page.goto(roomUrl("Skräpförrådet"));
  await page.getByRole("button", { name: "Verktyg · 1" }).click();
  await page.getByRole("button", { name: "Trädgård · 1" }).click();
  const things = page.getByTestId("thing");

  await page.getByRole("button", { name: /Hammare/ }).click();
  const sheet = page.getByRole("dialog", { name: "Pryl" });
  await sheet.getByLabel("Byt namn").fill("Klohammare");
  await sheet.getByRole("button", { name: "Spara" }).click();
  await expect(things.first()).toContainText("Klohammare");
  await expect(page.getByText("Hammare", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: /Spade/ }).click();
  await sheet.getByRole("button", { name: "Ta bort pryl" }).click();
  await expect(page.getByTestId("toast")).toContainText("Tog bort Spade.");
  await expect(things).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Trädgård/ })).toHaveCount(0);
  await page.getByTestId("toast").getByRole("button", { name: "Ångra" }).click();
  await expect(page.getByRole("button", { name: "Trädgård · 1" })).toBeVisible();
  await expect(things).toHaveCount(2);

  // The card, with its date, is untouched.
  const cardAfter = (await admin.from("thing_photo").select("id, taken_at, created_at").eq("place_id", place).single()).data!;
  expect(cardAfter).toEqual(cardBefore);
});

test("search finds a thing in every room and boende, and the chat answers a question with a card to tap", async ({ page }) => {
  const stugan = await adminClient()
    .from("pantry_site")
    .insert({ user_id: userId, name: "Stugan", normalized_name: "stugan", is_selected: false })
    .select("id")
    .single();
  if (stugan.error) throw stugan.error;
  await seedPlace(hemma, "Skräpförrådet", [{ name: "Hammare", category: "Verktyg", where: "väggen" }, { name: "Spade", category: "Trädgård" }], { hidden: 2 });
  await seedPlace(stugan.data.id, "Redskapsboden", [{ name: "Målarfärgsburkar", category: "Byggmaterial" }, { name: "Kratta", category: "Trädgård" }], {
    takenAt: "2026-09-02T10:00:00Z",
  });

  await page.goto("/prylar");
  // The rooms of the selected boende, counted.
  await expect(rooms(page)).toHaveText([/Skräpförrådet\s*2 prylar · 1 kort · 31 okt/]);
  await expect(page.getByTestId("rooms-total")).toHaveText("1 rum · 2 prylar");
  // The database searches: the hit says place, boende and the card's day, from every boende, and a typo is fine.
  const search = page.getByRole("searchbox", { name: "Sök bland prylar" });
  await search.fill("hamm");
  await expect(page.getByTestId("thing-hit")).toHaveText([/Hammare\s*Skräpförrådet, väggen · Hemma · 31 okt/]);
  await expect(rooms(page)).toBeHidden();
  await search.fill("kratta");
  await expect(page.getByTestId("thing-hit")).toHaveText([/Kratta\s*Redskapsboden · Stugan · 2 sep/]);
  await search.fill("kratha");
  await expect(page.getByTestId("thing-hit")).toHaveText([/Kratta\s*Redskapsboden · Stugan · 2 sep/]);
  await search.fill("inget");
  await expect(page.getByText('Inga prylar matchar "inget".')).toBeVisible();
  await page.getByRole("button", { name: "Rensa sökning" }).click();
  await expect(rooms(page)).toBeVisible();

  // The chat sits under "Ta kort": the question goes to the AI for search terms (the mock here), the database finds the things, and the AI answers from those only.
  const chat = page.getByTestId("chat");
  await chat.getByRole("textbox", { name: "Fråga om ditt förråd" }).fill("Har vi något att måla med?");
  await chat.getByRole("button", { name: "Skicka" }).click();
  await expect(page.getByTestId("chat-question")).toHaveText("Har vi något att måla med?");
  await expect(page.getByTestId("chat-answer")).toContainText("Målarfärgsburkar finns i Redskapsboden (Stugan).");
  const ref = page.getByTestId("chat-ref");
  await expect(ref).toContainText("Redskapsboden");
  await expect(ref).toContainText("Kort från 2 sep");
  await expect(ref.locator("img")).toHaveAttribute("src", /\/api\/things\/photo\/[0-9a-f-]{36}$/);
  // Story 17.6: both calls (the terms and the answer) were recorded (the mock: model and no tokens, no cost).
  const usage = await adminClient().from("ai_usage").select("model, input_tokens, output_tokens").eq("user_id", userId);
  expect(usage.data).toEqual([
    { model: "mock", input_tokens: 0, output_tokens: 0 },
    { model: "mock", input_tokens: 0, output_tokens: 0 },
  ]);
  // A follow-up in the same conversation, and nothing found: the closed containers are named.
  await chat.getByRole("textbox", { name: "Fråga om ditt förråd" }).fill("och cykelpumpen då?");
  await chat.getByRole("button", { name: "Skicka" }).click();
  await expect(page.getByTestId("chat-answer").nth(1)).toContainText("Jag hittar inget som passar i dina listor. Innehållet i 2 lådor syns inte");
  // "Ny fråga" clears the conversation.
  await chat.getByRole("button", { name: "Ny fråga" }).click();
  await expect(page.getByTestId("chat-turn")).toHaveCount(0);
  await chat.getByRole("textbox", { name: "Fråga om ditt förråd" }).fill("Har vi något att måla med?");
  await chat.getByRole("button", { name: "Skicka" }).click();
  // The card opens the room (the old place address redirects), also in another boende.
  await page.getByTestId("chat-ref").click();
  await expect(page).toHaveURL(new RegExp(`/prylar/rum/${stugan.data.id}/redskapsboden$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Redskapsboden");
});

test("old place addresses open the room, and an unknown one is 'Sidan finns inte.'", async ({ page }) => {
  const place = await seedPlace(hemma, "Skräpförrådet", [{ name: "Hammare", category: "Verktyg" }]);
  await page.goto(`/prylar/${place}`);
  await expect(page).toHaveURL(new RegExp(`/prylar/rum/${hemma}/skr%C3%A4pf%C3%B6rr%C3%A5det$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Skräpförrådet");
  await page.goto(`/prylar/${randomUUID()}`);
  await expect(page.getByText("Sidan finns inte.")).toBeVisible();
  await page.goto(roomUrl("Finns inte"));
  await expect(page.getByText("Sidan finns inte.")).toBeVisible();
});

test("a box is added from the line about closed boxes, and its things are 'i Kartong jul' in the room's list and in search", async ({ page }) => {
  await seedPlace(hemma, "Skräpförrådet", [{ name: "Hammare", category: "Verktyg" }], { hidden: 3 });
  await page.goto(roomUrl("Skräpförrådet"));
  await page.getByRole("button", { name: "Innehållet i 3 lådor syns inte – fota insidan" }).click();
  const sheet = page.getByRole("dialog", { name: "Lägg till låda" });
  await sheet.getByRole("button", { name: "Lägg till och fota" }).click();
  await expect(sheet.getByText("Ange ett namn, till exempel Blå backen.")).toBeVisible();
  await sheet.getByLabel("Namn på lådan").fill("Blå backen");
  await sheet.getByRole("button", { name: "Lägg till och fota" }).click();
  await expect(page).toHaveURL(/\/prylar\/rum\/[0-9a-f-]{36}\/skr%C3%A4pf%C3%B6rr%C3%A5det\?fota=[0-9a-f-]{36}$/);
  await expect(page.getByTestId("upload-card-row")).toContainText("Fota insidan av Blå backen");
  const box = (await adminClient().from("thing_place").select("room, part, part_key").eq("user_id", userId).eq("part", "Blå backen").single()).data!;
  expect(box).toEqual({ room: "Skräpförrådet", part: "Blå backen", part_key: "box:blå backen" });

  // A box with a card: its things say where they are, in the room's list, on the card and in search.
  await seedPlace(hemma, "Skräpförrådet", [{ name: "Julgransprydnad", category: "Hushåll" }], { part: "Kartong jul", box: true });
  await page.goto(roomUrl("Skräpförrådet"));
  await expect(page.getByTestId("room-summary")).toContainText("2prylar");
  await page.getByRole("button", { name: "Hushåll · 1" }).click();
  await expect(page.getByTestId("thing").filter({ hasText: "Julgransprydnad" })).toContainText("i Kartong jul");
  await page.getByRole("radio", { name: "Kort" }).click();
  await expect(page.getByTestId("room-card").filter({ hasText: "Låda: Kartong jul" })).toContainText("1 pryl");
  await page.goto("/prylar");
  await page.getByRole("searchbox", { name: "Sök bland prylar" }).fill("julgran");
  await expect(page.getByTestId("thing-hit")).toHaveText([/Julgransprydnad\s*Skräpförrådet, i Kartong jul · Hemma · 31 okt/]);
});

test("the same things on two cards of one room are counted once and say 'syns på 2 kort'", async ({ page }) => {
  await page.goto("/prylar");
  await takeCards(page, [photo, photo], { room: "Skräpförrådet" });
  // The second card is compared with the room's first (a text call after the reading): all twelve are the same things.
  await expect
    .poll(async () => (await adminClient().from("thing_item").select("id").eq("user_id", userId).not("same_as", "is", null)).data?.length, { timeout: 40_000 })
    .toBe(12);

  // The room counts them once: twelve things on two cards.
  await page.goto("/prylar");
  await expect(rooms(page)).toContainText(`12 prylar · 2 kort · ${shortDateText(new Date())}`);
  await rooms(page).click();
  await expect(page).toHaveURL(/\/prylar\/rum\//);
  await expect(page.getByTestId("room-summary")).toContainText("12prylar");
  await expect(page.getByTestId("room-summary")).toContainText("2kort");
  await page.getByRole("button", { name: "Verktyg · 4" }).click();
  const things = page.getByTestId("thing");
  await expect(things).toHaveCount(4);
  await expect(things.filter({ hasText: "Cirkelsåg" })).toContainText("syns på 2 kort");
  await page.screenshot({ path: process.env.MERGE_SHOT ?? "test-results/merge-shot.png" });

  // Search finds the saw once, with the number of cards.
  await page.goto("/prylar");
  await page.getByRole("searchbox", { name: "Sök bland prylar" }).fill("cirkelsåg");
  await expect(page.getByTestId("thing-hit")).toHaveCount(1);
  await expect(page.getByTestId("thing-hit")).toContainText("syns på 2 kort");

  // Removing the card that holds nothing new keeps all twelve, now seen on one card.
  await page.goto("/prylar");
  await rooms(page).click();
  await expect(page).toHaveURL(/\/prylar\/rum\//);
  await page.getByRole("radio", { name: "Kort" }).click();
  await page.getByTestId("room-card").filter({ hasText: "0 prylar" }).getByRole("button", { name: /^Ta bort kortet/ }).click();
  await page.getByRole("dialog", { name: "Ta bort kortet" }).getByRole("button", { name: "Ta bort kortet" }).click();
  await expect.poll(async () => (await adminClient().from("thing_photo").select("id").eq("user_id", userId)).data?.length).toBe(1);
  await page.getByRole("radio", { name: "Prylar" }).click();
  await expect(page.getByTestId("room-summary")).toContainText("12prylar");
  await page.getByRole("button", { name: "Verktyg · 4" }).click();
  await expect(page.getByText("syns på 2 kort")).toHaveCount(0);
});

test("a room with hundreds of things shows its categories folded in and renders a category's rows only when it is opened", async ({ page }) => {
  const names = Array.from({ length: 300 }, (_, index) => ({ name: `Skruv ${String(index).padStart(3, "0")}`, category: "Byggmaterial" }));
  await seedPlace(hemma, "Garaget", [...names, { name: "Lövblås", category: "Trädgård" }]);
  await page.goto(roomUrl("Garaget"));
  await expect(page.getByTestId("room-summary")).toContainText("301prylar");
  await expect(page.getByRole("button", { name: "Byggmaterial · 300" })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("thing")).toHaveCount(0);
  await page.getByRole("button", { name: "Byggmaterial · 300" }).click();
  await expect(page.getByTestId("thing")).toHaveCount(300);
  // Another category is still folded in and unread.
  await expect(page.getByRole("button", { name: "Trädgård · 1" })).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  await expect(page.getByTestId("thing")).toHaveCount(300);
  await page.getByRole("button", { name: "Byggmaterial · 300" }).click();
  await expect(page.getByTestId("thing")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("thing")).toHaveCount(0);
});

test.describe("on a phone", () => {
  test.use({ hasTouch: true, isMobile: true });

  test("the camera opens from the sheet, 'Ta ett till' takes another card of the same place, and the last room is chosen next time", async ({ page }) => {
    await seedPlace(hemma, "Skräpförrådet", [{ name: "Hammare", category: "Verktyg" }]);
    await seedPlace(hemma, "Garaget", [{ name: "Såg", category: "Verktyg" }]);
    await page.goto("/prylar");
    await page.getByRole("button", { name: "Ta kort" }).click();
    const dialog = page.getByRole("dialog", { name: "Var tar du kortet?" });
    await expect(dialog.getByRole("radio", { name: "Skräpförrådet" })).toBeChecked();
    await dialog.getByRole("radio", { name: "Garaget" }).click();
    await expect(dialog.getByRole("button", { name: "Välj bilder …" })).toBeVisible();
    const chooser = page.waitForEvent("filechooser");
    await dialog.getByRole("button", { name: /Öppna kameran/ }).click();
    await (await chooser).setFiles(photo);
    await expect(page.getByTestId("take-another")).toBeVisible({ timeout: 15_000 });

    const again = page.waitForEvent("filechooser");
    await page.getByTestId("take-another").click();
    await (await again).setFiles(photo);
    await expect.poll(async () => (await cardsOf()).length, { timeout: 25_000 }).toBe(4);
    const garage = (await adminClient().from("thing_place").select("id").eq("user_id", userId).eq("room_key", "garaget").single()).data!.id;
    const added = (await cardsOf()).filter((card) => card.place_id === garage);
    expect(added).toHaveLength(3);

    // The last used room is chosen next time (kept on this device).
    await page.reload();
    await page.getByRole("button", { name: "Ta kort" }).click();
    await expect(page.getByRole("dialog", { name: "Var tar du kortet?" }).getByRole("radio", { name: "Garaget" })).toBeChecked();
  });
});

test("what is in a box is written, sorted by one AI call, shown with the photographed things, found in search and the chat, and edited", async ({ page }) => {
  // The chat flow logs no console error or page error (no hydration mismatch, no key warning).
  const problems: string[] = [];
  // (The seeded card has no file, so its thumbnail's 404 is not a problem of the page.)
  page.on("console", (message) => message.type() === "error" && !message.text().startsWith("Failed to load resource") && problems.push(message.text().slice(0, 300)));
  page.on("pageerror", (error) => problems.push(error.message));
  await seedPlace(hemma, "Skräpförrådet", [{ name: "Hammare", category: "Verktyg" }]);
  const box = await adminClient()
    .from("thing_place")
    .insert({ user_id: userId, site_id: hemma, room: "Skräpförrådet", part: "Black box", room_key: "skräpförrådet", part_key: "box:black box" })
    .select("id")
    .single();
  if (box.error) throw box.error;

  // The room lists its boxes; the box's page has the field and the way to photograph the inside instead.
  await page.goto(roomUrl("Skräpförrådet"));
  await expect(page.getByTestId("room-box")).toContainText("Black box");
  await expect(page.getByTestId("room-box")).toContainText("Inget än");
  await page.getByTestId("room-box").click();
  await expect(page).toHaveURL(`/prylar/lada/${box.data.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Black box");
  await expect(page.getByText("Låda i Skräpförrådet")).toBeVisible();
  await expect(page.getByRole("link", { name: /Fota insidan i stället/ })).toHaveAttribute("href", new RegExp(`\\?fota=${box.data.id}$`));

  const field = page.getByLabel("Vad finns i lådan?");
  await field.fill("julgransbelysning\nadventsljusstake, 2 st\nskarvsladdar, glitter");
  await page.getByRole("button", { name: "Spara" }).click();
  await expect(page.getByTestId("box-saved")).toHaveText("Sparat: 4 prylar");
  await expect(field).toHaveValue("Julgransbelysning\nAdventsljusstake, 2 st\nSkarvsladdar\nGlitter");
  // One thing per row without a card, a category each (the mock sorts by a few words), the call recorded.
  const rows = (await adminClient().from("thing_item").select("name, category, source, photo_id, place_id").eq("place_id", box.data.id).order("position")).data;
  expect(rows).toEqual([
    { name: "Julgransbelysning", category: "Elektronik", source: "manual", photo_id: null, place_id: box.data.id },
    { name: "Adventsljusstake, 2 st", category: "Hushåll", source: "manual", photo_id: null, place_id: box.data.id },
    { name: "Skarvsladdar", category: "Elektronik", source: "manual", photo_id: null, place_id: box.data.id },
    { name: "Glitter", category: "Övrigt", source: "manual", photo_id: null, place_id: box.data.id },
  ]);
  expect((await adminClient().from("ai_usage").select("model").eq("user_id", userId)).data).toEqual([{ model: "mock" }]);

  // Written and photographed things show together: counts, lists ("i Black box") and the Kort view.
  await page.goto(roomUrl("Skräpförrådet"));
  await expect(page.getByTestId("room-summary")).toContainText("5prylar");
  await expect(page.getByTestId("room-box")).toContainText("skrivet 4 prylar");
  await page.getByRole("button", { name: "Elektronik · 2" }).click();
  await expect(page.getByTestId("thing").filter({ hasText: "Skarvsladdar" })).toContainText("i Black box");
  await page.getByRole("radio", { name: "Kort" }).click();
  const written = page.getByTestId("room-card-written");
  await expect(written).toContainText("Låda: Black box");
  await expect(written).toContainText(/skrivet \d+ \w+ · 4 prylar/);
  await written.getByTestId("edit-written").click();
  await expect(page).toHaveURL(`/prylar/lada/${box.data.id}`);

  // Search and the chat find a written thing: the box, without a thumbnail.
  await page.goto("/prylar");
  await expect(rooms(page)).toHaveText([/Skräpförrådet\s*5 prylar · 1 kort/]);
  await page.getByRole("searchbox", { name: "Sök bland prylar" }).fill("skarvsladd");
  await expect(page.getByTestId("thing-hit")).toHaveText([/Skarvsladdar\s*Skräpförrådet, i Black box · Hemma · skrivet/]);
  await page.getByRole("button", { name: "Rensa sökning" }).click();
  const chat = page.getByTestId("chat");
  await chat.getByRole("textbox", { name: "Fråga om ditt förråd" }).fill("Var ligger skarvsladdar?");
  await chat.getByRole("button", { name: "Skicka" }).click();
  await expect(page.getByTestId("chat-answer")).toContainText("Skarvsladdar finns i Skräpförrådet, i Black box (Hemma).");
  const ref = page.getByTestId("chat-ref");
  await expect(ref).toContainText("Skräpförrådet · Black box");
  await expect(ref).toContainText(/Låda · Skrivet \d+ \w+/);
  await expect(ref.locator("img")).toHaveCount(0);
  await ref.click();
  await expect(page).toHaveURL(`/prylar/lada/${box.data.id}`);

  // Editing the text replaces the written things; the photographed ones stay.
  await page.getByLabel("Vad finns i lådan?").fill("tomtenissar");
  await page.getByRole("button", { name: "Spara" }).click();
  await expect(page.getByTestId("box-saved")).toHaveText("Sparat: 1 pryl");
  expect((await adminClient().from("thing_item").select("name").eq("place_id", box.data.id).eq("source", "manual")).data).toEqual([{ name: "Tomtenissar" }]);
  expect((await adminClient().from("thing_item").select("name").eq("user_id", userId).eq("source", "photo")).data).toEqual([{ name: "Hammare" }]);
  expect(problems).toEqual([]);
});

test("when the AI does not sort a box's text the things are saved under Övrigt and it says so; a text that is too long is refused", async ({ page }) => {
  const box = await adminClient()
    .from("thing_place")
    .insert({ user_id: userId, site_id: hemma, room: "Garaget", part: "Backen", room_key: "garaget", part_key: "box:backen" })
    .select("id")
    .single();
  if (box.error) throw box.error;
  await page.goto(`/prylar/lada/${box.data.id}`);
  await page.getByLabel("Vad finns i lådan?").fill("Hammare\nHej matkoll-mock: ai_unavailable");
  await page.getByRole("button", { name: "Spara" }).click();
  await expect(page.getByTestId("box-saved")).toContainText("Sparat, men utan kategorier");
  expect((await adminClient().from("thing_item").select("name, category").eq("place_id", box.data.id).order("position")).data).toEqual([
    { name: "Hammare", category: "Övrigt" },
    { name: "Hej matkoll-mock: ai_unavailable", category: "Övrigt" },
  ]);
  await page.getByLabel("Vad finns i lådan?").fill("x".repeat(81));
  await page.getByRole("button", { name: "Spara" }).click();
  await expect(page.getByText("En pryl får vara högst 80 tecken. Dela upp raden.")).toBeVisible();
  // A page that is not a box, or is gone, is "Sidan finns inte."
  await page.goto(`/prylar/lada/${randomUUID()}`);
  await expect(page.getByText("Sidan finns inte.")).toBeVisible();
});
