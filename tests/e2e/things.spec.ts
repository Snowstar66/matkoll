import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { cardDateText, shortDateText } from "@/features/things";
import { adminClient, e2eUserId, thingsEmail, thingsStorageState } from "./support";

// Prylar (Epic 18, Stories 18.1 and 18.2) with AI_PROVIDER=mock and
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

async function newPlace(page: Page, room: string, part = "") {
  await page.getByRole("button", { name: "Ny plats" }).filter({ visible: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Ny plats" });
  await dialog.getByLabel("Rum").fill(room);
  if (part) await dialog.getByLabel("Del (valfritt)").fill(part);
  await dialog.getByRole("button", { name: "Skapa" }).click();
}

test("the fifth tab is Förråd with the toolbox, in the tab bar", async ({ page }) => {
  await page.goto("/prylar");
  const links = nav(page).getByRole("link");
  await expect(links).toHaveText(["📖Recept", "📅Matsedel", "🛒Inköpslista", "🥕Matvaror", "🧰Förråd"]);
  await expect(nav(page).getByRole("link", { name: "Förråd" })).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveTitle(/Förråd/);
});

test("without places it explains and offers Ny plats", async ({ page }) => {
  await page.goto("/prylar");
  await expect(page.getByText("Fotografera en hylla eller ett förråd, så listar Matkoll vad som finns där.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ny plats" })).toBeVisible();
  // One boende: no pills.
  await expect(page.getByRole("radiogroup", { name: "Boende" })).toHaveCount(0);
});

test("a place is made with a room and a part, rooms are suggested and places are grouped per room", async ({ page }) => {
  await page.goto("/prylar");
  await newPlace(page, "Skräpförrådet", "Översta hyllan");
  await expect(page).toHaveURL(/\/prylar\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Skräpförrådet · Översta hyllan");
  await expect(page.getByRole("button", { name: "Ta ett nytt kort" })).toBeVisible();

  // Back to the list, a second place in the same room: the room is suggested, so it is reused.
  await page.getByRole("link", { name: "Tillbaka" }).click();
  await expect(page).toHaveURL(/\/prylar$/);
  await page.getByRole("button", { name: "Ny plats" }).click();
  const options = page.getByRole("dialog", { name: "Ny plats" }).locator("datalist option");
  await expect(options).toHaveCount(1);
  expect(await options.first().getAttribute("value")).toBe("Skräpförrådet");
  await page.getByLabel("Rum").fill("skräpförrådet");
  await page.getByLabel("Del (valfritt)").fill("Golvet");
  await page.getByRole("button", { name: "Skapa" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Skräpförrådet · Golvet");

  await newPlaceFromList(page);
  const rooms = page.getByTestId("places").getByRole("heading", { level: 2 });
  await expect(rooms).toHaveText(["Skräpförrådet", "Garaget"]);
  const rows = page.getByTestId("place");
  await expect(rows).toHaveText([/Översta hyllan\s*Inget kort än/, /Golvet\s*Inget kort än/, /Hela rummet\s*Inget kort än/]);
});

async function newPlaceFromList(page: Page) {
  await page.goto("/prylar");
  await newPlace(page, "Garaget");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Garaget");
  await page.goto("/prylar");
}

test("the same room and part twice is said under the field", async ({ page }) => {
  await page.goto("/prylar");
  await newPlace(page, "Garaget", "Väggen");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Garaget · Väggen");
  await page.goto("/prylar");
  await newPlace(page, " GARAGET ", "väggen");
  await expect(page.getByRole("dialog").getByText("Platsen finns redan.")).toBeVisible();
});

test("places belong to the selected boende, and the pills switch between them", async ({ page }) => {
  const admin = adminClient();
  const stugan = await admin
    .from("pantry_site")
    .insert({ user_id: userId, name: "Stugan", normalized_name: "stugan", is_selected: false })
    .select("id")
    .single();
  if (stugan.error) throw stugan.error;
  const rows = await admin.from("thing_place").insert([
    { user_id: userId, site_id: hemma, room: "Garaget", part: null, room_key: "garaget", part_key: "" },
    { user_id: userId, site_id: stugan.data.id, room: "Redskapsboden", part: null, room_key: "redskapsboden", part_key: "" },
  ]);
  if (rows.error) throw rows.error;

  await page.goto("/prylar");
  const pills = page.getByRole("radiogroup", { name: "Boende" });
  await expect(pills.getByRole("radio")).toHaveText(["Hemma", "Stugan"]);
  await expect(page.getByTestId("place")).toHaveText([/Hela rummet/]);
  await expect(page.getByRole("heading", { level: 2, name: "Garaget" })).toBeVisible();
  await pills.getByRole("radio", { name: "Stugan" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Redskapsboden" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Garaget" })).toHaveCount(0);
});

test("a photo is read in the background and the things come under their categories", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/prylar");
  await newPlace(page, "Skräpförrådet", "Väggen");
  await expect(page.getByRole("button", { name: "Ta ett nytt kort" })).toBeVisible();

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Ta ett nytt kort" }).click();
  await (await chooser).setFiles(photo);
  await expect(page.getByText("Tittar på bilden … Du kan göra annat under tiden.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ta ett nytt kort" })).toHaveCount(0);

  // The job runs in the background: the card, its date and the things come when it is done.
  const panel = page.getByTestId("card-panel");
  await expect(panel).toBeVisible({ timeout: 25_000 });
  await expect(panel.getByText(cardDateText(new Date()))).toBeVisible();
  await expect(panel.getByRole("img", { name: "Kortet av platsen" })).toBeVisible();
  const groups = panel.getByTestId("thing-group");
  await expect(groups.getByRole("heading")).toHaveText(["Verktyg", "Sport & fritid", "Trädgård", "Elektronik", "Förvaring & lådor", "Hushåll", "Byggmaterial"]);
  await expect(groups.first().getByTestId("thing")).toHaveText([
    /Hammare\s*på väggen, mitten/,
    /Cirkelsåg\s*översta hyllan, vänster/,
    /Batteridriven skruvdragare/,
    /Skruvmejslar/,
  ]);
  // A guess says kanske, and only a guess.
  await expect(panel.getByText("kanske · överst, höger")).toBeVisible();
  await expect(panel.getByText(/kanske/)).toHaveCount(1);
  await expect(panel.getByTestId("unseen-note")).toHaveText("Innehållet i 3 lådor syns inte – fota insidan");
  await expect(page.getByRole("button", { name: "Ta ett nytt kort" })).toBeVisible();

  // The photo is private: the route gives it to its owner, with no cache; the file is in the user's own folder.
  const photoId = (await panel.getByRole("img").getAttribute("src"))!.split("/").pop()!;
  const image = await page.request.get(`/api/things/photo/${photoId}`);
  expect(image.status()).toBe(200);
  expect(image.headers()["cache-control"]).toContain("no-store");
  const stored = await adminClient().from("thing_photo").select("object_path, status").eq("id", photoId).single();
  expect(stored.data?.status).toBe("done");
  expect(stored.data?.object_path.startsWith(`${userId}/`)).toBe(true);
  expect((await adminClient().storage.from("thing-photo").download(stored.data!.object_path)).error).toBeNull();
  // Not for anyone who is not signed in.
  const anonymous = await page.context().browser()!.newContext({ baseURL: "http://localhost:3100", storageState: { cookies: [], origins: [] } });
  expect((await anonymous.request.get(`/api/things/photo/${photoId}`)).status()).toBe(401);
  await anonymous.close();

  // The list counts the things and gives the card's date.
  await page.getByRole("link", { name: "Tillbaka" }).click();
  await expect(page.getByTestId("place")).toHaveText(new RegExp(`12 saker · Kort från ${shortDateText(new Date())}`));
  // Prylar never touch the food: nothing in the pantry or the lists.
  const pantry = await adminClient().from("pantry_item").select("id", { count: "exact", head: true }).eq("user_id", userId);
  expect(pantry.count).toBe(0);
  expect(errors).toEqual([]);
});

test("a new photo of the place replaces the old card, its things and its file", async ({ page }) => {
  await page.goto("/prylar");
  await newPlace(page, "Garaget");
  for (let round = 0; round < 2; round += 1) {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Ta ett nytt kort" }).click();
    await (await chooser).setFiles(photo);
    await expect(page.getByTestId("card-panel")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole("button", { name: "Ta ett nytt kort" })).toBeVisible();
  }
  await expect
    .poll(async () => (await adminClient().from("thing_photo").select("id").eq("user_id", userId)).data?.length)
    .toBe(1);
  const items = await adminClient().from("thing_item").select("id", { count: "exact", head: true }).eq("user_id", userId);
  expect(items.count).toBe(12);
  const files = await adminClient().storage.from("thing-photo").list(userId, { limit: 100 });
  const place = (await adminClient().from("thing_place").select("id").eq("user_id", userId).single()).data!.id;
  expect((await adminClient().storage.from("thing-photo").list(`${userId}/${place}`)).data).toHaveLength(1);
  expect(files.error).toBeNull();
});

test("a reading that does not go leaves the card with a calm notice and Försök igen", async ({ page }) => {
  await page.goto("/prylar");
  await newPlace(page, "Vinden");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Ta ett nytt kort" }).click();
  await (await chooser).setFiles(failing);
  const notice = page.getByRole("alert").filter({ hasText: "Det gick inte att läsa kortet" });
  await expect(notice).toBeVisible({ timeout: 25_000 });
  await expect(notice).toContainText("Det ligger kvar");
  // The card is kept, failed, with its file; nothing was listed.
  const cards = await adminClient().from("thing_photo").select("status, error_code, object_path").eq("user_id", userId);
  expect(cards.data).toMatchObject([{ status: "failed", error_code: "ai_unavailable" }]);
  expect((await adminClient().storage.from("thing-photo").download(cards.data![0].object_path)).error).toBeNull();

  // The list says so too, and "Försök igen" reads the stored photo again (the mock fails the same photo the same way).
  await page.getByRole("link", { name: "Tillbaka" }).click();
  await expect(page.getByTestId("place")).toContainText("Kortet kunde inte läsas");
  await page.getByTestId("place").click();
  await expect(page).toHaveURL(/\/prylar\/[0-9a-f-]{36}$/);
  await page.reload();
  await expect(notice).toBeVisible();
  await page.getByRole("button", { name: "Försök igen" }).click();
  await expect(page.getByText("Tittar på bilden … Du kan göra annat under tiden.")).toBeVisible();
  await expect(notice).toBeVisible({ timeout: 25_000 });
  const jobs = await adminClient().from("ai_job").select("kind, status").eq("user_id", userId).order("created_at");
  expect(jobs.data?.map((job) => job.kind)).toEqual(["things", "things"]);
});

test("a finished reading is confirmed while Pontus is in another tab, with a badge and Visa", async ({ page }) => {
  await page.goto("/prylar");
  await newPlace(page, "Boden");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Ta ett nytt kort" }).click();
  await (await chooser).setFiles(photo);
  await expect(page.getByText("Tittar på bilden … Du kan göra annat under tiden.")).toBeVisible();
  await nav(page).getByRole("link", { name: "Recept" }).click();
  await expect(page).toHaveURL(/\/recept$/);
  await expect(page.getByTestId("toast")).toContainText("12 prylar är listade.", { timeout: 25_000 });
  await expect(nav(page).getByTestId("tab-badge")).toHaveText("1");
  await page.getByTestId("toast").getByRole("button", { name: "Visa" }).click();
  await expect(page).toHaveURL(/\/prylar\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("card-panel")).toBeVisible();
  // Seen here: the badge goes.
  await expect(nav(page).getByTestId("tab-badge")).toHaveCount(0);
});

test("the side menu at desktop width has Förråd too", async ({ page }) => {
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
  { part = null, takenAt = "2026-10-31T10:00:00Z", hidden = 0 }: { part?: string | null; takenAt?: string; hidden?: number } = {},
): Promise<string> {
  const admin = adminClient();
  const place = await admin
    .from("thing_place")
    .insert({ user_id: userId, site_id: siteId, room, part, room_key: room.toLowerCase(), part_key: part?.toLowerCase() ?? "" })
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

test("Ta bort kortet asks first, removes card, things and file, and Ångra brings the card back for a short while", async ({ page }) => {
  await page.goto("/prylar");
  await newPlace(page, "Garaget");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Ta ett nytt kort" }).click();
  await (await chooser).setFiles(photo);
  const panel = page.getByTestId("card-panel");
  await expect(panel).toBeVisible({ timeout: 25_000 });
  const admin = adminClient();
  const path = (await admin.from("thing_photo").select("object_path").eq("user_id", userId).single()).data!.object_path;
  const fileExists = async () => (await admin.storage.from("thing-photo").download(path)).error === null;

  // The question comes first; "Avbryt" leaves everything.
  await panel.getByRole("button", { name: "Ta bort kortet" }).click();
  const dialog = page.getByRole("dialog", { name: "Ta bort kortet" });
  await expect(dialog.getByText("Ta bort kortet?")).toBeVisible();
  await dialog.getByRole("button", { name: "Avbryt" }).click();
  await expect(panel).toBeVisible();
  expect((await admin.from("thing_photo").select("id").eq("user_id", userId)).data).toHaveLength(1);

  await panel.getByRole("button", { name: "Ta bort kortet" }).click();
  await dialog.getByRole("button", { name: "Ta bort kortet" }).click();
  await expect(page.getByTestId("toast")).toContainText("Tog bort kortet från");
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ta ett nytt kort" })).toBeVisible();
  expect((await admin.from("thing_photo").select("id").eq("user_id", userId)).data).toHaveLength(0);
  expect((await admin.from("thing_item").select("id").eq("user_id", userId)).data).toHaveLength(0);
  // The file waits for Ångra.
  expect(await fileExists()).toBe(true);

  await page.getByTestId("toast").getByRole("button", { name: "Ångra" }).click();
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("thing")).toHaveCount(12);
  expect(await fileExists()).toBe(true);

  // Without Ångra the file goes when the time is out.
  await panel.getByRole("button", { name: "Ta bort kortet" }).click();
  await dialog.getByRole("button", { name: "Ta bort kortet" }).click();
  await expect(panel).toHaveCount(0);
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
  await page.goto(`/prylar/${place}`);
  const panel = page.getByTestId("card-panel");

  await panel.getByRole("button", { name: /Hammare/ }).click();
  const sheet = page.getByRole("dialog", { name: "Pryl" });
  await sheet.getByLabel("Byt namn").fill("Klohammare");
  await sheet.getByRole("button", { name: "Spara" }).click();
  await expect(panel.getByTestId("thing").first()).toContainText("Klohammare");
  await expect(panel.getByText("Hammare", { exact: true })).toHaveCount(0);

  await panel.getByRole("button", { name: /Spade/ }).click();
  await sheet.getByRole("button", { name: "Ta bort pryl" }).click();
  await expect(page.getByTestId("toast")).toContainText("Tog bort Spade.");
  await expect(panel.getByTestId("thing")).toHaveCount(1);
  await page.getByTestId("toast").getByRole("button", { name: "Ångra" }).click();
  await expect(panel.getByTestId("thing")).toHaveCount(2);

  // The card, with its date, is untouched.
  const cardAfter = (await admin.from("thing_photo").select("id, taken_at, created_at").eq("place_id", place).single()).data!;
  expect(cardAfter).toEqual(cardBefore);
  await expect(panel.getByText("Kort från 31 okt")).toBeVisible();
});

test("search finds a thing in every place and boende, and a question is answered with places to tap", async ({ page }) => {
  const stugan = await adminClient()
    .from("pantry_site")
    .insert({ user_id: userId, name: "Stugan", normalized_name: "stugan", is_selected: false })
    .select("id")
    .single();
  if (stugan.error) throw stugan.error;
  await seedPlace(hemma, "Skräpförrådet", [{ name: "Hammare", category: "Verktyg", where: "väggen" }, { name: "Spade", category: "Trädgård" }], { hidden: 2 });
  const shed = await seedPlace(stugan.data.id, "Redskapsboden", [{ name: "Målarfärgsburkar", category: "Byggmaterial" }, { name: "Kratta", category: "Trädgård" }], {
    takenAt: "2026-09-02T10:00:00Z",
  });

  await page.goto("/prylar");
  // Search runs in the browser: the hit says place, boende and the card's day, from every boende.
  const search = page.getByRole("searchbox", { name: "Sök bland prylar" });
  await search.fill("hamm");
  await expect(page.getByTestId("thing-hit")).toHaveText([/Hammare\s*Skräpförrådet, väggen · Hemma · 31 okt/]);
  await expect(page.getByTestId("place")).toBeHidden();
  await search.fill("kratta");
  await expect(page.getByTestId("thing-hit")).toHaveText([/Kratta\s*Redskapsboden · Stugan · 2 sep/]);
  await search.fill("inget");
  await expect(page.getByText('Inga prylar matchar "inget".')).toBeVisible();
  await page.getByRole("button", { name: "Rensa sökning" }).click();
  await expect(page.getByTestId("place")).toBeVisible();

  // The question goes to the AI (the mock here) with the lists; the answer names places that can be tapped.
  await page.getByRole("textbox", { name: "Fråga om ditt förråd" }).fill("Har vi något att måla med?");
  await page.getByRole("button", { name: "Fråga", exact: true }).click();
  const answer = page.getByTestId("ask-answer");
  await expect(answer).toContainText("Målarfärgsburkar finns i Redskapsboden (Stugan).");
  // Story 17.6: the question was recorded as a call (the mock: model and no tokens, no cost).
  const usage = await adminClient().from("ai_usage").select("model, input_tokens, output_tokens").eq("user_id", userId);
  expect(usage.data).toEqual([{ model: "mock", input_tokens: 0, output_tokens: 0 }]);
  await answer.getByTestId("ask-ref").click();
  await expect(page).toHaveURL(new RegExp(`/prylar/${shed}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Redskapsboden");
});
