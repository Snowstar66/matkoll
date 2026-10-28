import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { adminClient, aiImportEmail, aiImportStorageState, e2eUserId } from "./support";

// Story 12.6: recipe import as a background AI job (AI_PROVIDER=mock, and
// AI_MOCK_DELAY_MS=3000 from playwright.config.ts: an import takes 3 s, so
// the job can be seen). The spec has an E2E user of its own (aiImportEmail).
// Before each test its AI jobs and recipes are removed, so the queue holds
// only what the test puts in it. Recipe sites are the saved pages of the
// fetch port (tests/fixtures/sites), never the internet.

const linssoppa = readFileSync("tests/fixtures/ai/linssoppa.txt", "utf8");
const kycklinggryta = readFileSync("tests/fixtures/ai/kycklinggryta.txt", "utf8");
const chowMein = "https://www.koket.se/chow-mein-med-lovbiff";

/** The mock's delay (3 s) plus the page's polling (every 2 s), and the wait behind another job. */
const jobTime = { timeout: 20_000 };

test.use({ storageState: aiImportStorageState, viewport: { width: 375, height: 812 } });
// One user for all the tests: each starts afresh, so they must not run at the same time.
test.describe.configure({ mode: "serial" });

let userId = "";

test.beforeEach(async () => {
  userId = await e2eUserId(aiImportEmail);
  const admin = adminClient();
  // Children before parents, so nothing relies on the cascades.
  for (const table of ["ai_job", "recipe_ingredient", "recipe_step", "recipe"] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
});

const sheet = (page: Page) => page.getByRole("dialog", { name: "Importera recept" });
const jobRow = (page: Page) => page.getByTestId("ai-job-row").filter({ visible: true });
const toast = (page: Page) => page.getByTestId("toast");

async function jobs() {
  const { data, error } = await adminClient()
    .from("ai_job")
    .select("kind, status, context, error_code")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

async function recipeTitles(): Promise<string[]> {
  const { data, error } = await adminClient().from("recipe").select("title").eq("user_id", userId);
  if (error) throw error;
  return data.map((row) => row.title).sort();
}

async function openImport(page: Page) {
  await page.goto("/recept");
  await page.locator("header").getByRole("button", { name: "Importera recept" }).click();
  await expect(sheet(page)).toBeVisible();
}

async function readText(page: Page, text: string) {
  await sheet(page).getByRole("tab", { name: "Text" }).click();
  await sheet(page).getByLabel("Recepttext").fill(text);
  await sheet(page).getByRole("button", { name: "Tolka" }).click();
  await expect(sheet(page).getByRole("status").getByText("Läser receptet …")).toBeVisible();
}

async function readLink(page: Page, url: string) {
  await sheet(page).getByLabel("Länk till receptet").fill(url);
  await sheet(page).getByRole("button", { name: "Tolka" }).click();
  await expect(sheet(page).getByRole("status").getByText("Läser receptet …")).toBeVisible();
}

async function closeSheet(page: Page) {
  await sheet(page).getByRole("button", { name: "Stäng" }).click();
  await expect(sheet(page)).toHaveCount(0);
}

test("two texts in a row: the sheet closes, the next is read at once, both are in the job row, and each is opened with Visa and saved", async ({ page }) => {
  await openImport(page);
  await readText(page, linssoppa);
  await closeSheet(page);

  // The sheet is empty again, and the first recipe is still being read.
  await page.locator("header").getByRole("button", { name: "Importera recept" }).click();
  await sheet(page).getByRole("tab", { name: "Text" }).click();
  await expect(sheet(page).getByLabel("Recepttext")).toHaveValue("");
  await expect(sheet(page).getByText("Läser receptet …")).toHaveCount(0);
  await readText(page, kycklinggryta);
  await closeSheet(page);

  // One runs, one waits: the job row says so, and the table holds the kind of input and nothing else.
  await expect(jobRow(page)).toHaveText("AI: Läser receptet · 1 i kö");
  const started = await jobs();
  expect(started).toHaveLength(2);
  for (const job of started) {
    expect(job.kind).toBe("import");
    expect(job.context).toEqual({ source: "text" });
  }
  expect(JSON.stringify(started)).not.toMatch(/linser|kyckling/i);

  // Elsewhere in the app, the first is done: a confirmation with the title and Visa.
  await page.goto("/lista");
  await expect(toast(page)).toHaveText(/Receptet Röd linssoppa med kokosmjölk är inläst\./, jobTime);
  await toast(page).getByRole("button", { name: "Visa" }).click();
  await expect(page).toHaveURL(/\/recept$/);
  await expect(sheet(page).getByLabel("Titel")).toHaveValue("Röd linssoppa med kokosmjölk", jobTime);
  // Nothing is saved until Spara recept.
  expect(await recipeTitles()).toEqual([]);
  await sheet(page).getByRole("button", { name: "Spara recept" }).click();
  await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
  expect(await recipeTitles()).toEqual(["Röd linssoppa med kokosmjölk"]);
  // Saved: its job is closed, and the other one is still there.
  await expect.poll(async () => (await jobs()).length, { timeout: 5_000 }).toBe(1);

  // The second one, the same way.
  await expect(toast(page)).toHaveText(/Receptet Krämig kycklinggryta med curry är inläst\./, jobTime);
  await toast(page).getByRole("button", { name: "Visa" }).click();
  await expect(sheet(page).getByLabel("Titel")).toHaveValue("Krämig kycklinggryta med curry", jobTime);
  await sheet(page).getByRole("button", { name: "Spara recept" }).click();
  await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
  expect(await recipeTitles()).toEqual(["Krämig kycklinggryta med curry", "Röd linssoppa med kokosmjölk"]);
  await expect.poll(async () => (await jobs()).length, { timeout: 5_000 }).toBe(0);
});

test("a link keeps only its domain in the job, and the open sheet shows the draft when it is done", async ({ page }) => {
  await openImport(page);
  await readLink(page, chowMein);
  await expect(sheet(page).getByText("Du kan göra annat under tiden.")).toBeVisible();

  await expect.poll(async () => (await jobs()).length).toBe(1);
  const [job] = await jobs();
  expect(job.context).toEqual({ source: "url", domain: "koket.se" });
  expect(JSON.stringify(job.context)).not.toContain("chow-mein");

  // The sheet is open on the job: the preview comes in the sheet, without a confirmation.
  await expect(sheet(page).getByLabel("Titel")).toHaveValue("Chow mein med lövbiff", jobTime);
  await expect(toast(page)).toHaveCount(0);
});

test("the job row names the site while a link is read, and a site that refuses is said so with Visa", async ({ page }) => {
  await openImport(page);
  await readLink(page, "https://www.koket.se/matkoll-test/blockerad");
  await closeSheet(page);
  await expect(jobRow(page)).toHaveText("AI: Läser receptet från koket.se");

  await expect(toast(page)).toHaveText("Det gick inte att läsa receptet.", jobTime);
  await toast(page).getByRole("button", { name: "Visa" }).click();
  await expect(sheet(page).getByRole("alert")).toContainText("koket.se släppte inte in oss.");
  await expect(sheet(page).getByRole("button", { name: "Klistra in text i stället" })).toBeVisible();
  // Shown, so the job has done its part.
  await expect.poll(async () => (await jobs()).length, { timeout: 5_000 }).toBe(0);
});

test("a site that is not approved is refused at once, without a job", async ({ page }) => {
  await openImport(page);
  await sheet(page).getByLabel("Länk till receptet").fill("https://www.example.org/recept/x");
  await sheet(page).getByRole("button", { name: "Tolka" }).click();
  await expect(sheet(page).getByRole("alert")).toContainText("example.org är inte en godkänd receptsajt.");
  await expect(sheet(page).getByRole("button", { name: "Öppna inställningar" })).toBeVisible();
  expect(await jobs()).toEqual([]);
});

test("Avbryt stops the job and keeps the text", async ({ page }) => {
  await openImport(page);
  await readText(page, linssoppa);
  await sheet(page).getByRole("button", { name: "Avbryt" }).click();
  await expect.poll(async () => (await jobs()).map((job) => job.status)).toEqual(["cancelled"]);
  await expect(sheet(page).getByLabel("Recepttext")).toHaveValue(linssoppa);
});
