import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { normalizeIngredientText } from "@/features/catalog/domain/normalize";
import { adminClient, aiJobsEmail, aiJobsStorageState, e2eUserId } from "./support";

// Story 12.4: AI jobs and their queue, with AI-förslag as the first kind
// (AI_PROVIDER=mock, and AI_MOCK_DELAY_MS=3000 from playwright.config.ts: an
// AI-förslag call takes 3 s, so the job can be seen). The spec has an E2E
// user of its own (aiJobsEmail). Before each test its AI jobs are removed
// and its recipe, catalog and pantry are seeded with the service role, so
// the queue holds only what the test puts in it. A job that was running when
// the test before ended sees its row gone within 3 s and stops.
//
// The queue is tried with jobs the service role puts in the table, since the
// mock answers only AI-förslag: a "running" import with a time of a few
// seconds is a job whose function died, and the AI-förslag job waits behind
// it ("I kö, 1 före.") until its time has passed and it is lost.

type FixtureLine = { name: string; new: unknown };
const fixtures = join(process.cwd(), "tests", "fixtures", "ai");
const suggested = (JSON.parse(readFileSync(join(fixtures, "suggest-dishes.response.json"), "utf8")) as { suggestions: { title: string; ingredients: FixtureLine[] }[] }).suggestions;
const titles = suggested.map((recipe) => recipe.title);
const names = [...new Set(suggested.flatMap((recipe) => recipe.ingredients.filter((line) => line.new === null).map((line) => line.name)))];

/** The mock's delay (3 s) plus the page's polling (every 2 s), and the waiting behind a lost job. */
const jobTime = { timeout: 20_000 };
const queueTime = { timeout: 30_000 };

test.use({ storageState: aiJobsStorageState, viewport: { width: 375, height: 812 } });
// One user for all the tests: each seeds it again, so they must not run at the same time.
test.describe.configure({ mode: "serial" });

let userId = "";

