import { expect, type Page, test } from "@playwright/test";
import { adminClient, e2eUserId, magicLinkPath, openMagicLink, settingsEmail, settingsStorageState } from "./support";

// Story 1.12: Inställningar with the approved recipe sites and "Logga ut".
// The specs use a user of their own (settingsEmail): turning koket.se off and
// signing out must not reach the users of the other specs, which run in
// parallel. Each test starts from the start sites, all active.

const startSites = ["arla.se", "ica.se", "koket.se", "tasteline.com"];
const chowMein = "https://www.koket.se/chow-mein-med-lovbiff";
const mobile = { width: 390, height: 844 };

let userId = "";

/** Sets the user's sites to the start sites, all active, with the service role. */
async function resetSites() {
  const admin = adminClient();
  const removed = await admin.from("recipe_site").delete().eq("user_id", userId).not("domain", "in", `(${startSites.join(",")})`);
  if (removed.error) throw removed.error;
  const reset = await admin
    .from("recipe_site")
    .upsert(
      startSites.map((domain) => ({ user_id: userId, domain, is_active: true })),
      { onConflict: "user_id,domain" },
    );
  if (reset.error) throw reset.error;
}

async function activeSites(): Promise<string[]> {
  const { data, error } = await adminClient()
    .from("recipe_site")
    .select("domain")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("domain");
  if (error) throw error;
  return data.map((row) => row.domain);
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

const sitesList = (page: Page) => page.getByRole("list", { name: "Godkända receptsajter" });
const siteField = (page: Page) => page.getByLabel("Ny receptsajt");
const toast = (page: Page) => page.getByTestId("toast");

async function addSite(page: Page, input: string) {
  await siteField(page).fill(input);
  await page.getByRole("button", { name: "Lägg till", exact: true }).click();
}

async function expectSites(page: Page, sites: string[]) {
  await expect(sitesList(page).getByTestId("recipe-site")).toHaveText(sites.map((site) => new RegExp(`^${site}`)));
}

const importSheet = (page: Page) => page.getByRole("dialog", { name: "Importera recept" });

/** Imports `url` on the Länk tab of the import sheet. */
async function importLink(page: Page, url: string) {
  await page.goto("/recept");
  await page.locator("header").getByRole("button", { name: "Importera recept" }).click();
  await importSheet(page).getByLabel("Länk till receptet").fill(url);
  await importSheet(page).getByRole("button", { name: "Tolka" }).click();
}

// The tests share the user's sites, so they run one at a time even if the
// config turns on parallel tests.
test.describe.configure({ mode: "serial" });
test.use({ storageState: settingsStorageState, viewport: mobile });

test.beforeAll(async () => {
  userId = await e2eUserId(settingsEmail);
});

test.beforeEach(async () => {
  await resetSites();
});

test("lists the active sites in alphabetical order, with the field and Logga ut at the bottom", async ({ page }) => {
  const errors = watchErrors(page);
  const off = await adminClient().from("recipe_site").update({ is_active: false }).eq("user_id", userId).eq("domain", "ica.se");
  expect(off.error).toBeNull();

  await page.goto("/recept");
  await page.getByRole("main").getByRole("link", { name: "Inställningar" }).click();
  await expect(page).toHaveURL(/\/installningar$/);
  await expect(page.getByRole("heading", { level: 1, name: "Inställningar" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Godkända receptsajter" })).toBeVisible();
  await expectSites(page, ["arla.se", "koket.se", "tasteline.com"]);
  await expect(siteField(page)).toBeVisible();

  const signOut = page.getByRole("button", { name: "Logga ut" });
  const signOutBox = await signOut.boundingBox();
  const fieldBox = await siteField(page).boundingBox();
  expect(signOutBox!.y).toBeGreaterThan(fieldBox!.y);
  for (const target of [signOut, sitesList(page).getByRole("button", { name: "Ta bort koket.se" })]) {
    const box = await target.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  }
  expect(errors).toEqual([]);
});

test("the side menu leads to Inställningar on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/recept");
  await page.getByRole("navigation", { name: "Huvudmeny" }).getByRole("link", { name: "Inställningar" }).click();
  await expect(page).toHaveURL(/\/installningar$/);
  await expectSites(page, startSites);
  await expect(page.getByRole("button", { name: "Logga ut" })).toBeVisible();
});

test("adds a site from a whole address, and it turns an off site on again", async ({ page }) => {
  const errors = watchErrors(page);
  const off = await adminClient().from("recipe_site").update({ is_active: false }).eq("user_id", userId).eq("domain", "arla.se");
  expect(off.error).toBeNull();
  await page.goto("/installningar");
  await expectSites(page, ["ica.se", "koket.se", "tasteline.com"]);

  await addSite(page, "https://www.Arla.se/recept");
  await expectSites(page, startSites);
  await expect(siteField(page)).toHaveValue("");
  await expect(toast(page)).toHaveText("Lade till arla.se.");
  expect(await activeSites()).toEqual(startSites);

  // A site that was not there before.
  await addSite(page, "Example.org");
  await expectSites(page, ["arla.se", "example.org", "ica.se", "koket.se", "tasteline.com"]);
  expect(await activeSites()).toContain("example.org");
  expect(errors).toEqual([]);
});

test("refuses what is not a site, and a site that is there already", async ({ page }) => {
  await page.goto("/installningar");
  for (const input of ["inte en sajt", "localhost", "127.0.0.1"]) {
    await addSite(page, input);
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Ange en giltig webbadress, t.ex. koket.se.");
    await expect(siteField(page)).toHaveValue(input);
    await expect(siteField(page)).toHaveAttribute("aria-invalid", "true");
  }
  // Typing clears the message.
  await siteField(page).fill("koket");
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);

  await addSite(page, "koket.se");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("koket.se finns redan.");
  await expectSites(page, startSites);
  expect(await activeSites()).toEqual(startSites);
});

test("Ta bort turns koket.se off at once, so a link import from it is refused; Ångra turns it on again", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/installningar");
  await sitesList(page).getByRole("button", { name: "Ta bort koket.se" }).click();
  await expectSites(page, ["arla.se", "ica.se", "tasteline.com"]);
  await expect(toast(page)).toContainText("Tog bort koket.se.");
  await expect(toast(page).getByRole("button", { name: "Ångra" })).toBeVisible();
  await expect.poll(activeSites).toEqual(["arla.se", "ica.se", "tasteline.com"]);

  // Ångra within the 5 s.
  await toast(page).getByRole("button", { name: "Ångra" }).click();
  await expectSites(page, startSites);
  await expect.poll(activeSites).toEqual(startSites);

  // Removed again; this time the toast runs out.
  await sitesList(page).getByRole("button", { name: "Ta bort koket.se" }).click();
  await expect.poll(activeSites).toEqual(["arla.se", "ica.se", "tasteline.com"]);
  await expect(toast(page)).toHaveCount(0, { timeout: 8_000 });
  await page.reload();
  await expectSites(page, ["arla.se", "ica.se", "tasteline.com"]);
  expect(errors).toEqual([]);

  // The browser logs the import route's 422 itself, so errors are not checked after this.
  await importLink(page, chowMein);
  await expect(importSheet(page).getByRole("alert")).toHaveText("koket.se är inte en godkänd receptsajt.");
});

