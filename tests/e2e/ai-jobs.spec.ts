import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { normalizeIngredientText } from "@/features/catalog/domain/normalize";
import { adminClient, aiJobsEmail, aiJobsStorageState, e2eUserId } from "./support";

// Story 12.4 and 25.3: AI jobs and their queue. The entry to a suggest job is no longer a
// button in Recept (Story 25.3: Matsedel has the offers ideas, offer-suggestions.spec.ts;
// Matvaror has Vad kan jag laga nu?, eat-first.spec.ts), so what is tried here is what
// does not need one: the job API, the job row and the AI jobs sheet.
// (earlier: AI-förslag as the first kind
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
const names = [...new Set(suggested.flatMap((recipe) => recipe.ingredients.filter((line) => line.new === null).map((line) => line.name)))];


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
      { onConflict: "household_id,normalized_name" },
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

const jobRow = (page: Page) => page.getByTestId("ai-job-row").filter({ visible: true });
const nav = (page: Page) => page.getByRole("navigation", { name: "Huvudmeny" }).filter({ visible: true });

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

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