test.beforeEach(async () => {
  userId = await e2eUserId(aiJobsEmail);
  const admin = adminClient();
  // Children before parents, so nothing relies on the cascades.
  for (const table of ["ai_job", "pantry_item", "recipe_ingredient", "recipe_step", "recipe"] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  const recipe = await admin
    .from("recipe")
    .insert({ user_id: userId, title: "Linssoppa", original_servings: 4, total_minutes: 30, source_kind: "text" })
    .select("id")
    .single();
  if (recipe.error) throw recipe.error;
  const line = await admin.from("recipe_ingredient").insert({
    user_id: userId,
    recipe_id: (recipe.data as { id: string }).id,
    position: 0,
    original_text: "3 dl röda linser",
    amount: 3,
    unit: "dl",
    is_vague: false,
    ingredient_id: null,
  });
  if (line.error) throw line.error;

  const ingredients = await admin
    .from("ingredient")
    .upsert(
      names.map((name) => ({
        user_id: userId,
        name,
        normalized_name: normalizeIngredientText(name),
        section: "Övrigt",
        location: "Skafferi",
      })),
      { onConflict: "user_id,normalized_name" },
    )
    .select("id");
  if (ingredients.error) throw ingredients.error;
  const pantry = await admin.from("pantry_item").insert(
    (ingredients.data as { id: string }[]).map(({ id }) => ({
      user_id: userId,
      ingredient_id: id,
      location: "Skafferi",
      amount: null,
      unit: null,
    })),
  );
  if (pantry.error) throw pantry.error;
});

/** A job another instance left behind: active, with a time of its own. */
async function putJob(options: { status: "queued" | "running"; kind?: "import" | "suggest"; secondsLeft: number; secondsOld?: number }) {
  const now = Date.now();
  const { error } = await adminClient()
    .from("ai_job")
    .insert({
      user_id: userId,
      kind: options.kind ?? "import",
      status: options.status,
      client_key: crypto.randomUUID(),
      // Only the place, like the context of every job the app makes: no row here holds anything else.
      context: { siteId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01" },
      created_at: new Date(now - (options.secondsOld ?? 60) * 1000).toISOString(),
      started_at: options.status === "running" ? new Date(now - 1000).toISOString() : null,
      expires_at: new Date(now + options.secondsLeft * 1000).toISOString(),
    });
  if (error) throw error;
}

async function jobs() {
  const { data, error } = await adminClient()
    .from("ai_job")
    .select("id, kind, status, context, result, error_code, started_at, seen_at")
    .eq("user_id", userId)
    .order("created_at");
  if (error) throw error;
  return data;
}

const isStart = (request: { method: () => string; url: () => string }) =>
  request.method() === "POST" && new URL(request.url()).pathname === "/api/ai/jobs";

// Earlier routes stay mounted but hidden after a client navigation, so every locator is scoped to what is visible.
const visible = (page: Page) => page.locator("main").filter({ visible: true });
const section = (page: Page) => page.getByRole("region", { name: "AI-förslag" }).filter({ visible: true });
const cards = (page: Page) => section(page).getByRole("listitem");
const suggestButton = (page: Page) => page.getByRole("button", { name: "Föreslå rätter med AI" }).filter({ visible: true });
const pill = (page: Page, name: "Kan lagas nu") => page.getByRole("button", { name }).filter({ visible: true });

const jobRow = (page: Page) => page.getByTestId("ai-job-row").filter({ visible: true });
const toast = (page: Page) => page.getByTestId("toast");
const nav = (page: Page) => page.getByRole("navigation", { name: "Huvudmeny" }).filter({ visible: true });
const tab = (page: Page, name: string | RegExp) => nav(page).getByRole("link", { name });
const badge = (page: Page) => nav(page).getByTestId("tab-badge");

/** Opens the library with Kan lagas nu, where AI-förslag are. */
async function openSuggestions(page: Page) {
  await page.goto("/recept");
  await pill(page, "Kan lagas nu").click();
  await expect(suggestButton(page)).toBeVisible();
}

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("starts at once, goes on in the other tabs with the job row, and says so when it is done: the confirmation, the badge, and Visa", async ({ page }) => {
  await openSuggestions(page);
  const started = page.waitForResponse((response) => isStart(response.request()));
  const before = Date.now();
  await suggestButton(page).click();
  const response = await started;
  // The answer comes at once, not after the 3 s of the mock.
  expect(response.status()).toBe(202);
  expect(Date.now() - before).toBeLessThan(2_500);
  const body = (await response.json()) as { ok: true; data: { job: { kind: string; status: string } } };
  expect(body.data.job).toMatchObject({ kind: "suggest" });
  await expect(visible(page).getByRole("status").getByText("Letar efter idéer …").first()).toBeVisible();

  // Pontus goes on to Inköpslista, and the job row follows him.
  await tab(page, /Inköps/).click();
  await expect(page).toHaveURL(/\/lista$/);
  await expect(jobRow(page)).toBeVisible();
  await expect(jobRow(page)).toHaveText("AI: Letar efter rättförslag");
  await expect(jobRow(page)).toHaveAccessibleName("AI-jobb: Letar efter rättförslag");
  expect((await jobRow(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalScroll(page);

  // It is done: a short confirmation with Visa, a badge on Recept, and no row.
  await expect(toast(page)).toHaveText(/3 rättförslag är klara\./, jobTime);
  await expect(toast(page).getByRole("button", { name: "Visa" })).toBeVisible();
  await expect(jobRow(page)).toHaveCount(0);
  await expect(tab(page, "Recept, 1 nytt AI-resultat")).toBeVisible();
  await expect(badge(page)).toHaveText("1");
  await expectNoHorizontalScroll(page);

  // Visa: Recept with the suggestions, and the badge goes.
  await toast(page).getByRole("button", { name: "Visa" }).click();
  await expect(page).toHaveURL(/\/recept$/);
  await expect(pill(page, "Kan lagas nu")).toHaveAttribute("aria-pressed", "true");
  await expect(cards(page)).toHaveCount(3);
  await expect(section(page).getByRole("heading", { level: 3 })).toHaveText(titles);
  await expect(toast(page)).toHaveCount(0);
  await expect(badge(page)).toHaveCount(0);
  await expect(tab(page, "Recept")).toBeVisible();
  await expect.poll(async () => (await jobs())[0]?.seen_at !== null).toBe(true);

  // What the table holds: the place and nothing else, no pantry and no title.
  const [job] = await jobs();
  expect(Object.keys(job.context as object)).toEqual(["siteId"]);
  expect(JSON.stringify(job.context)).not.toMatch(/Kycklinggryta|lök|grädde/i);
});

test("stays on Recept: the suggestions come at once, with no confirmation and no badge", async ({ page }) => {
  await openSuggestions(page);
  await suggestButton(page).click();
  await expect(cards(page)).toHaveCount(3, jobTime);
  await expect(toast(page)).toHaveCount(0);
  await expect(badge(page)).toHaveCount(0);
  await expect(jobRow(page)).toHaveCount(0);
  // Shown, so seen.
  await expect.poll(async () => (await jobs())[0]?.seen_at !== null).toBe(true);
});

test("a result that came while Pontus was on another filter waits for Visa, and a reload brings back a job that is running and one that is done", async ({ page }) => {
  await openSuggestions(page);
  await suggestButton(page).click();
  await expect(visible(page).getByText("Letar efter idéer …").first()).toBeVisible();

  // A reload in the middle: the state and the row are back, and the result comes.
  await page.reload();
  await expect(jobRow(page)).toBeVisible();
  await expect(jobRow(page)).toHaveText("AI: Letar efter rättförslag");
  await expect(visible(page).getByText("Letar efter idéer …").first()).toBeVisible();
  await expect(cards(page)).toHaveCount(3, jobTime);

  // A result that nobody has seen: a reload shows it again.
  await expect.poll(async () => (await jobs())[0]?.status).toBe("done");
  const { error } = await adminClient().from("ai_job").update({ seen_at: null }).eq("user_id", userId);
  if (error) throw error;
  await page.reload();
  await expect(cards(page)).toHaveCount(3, jobTime);
  await expect(badge(page)).toHaveCount(0);
});

test("a double tap makes one job, and another tab is given the job that is on its way", async ({ page, context }) => {
  const clientKey = crypto.randomUUID();
  const start = (key: string) => page.request.post("/api/ai/jobs", { data: { kind: "suggest", clientKey: key, avoidTitles: [] } });
  const [one, two] = await Promise.all([start(clientKey), start(clientKey)]);
  expect(one.status()).toBe(202);
  expect(two.status()).toBe(202);
  const ids = [one, two].map(async (response) => ((await response.json()) as { data: { job: { id: string } } }).data.job.id);
  expect(new Set(await Promise.all(ids)).size).toBe(1);
  // Another key, as from another tab, is given the same job while it is active.
  const third = await start(crypto.randomUUID());
  expect(((await third.json()) as { data: { job: { id: string } } }).data.job.id).toBe((await Promise.all(ids))[0]);
  expect(await jobs()).toHaveLength(1);

  // The other tab sees the job's row at once when it opens, and its Avbryt stops it.
  const other = await context.newPage();
  await other.goto("/recept");
  await expect(jobRow(other)).toBeVisible();
  await jobRow(other).click();
  const sheet = other.getByRole("dialog", { name: "AI-jobb" });
  await expect(sheet.getByTestId("ai-job")).toHaveCount(1);
  await expect(sheet.getByTestId("ai-job")).toContainText("Rättförslag");
  await expect(sheet.getByTestId("ai-job")).toContainText("Pågår");
  await sheet.getByRole("button", { name: "Avbryt rättförslag" }).click();
  await expect(sheet.getByTestId("ai-job")).toHaveCount(0);
  await expect.poll(async () => (await jobs())[0]?.status).toBe("cancelled");
  // The job does not come back with a result.
  await page.waitForTimeout(4_000);
  expect((await jobs())[0]).toMatchObject({ status: "cancelled", result: null });
  await other.close();
});

test("a job behind another one: I kö, 1 före., · 1 i kö, and Avbryt in the queue means it never starts", async ({ page }) => {
  // A job that runs, as one whose function has died would leave it, for 8 s.
  await putJob({ status: "running", secondsLeft: 8 });
  await openSuggestions(page);
  await expect(jobRow(page)).toHaveText("AI: Läser receptet");
  await suggestButton(page).click();

  await expect(visible(page).getByRole("status").getByText("I kö, 1 före.")).toBeVisible();
  await expect(jobRow(page)).toHaveText("AI: Läser receptet · 1 i kö");
  await expect(jobRow(page)).toHaveAccessibleName("AI-jobb: Läser receptet, 1 i kö");
  await jobRow(page).click();
  const sheet = page.getByRole("dialog", { name: "AI-jobb" });
  await expect(sheet.getByTestId("ai-job")).toHaveCount(2);
  await expect(sheet.getByText("I kö, 1 före", { exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "Klar" }).click();

  await visible(page).getByRole("button", { name: "Avbryt" }).click();
  await expect(suggestButton(page)).toBeVisible();
  // The row goes at once, and the server follows a moment later.
  await expect.poll(async () => (await jobs()).find((job) => job.kind === "suggest")?.status).toBe("cancelled");
  // The other job's time passes, and the cancelled job never starts.
  // Nobody uses the queue meanwhile, so the table still says "running"; a read shows it as lost (it writes nothing).
  const shown = async () =>
    ((await (await page.request.get("/api/ai/jobs")).json()) as { data: { jobs: { kind: string; status: string; errorCode: string | null }[] } }).data.jobs;
  await expect.poll(async () => (await shown()).find((job) => job.kind === "import")?.errorCode, queueTime).toBe("ai_job_lost");
  await page.waitForTimeout(2_000);
  expect((await jobs()).find((job) => job.kind === "suggest")).toMatchObject({ status: "cancelled", started_at: null, result: null });
});

test("a job that waits for a job that is lost runs in its turn, and the lost one is shown as such", async ({ page }) => {
  await putJob({ status: "running", secondsLeft: 6 });
  await openSuggestions(page);
  await suggestButton(page).click();
  await expect(visible(page).getByRole("status").getByText("I kö, 1 före.")).toBeVisible();
  // The lost job leaves the queue; the suggestions come after its time and the mock's 3 s.
  await expect(cards(page)).toHaveCount(3, queueTime);
  const all = await jobs();
  expect(all.find((job) => job.kind === "import")).toMatchObject({ status: "failed", error_code: "ai_job_lost" });
  expect(all.find((job) => job.kind === "suggest")).toMatchObject({ status: "done" });
});

test("three jobs are the most: a fourth is refused with the text, and nothing is queued", async ({ page }) => {
  for (const [index, kind] of (["import", "import", "import"] as const).entries()) {
    await putJob({ status: index === 0 ? "running" : "queued", kind, secondsLeft: 120, secondsOld: 60 - index });
  }
  await openSuggestions(page);
  await expect(jobRow(page)).toHaveText("AI: Läser receptet · 2 i kö");
  const answered = page.waitForResponse((response) => isStart(response.request()));
  await suggestButton(page).click();
  expect((await answered).status()).toBe(429);
  await expect(visible(page).getByRole("alert")).toHaveText("Det finns redan tre AI-jobb. Vänta tills ett är klart.");
  await expect(visible(page).getByRole("button", { name: "Försök igen" })).toHaveCount(0);
  await expect(suggestButton(page)).toBeVisible();
  expect((await jobs()).filter((job) => job.kind === "suggest")).toHaveLength(0);
});

test("a job that did not get to start, or was lost, says so with Försök igen", async ({ page }) => {
  await openSuggestions(page);
  await suggestButton(page).click();
  await expect.poll(async () => (await jobs())[0]?.status).toBe("running");
  // The function dies: its time passes while it runs.
  const { error } = await adminClient()
    .from("ai_job")
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq("user_id", userId);
  if (error) throw error;
  await expect(visible(page).getByRole("alert")).toHaveText("AI-jobbet avbröts. Försök igen.", jobTime);
  await expect(visible(page).getByRole("button", { name: "Försök igen" })).toBeVisible();
  await expect(jobRow(page)).toHaveCount(0);
});

test("the sheet is a dialog with the job's name on its buttons, in light and dark, with no horizontal scroll at 375 px and 1280 px", async ({ page }) => {
  await putJob({ status: "running", secondsLeft: 60 });
  await page.goto("/lista");
  await jobRow(page).click();
  const sheet = page.getByRole("dialog", { name: "AI-jobb" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Avbryt receptet" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(sheet).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expectNoHorizontalScroll(page);
  await sheet.getByRole("button", { name: "Klar" }).click();
  // On desktop the row is at the top of the side menu, under Matkoll.
  await expect(jobRow(page)).toBeVisible();
  await expect(nav(page).getByText("Livskoll")).toBeVisible();
  expect((await jobRow(page).boundingBox())!.x).toBeLessThan(240);
});