test("a site added again works for link import at once", async ({ page }) => {
  const off = await adminClient().from("recipe_site").update({ is_active: false }).eq("user_id", userId).eq("domain", "koket.se");
  expect(off.error).toBeNull();
  const start = () =>
    page.request.post("/api/ai/jobs", { data: { kind: "import", clientKey: crypto.randomUUID(), source: "url", url: chowMein } });
  const refused = await start();
  expect(refused.status()).toBe(422);

  await page.goto("/installningar");
  await addSite(page, chowMein);
  await expectSites(page, startSites);

  // A job now: 202 at once, and the draft when the mock has read the saved page.
  const response = await start();
  expect(response.status()).toBe(202);
  const { id } = (await response.json()).data.job as { id: string };
  await expect.poll(async () => (await page.request.get(`/api/ai/jobs/${id}`)).status(), { timeout: 20_000 }).toBe(200);
  const done = await page.request.get(`/api/ai/jobs/${id}`);
  expect(await done.json()).toMatchObject({ ok: true, data: { result: { draft: { title: "Chow mein med lövbiff" } } } });
});

test("Logga ut ends the session; a removed site stays removed after signing in again", async ({ browser, baseURL }) => {
  // A session of its own, so the shared storage state keeps its session.
  const context = await browser.newContext({ baseURL, viewport: mobile });
  const page = await context.newPage();
  await openMagicLink(page, await magicLinkPath(settingsEmail, "/installningar"));
  await expect(page).toHaveURL(/\/installningar$/);

  await sitesList(page).getByRole("button", { name: "Ta bort koket.se" }).click();
  await expect.poll(activeSites).toEqual(["arla.se", "ica.se", "tasteline.com"]);

  await page.getByRole("button", { name: "Logga ut" }).click();
  await expect(page).toHaveURL(/\/logga-in$/);
  await expect(page.getByRole("heading", { level: 1, name: "Logga in" })).toBeVisible();
  const authCookies = (await context.cookies()).filter((cookie) => /^sb-.+-auth-token/.test(cookie.name));
  expect(authCookies).toEqual([]);

  // A new page asks for a sign-in.
  await page.goto("/recept");
  await expect(page).toHaveURL(/\/logga-in\?next=%2Frecept$/);

  // Signing in again runs ensure_user_defaults(), which leaves koket.se off.
  await openMagicLink(page, await magicLinkPath(settingsEmail, "/installningar"));
  await expect(page).toHaveURL(/\/installningar$/);
  await expectSites(page, ["arla.se", "ica.se", "tasteline.com"]);
  await context.close();
});

test("Spara i Matkoll: the bookmarklet and the iPhone address are built from this site's origin", async ({ page, baseURL }) => {
  await page.goto("/installningar");
  const section = page.getByTestId("save-to-matkoll");
  await expect(section.getByRole("heading", { level: 2, name: "Spara i Matkoll" })).toBeVisible();
  const origin = new URL(baseURL ?? page.url()).origin;
  await expect(section.getByTestId("import-prefix")).toHaveText(`${origin}/recept/importera?url=`);
  const href = await section.getByTestId("bookmarklet").getAttribute("href");
  expect(href).toContain("javascript:");
  expect(href).toContain(`${origin}/recept/importera?url=`);
  await expect(section.getByRole("link", { name: "godkända receptsajterna" })).toBeVisible();
});
