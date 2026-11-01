import { expect, test, type Page } from "@playwright/test";
import { adminClient, e2eUserId, feedbackEmail, feedbackStorageState, settingsStorageState } from "./support";

// Tyck till och inkorg (Story 20.3): the three sheets under Hjälp, what they save,
// and the owner's Inkorg under Inställningar. The feedback user is made the app's
// owner in app_owner for the inbox tests only, and removed after them.

test.use({ storageState: feedbackStorageState, viewport: { width: 390, height: 844 } });
test.describe.configure({ mode: "serial" });

let userId: string;

async function sentRows() {
  const { data, error } = await adminClient().from("feedback").select("*").eq("user_id", userId).order("created_at");
  if (error) throw error;
  return data as { kind: string; stars: number | null; body: string; area: string | null; page: string | null; app_version: string | null; read_at: string | null }[];
}

const sheet = (page: Page, name: string) => page.getByRole("dialog", { name });

test.beforeAll(async () => {
  userId = await e2eUserId(feedbackEmail);
});

test.beforeEach(async () => {
  await adminClient().from("feedback").delete().eq("user_id", userId);
});

test("Föreslå en funktion opens from Hjälp with the tab's area chosen, sends, thanks and closes", async ({ page }) => {
  await page.goto("/hjalp#inkopslista");
  await page.getByTestId("feedback-idea").filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/hjalp\?tyck=idea#inkopslista$/);
  const dialog = sheet(page, "Föreslå en funktion");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Inköpslista" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByText(/ser texten, ditt namn och sidan du var på\./)).toBeVisible();
  const send = page.getByRole("button", { name: "Skicka" });
  await expect(send).toBeDisabled();

  await dialog.getByLabel("Vad skulle göra Livskoll bättre för dig?").fill("Att kunna dela inköpslistan med Anna.");
  await send.click();
  await expect(dialog.getByRole("heading", { name: /^Tack! Det hamnar hos .+\.$/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Klar" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/hjalp#inkopslista$/);

  const rows = await sentRows();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ kind: "idea", body: "Att kunna dela inköpslistan med Anna.", area: "inkopslista", page: "/lista", stars: null, read_at: null });
  expect(rows[0]!.app_version).toMatch(/^\d+\.\d+\.\d+/);
});

test("Betygsätt Livskoll asks what could be better at two stars and sends the rating", async ({ page }) => {
  await page.goto("/hjalp");
  await page.getByTestId("feedback-rate").filter({ visible: true }).click();
  const dialog = sheet(page, "Betygsätt Livskoll");
  await expect(dialog.getByRole("button", { name: "Skicka" })).toBeDisabled();
  await dialog.getByRole("radio", { name: "2 av 5, Sådär" }).click();
  await expect(dialog.getByText("Sådär", { exact: true })).toBeVisible();
  await dialog.getByLabel("Vad kan bli bättre?").fill("Det tar lång tid när jag fotar kylen.");
  await dialog.getByRole("button", { name: "Skicka" }).click();
  await expect(dialog.getByRole("heading", { name: "Tack för ditt betyg." })).toBeVisible();
  await dialog.getByRole("button", { name: "Klar" }).click();
  await expect(page).toHaveURL(/\/hjalp$/);
  expect(await sentRows()).toMatchObject([{ kind: "rating", stars: 2, body: "Det tar lång tid när jag fotar kylen.", area: null }]);
});

test("a search without a hit offers Föreslå with the word, and Något som inte funkar? has its own question", async ({ page }) => {
  await page.goto("/hjalp#matvaror");
  // The area from the address is chosen once the page has hydrated; a field typed in before would be made anew.
  await expect(page.getByRole("group", { name: "Område" }).filter({ visible: true }).getByRole("button", { name: "Matvaror" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("searchbox", { name: "Sök i hjälpen" }).filter({ visible: true }).fill("zebrafink");
  await page.getByRole("link", { name: "Berätta vad du letar efter" }).filter({ visible: true }).click();
  await expect(sheet(page, "Föreslå en funktion").getByRole("textbox")).toHaveValue("zebrafink");
  await sheet(page, "Föreslå en funktion").getByRole("button", { name: "Avbryt" }).click();
  await expect(page).not.toHaveURL(/tyck=/);

  await page.goto("/hjalp?tyck=problem#matvaror");
  const problem = sheet(page, "Något som inte funkar?");
  await expect(problem.getByLabel("Vad hände? Vad hade du väntat dig?")).toBeVisible();
  await expect(problem.getByRole("button", { name: "Matvaror" })).toHaveAttribute("aria-pressed", "true");
});

test("the app never asks for a rating by itself", async ({ page }) => {
  for (const path of ["/recept", "/lista", "/hemma", "/hjalp", "/installningar"]) {
    await page.goto(path);
    await expect(page.getByRole("dialog", { name: "Betygsätt Livskoll" })).toHaveCount(0);
  }
});

test.describe("the owner's inbox", () => {
  test.beforeAll(async () => {
    const { error } = await adminClient().from("app_owner").upsert({ user_id: userId });
    if (error) throw error;
  });

  test.afterAll(async () => {
    await adminClient().from("app_owner").delete().eq("user_id", userId);
  });

  test("Appens ägare shows Inkorg with the count of new; the inbox shows the average, filters and marks read", async ({ page }) => {
    const minute = 60_000;
    await adminClient()
      .from("feedback")
      .insert([
        { user_id: userId, kind: "idea", body: "Sortera recepten efter tillagningstid.", area: "recept", page: "/recept", app_version: "0.1.0", created_at: new Date(Date.now() - 3 * minute).toISOString() },
        { user_id: userId, kind: "rating", stars: 4, body: "", page: "/hjalp", app_version: "0.1.0", created_at: new Date(Date.now() - 2 * minute).toISOString() },
        { user_id: userId, kind: "problem", body: "Ångra-knappen försvann för fort.", area: "matvaror", page: "/hemma", app_version: "0.1.0", created_at: new Date(Date.now() - minute).toISOString() },
      ]);

    // The owner sees everyone's messages, so the counts are those in the database, not only this user's.
    const unread = await adminClient().from("feedback").select("id", { count: "exact", head: true }).is("read_at", null);
    await page.goto("/installningar");
    const owner = page.getByRole("list", { name: "Appens ägare" }).filter({ visible: true });
    await expect(owner.getByRole("link", { name: /Inkorg/ })).toContainText(`${unread.count} ${unread.count === 1 ? "ny" : "nya"}`);
    await owner.getByRole("link", { name: /Inkorg/ }).click();
    await expect(page).toHaveURL(/\/installningar\/inkorg$/);

    await expect(page.getByTestId("inbox-average").filter({ visible: true })).toContainText(/\d,\d.*Snittbetyg, \d+ betyg senaste 30 dagarna/);
    const fresh = page.getByRole("list", { name: "Nya" }).filter({ visible: true });
    await expect(fresh.getByText("Sortera recepten efter tillagningstid.")).toBeVisible();
    await expect(fresh.getByText("Ångra-knappen försvann för fort.")).toBeVisible();
    const fel = page.getByRole("button", { name: /^Fel \d+$/ }).filter({ visible: true });
    await fel.click();
    await expect(fresh.getByText("Ångra-knappen försvann för fort.")).toBeVisible();
    await expect(fresh.getByText("Sortera recepten efter tillagningstid.")).toHaveCount(0);
    await fel.click();

    await fresh.getByText("Sortera recepten efter tillagningstid.").click();
    const detail = page.getByRole("dialog").filter({ visible: true });
    await expect(detail).toContainText("/recept");
    await expect(detail).toContainText("0.1.0");
    await detail.getByRole("button", { name: "Klar" }).click();
    await expect(page.getByRole("list", { name: "Tidigare" }).filter({ visible: true }).getByText("Sortera recepten efter tillagningstid.")).toBeVisible();
    await expect.poll(async () => (await sentRows()).filter((row) => row.read_at !== null).length).toBe(1);
  });
});

test.describe("anyone else", () => {
  test.use({ storageState: settingsStorageState });

  test("sees no Appens ägare group and no inbox", async ({ page }) => {
    await page.goto("/installningar");
    await expect(page.getByRole("heading", { name: "Hushåll" }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Appens ägare" })).toHaveCount(0);
    // The page streams, so the answer is the not-found page rather than a 404 status.
    await page.goto("/installningar/inkorg");
    await expect(page.getByRole("heading", { name: "Sidan finns inte" }).filter({ visible: true })).toBeVisible();
    await expect(page.getByTestId("inbox-average")).toHaveCount(0);
  });
});
