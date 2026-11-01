import { expect, type Page, test } from "@playwright/test";
import { adminClient, e2eUserId, magicLinkPath, openMagicLink, openSettingsViaAvatar, settingsEmail, settingsStorageState } from "./support";

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

test("the start page is grouped rows with values, and Receptsajter lists the active sites in alphabetical order with the field", async ({ page }) => {
  const errors = watchErrors(page);
  const off = await adminClient().from("recipe_site").update({ is_active: false }).eq("user_id", userId).eq("domain", "ica.se");
  expect(off.error).toBeNull();

  await page.goto("/recept");
  await openSettingsViaAvatar(page);
  await expect(page).toHaveURL(/\/installningar$/);
  await expect(page.getByRole("heading", { level: 1, name: "Inställningar" })).toBeVisible();
  for (const group of ["Konto", "Hushåll", "Recept", "AI", "Appen"]) {
    await expect(page.getByRole("heading", { level: 2, name: group, exact: true })).toBeVisible();
  }
  const row = (name: string | RegExp) => page.getByTestId("settings-row").filter({ hasText: name });
  await expect(row("Receptsajter")).toContainText("3 sajter");
  await expect(row("Boenden")).toContainText("Hemma");
  for (const name of ["Konto", "Boenden", "Butiker", "Receptsajter", "Spara i Livskoll", "Modell", "Installera appen", "Siri och genvägar", "Om Livskoll"]) {
    const link = name === "Konto" ? row(settingsEmail) : row(name);
    await expect(link).toBeVisible();
    expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  // The start page fits a phone screen without scrolling to Logga ut.
  const signOut = page.getByRole("button", { name: "Logga ut" });
  await expect(signOut).toBeInViewport();
  const width = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(width[0]).toBeLessThanOrEqual(width[1]);
  expect((await signOut.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await row("Receptsajter").click();
  await expect(page).toHaveURL(/\/installningar\/receptsajter$/);
  await expect(page.getByRole("heading", { level: 1, name: "Receptsajter" })).toBeVisible();
  await expectSites(page, ["arla.se", "koket.se", "tasteline.com"]);
  await expect(siteField(page)).toBeVisible();
  await expect(page.getByTestId("settings-menu")).toBeHidden();
  const remove = sitesList(page).getByRole("button", { name: "Ta bort koket.se" });
  const box = await remove.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box?.width).toBeGreaterThanOrEqual(44);

  // "‹ Inställningar" leads back to the start page.
  await page.getByRole("link", { name: "Inställningar" }).click();
  await expect(page).toHaveURL(/\/installningar$/);
  await expect(page.getByTestId("settings-menu")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the side menu leads to Inställningar on desktop, with the start page beside the chosen page", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/recept");
  await page.getByRole("navigation", { name: "Huvudmeny" }).getByRole("link", { name: "Inställningar" }).click();
  await expect(page).toHaveURL(/\/installningar$/);
  await expect(page.getByTestId("settings-menu").getByRole("button", { name: "Logga ut" })).toBeVisible();
  await page.getByTestId("settings-row").filter({ hasText: "Receptsajter" }).click();
  await expect(page).toHaveURL(/\/installningar\/receptsajter$/);
  await expectSites(page, startSites);
  // Both columns show: the list on the left, the page beside it.
  await expect(page.getByTestId("settings-menu")).toBeVisible();
  await expect(page.getByTestId("settings-page")).toBeVisible();
  await expect(page.getByTestId("settings-menu").getByRole("button", { name: "Logga ut" })).toBeVisible();
  const menu = await page.getByTestId("settings-menu").boundingBox();
  const content = await page.getByTestId("settings-page").boundingBox();
  expect(content!.x).toBeGreaterThan(menu!.x + menu!.width - 1);
});

test("the old anchors lead to the page that holds them now", async ({ page }) => {
  await page.goto("/installningar#spara-i-matkoll");
  await expect(page).toHaveURL(/\/installningar\/spara-i-matkoll$/);
  await expect(page.getByRole("heading", { level: 1, name: "Spara i Livskoll" })).toBeVisible();
  await page.goto("/installningar#godkanda-receptsajter");
  await expect(page).toHaveURL(/\/installningar\/receptsajter$/);
  await page.goto("/installningar#ai");
  await expect(page).toHaveURL(/\/installningar\/ai$/);
});

test("Konto shows the address and Byt lösenord mails the link from Story 17.2", async ({ page }) => {
  await page.goto("/installningar/konto");
  await expect(page.getByRole("heading", { level: 1, name: "Konto" })).toBeVisible();
  await expect(page.getByTestId("account-email")).toHaveText(settingsEmail);
  await page.getByRole("button", { name: "Byt lösenord" }).click();
  await expect(page.getByTestId("password-link-sent")).toContainText(settingsEmail);
});

test("adds a site from a whole address, and it turns an off site on again", async ({ page }) => {
  const errors = watchErrors(page);
  const off = await adminClient().from("recipe_site").update({ is_active: false }).eq("user_id", userId).eq("domain", "arla.se");
  expect(off.error).toBeNull();
  await page.goto("/installningar/receptsajter");
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
  await page.goto("/installningar/receptsajter");
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
  await page.goto("/installningar/receptsajter");
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

  await page.goto("/installningar/receptsajter");
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
  await openMagicLink(page, await magicLinkPath(settingsEmail, "/installningar/receptsajter"));
  await expect(page).toHaveURL(/\/installningar\/receptsajter$/);

  await sitesList(page).getByRole("button", { name: "Ta bort koket.se" }).click();
  await expect.poll(activeSites).toEqual(["arla.se", "ica.se", "tasteline.com"]);

  await page.goto("/installningar");
  await page.getByRole("button", { name: "Logga ut" }).click();
  await expect(page).toHaveURL(/\/logga-in$/);
  await expect(page.getByRole("heading", { level: 1, name: "Logga in" })).toBeVisible();
  const authCookies = (await context.cookies()).filter((cookie) => /^sb-.+-auth-token/.test(cookie.name));
  expect(authCookies).toEqual([]);

  // A new page asks for a sign-in.
  await page.goto("/recept");
  await expect(page).toHaveURL(/\/logga-in\?next=%2Frecept$/);

  // Signing in again runs ensure_user_defaults(), which leaves koket.se off.
  await openMagicLink(page, await magicLinkPath(settingsEmail, "/installningar/receptsajter"));
  await expect(page).toHaveURL(/\/installningar\/receptsajter$/);
  await expectSites(page, ["arla.se", "ica.se", "tasteline.com"]);
  await context.close();
});

test("Spara i Livskoll: one guide at a time; the bookmarklet and the iPhone address are built from this site's origin", async ({ page, baseURL }) => {
  await page.goto("/installningar/spara-i-matkoll");
  const section = page.getByTestId("save-to-matkoll");
  await expect(page.getByRole("heading", { level: 1, name: "Spara i Livskoll" })).toBeVisible();
  const origin = new URL(baseURL ?? page.url()).origin;
  // A desktop browser starts on Dator; the other guides are not shown.
  await expect(section.getByRole("radio", { name: "Dator" })).toBeChecked();
  const bookmarklet = section.getByTestId("bookmarklet");
  await expect(bookmarklet).toHaveAttribute("href", /^javascript:/);
  expect(await bookmarklet.getAttribute("href")).toContain(`${origin}/recept/importera?url=`);
  await expect(section.getByTestId("import-prefix")).toHaveCount(0);
  await section.getByRole("radio", { name: "iPhone" }).click();
  await expect(section.getByTestId("import-prefix")).toHaveText(`${origin}/recept/importera?url=`);
  await expect(section.getByTestId("bookmarklet")).toHaveCount(0);
  await section.getByRole("radio", { name: "Android" }).click();
  await expect(section.getByTestId("guide-android")).toBeVisible();
  await expect(section.getByTestId("guide-iphone")).toHaveCount(0);
  await expect(section.getByRole("link", { name: "godkända receptsajterna" })).toBeVisible();
});

test("Story 1.14: Importera recept lists the approved sites with new-tab links and leads to Spara i Livskoll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/recept");
  await page.getByRole("button", { name: "Importera recept" }).first().click();
  const section = page.getByTestId("find-recipes");
  await expect(section.getByRole("heading", { name: "Hitta recept på nätet" })).toBeVisible();
  for (const domain of startSites) {
    const link = section.getByRole("link", { name: `Öppna ${domain} i en ny flik` });
    await expect(link).toHaveAttribute("href", `https://${domain}/`);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
    expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  await section.getByRole("button", { name: "här" }).click();
  await expect(page.getByLabel("Länk till receptet")).toBeFocused();
  await section.getByRole("link", { name: "Spara i Livskoll" }).click();
  await expect(page).toHaveURL(/\/installningar\/spara-i-matkoll$/);
  await expect(page.getByTestId("guide-computer")).toContainText("⌘⇧B");
  await expect(page.getByRole("heading", { level: 1, name: "Spara i Livskoll" })).toBeInViewport();
});

test("Story 17.5: the page AI saves the choice, which is read again after a reload", async ({ page }) => {
  const errors = watchErrors(page);
  await adminClient().from("ai_setting").delete().eq("user_id", userId);
  await page.goto("/installningar/ai");
  const section = page.getByTestId("ai-settings");
  await expect(page.getByRole("heading", { level: 1, name: "AI", exact: true })).toBeVisible();
  const claude = section.getByRole("radio", { name: "Claude" });
  await expect(section.getByRole("radio", { name: "Qwen lokalt" })).toBeVisible();
  // Without ANTHROPIC_API_KEY (the server's environment) Claude is off with the key text; with it, Claude can be picked.
  const keyMissing = page.getByTestId("ai-claude-missing");
  // Claude is disabled before hydration too, so wait until one of the two states is settled.
  await expect(async () => {
    expect((await keyMissing.count()) > 0 || (await claude.isEnabled())).toBe(true);
  }).toPass();
  if ((await keyMissing.count()) > 0) {
    await expect(page.getByTestId("ai-claude-missing")).toHaveText("Lägg in ANTHROPIC_API_KEY i .env.local och starta om");
  } else {
    // With the mock provider as the default, Claude is available but not chosen yet.
    if (!(await claude.isChecked())) await claude.click();
    await expect(section.getByRole("radio", { name: "Haiku 5.5" })).toBeChecked();
    await section.getByRole("radio", { name: "Sonnet 5.5" }).click();
    await section.getByRole("radio", { name: "Hög" }).click();
    await expect(toast(page)).toContainText("Sparat");
    await expect
      .poll(async () => (await adminClient().from("ai_setting").select("model, effort").eq("user_id", userId)).data)
      .toEqual([{ model: "claude-sonnet-5-5", effort: "high" }]);
    await page.reload();
    await expect(section.getByRole("radio", { name: "Sonnet 5.5" })).toBeChecked();
    await expect(section.getByRole("radio", { name: "Hög" })).toBeChecked();
    await adminClient().from("ai_setting").delete().eq("user_id", userId);
  }
  expect(errors).toEqual([]);
});

test("Story 17.6: the start page's AI group and the page AI show this month's calls and cost, from the price table", async ({ page }) => {
  const errors = watchErrors(page);
  const admin = adminClient();
  await admin.from("ai_usage").delete().eq("user_id", userId);
  // Haiku 2M in and 100k out is $0.25, 2,50 kr; a local model and the mock are free; a call from 2020 is another month.
  const now = new Date().toISOString();
  const seeded = await admin.from("ai_usage").insert([
    { user_id: userId, model: "claude-haiku-5-5", input_tokens: 1_500_000, output_tokens: 60_000, created_at: now },
    { user_id: userId, model: "claude-haiku-5-5", input_tokens: 500_000, output_tokens: 40_000, created_at: now },
    { user_id: userId, model: "qwen/qwen3.6-35b-a3b", input_tokens: 9_000_000, output_tokens: 900_000, created_at: now },
    { user_id: userId, model: "mock", input_tokens: 0, output_tokens: 0, created_at: now },
    { user_id: userId, model: "claude-opus-5-5", input_tokens: 9_000_000, output_tokens: 900_000, created_at: "2020-03-10T10:00:00Z" },
  ]);
  expect(seeded.error).toBeNull();
  const month = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", month: "long" }).format(new Date());

  await page.goto("/installningar");
  const aiGroup = page.getByRole("list", { name: "AI", exact: true });
  await expect(aiGroup.getByText(`Kostnad i ${month}`)).toBeVisible();
  await expect(aiGroup.getByTestId("settings-value").filter({ hasText: "ca 2,50 kr" })).toBeVisible();

  await page.getByTestId("settings-row").filter({ hasText: "Modell" }).click();
  await expect(page).toHaveURL(/\/installningar\/ai$/);
  const usage = page.getByTestId("ai-usage");
  await expect(usage.getByRole("heading", { name: "Den här månaden" })).toBeVisible();
  await expect(usage.getByTestId("ai-usage-calls")).toHaveText("4");
  await expect(usage.getByTestId("ai-usage-cost")).toHaveText("ca 2,50 kr");
  const width = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(width[0]).toBeLessThanOrEqual(width[1]);

  await admin.from("ai_usage").delete().eq("user_id", userId);
  await page.reload();
  await expect(page.getByTestId("ai-usage-calls")).toHaveText("0");
  await expect(page.getByTestId("ai-usage-cost")).toHaveText("0 kr");
  expect(errors).toEqual([]);
});

// Story 17.9: Siri och genvägar. A personal key is made and shown once, adds items through the API, and
// stops working when revoked; the quick-add address opens "Lägg till egen vara" with focus in the field.
test("a personal key is shown once, adds items by POST /api/snabb and stops when revoked; the quick-add address opens the field", async ({ page, request }) => {
  const errors = watchErrors(page);
  const admin = adminClient();
  await admin.from("api_key").delete().eq("user_id", userId);
  await admin.from("shopping_custom_item").delete().eq("user_id", userId);
  await page.setViewportSize(mobile);

  await page.goto("/installningar");
  await page.getByTestId("settings-row").filter({ hasText: "Siri och genvägar" }).click();
  await expect(page).toHaveURL(/\/installningar\/siri$/);
  await expect(page.getByText("Inga nycklar än.")).toBeVisible();
  const shot = async (name: string) => {
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png`, fullPage: true });
  };
  await shot("siri-before");
  await page.getByRole("button", { name: "Skapa nyckel" }).click();
  const shown = page.getByTestId("new-key-value");
  await expect(shown).toBeVisible();
  const key = (await shown.textContent())!;
  expect(key).toMatch(/^lk_[A-Za-z0-9_-]{43}$/);
  await expect(page.getByTestId("shortcut-guide")).toContainText("Diktera text");
  await expect(page.getByTestId("api-key")).toContainText("Aldrig använd");
  await shot("siri-after");

  // Only the hash is stored.
  const stored = await admin.from("api_key").select("key_hash").eq("user_id", userId);
  expect(stored.data).toHaveLength(1);
  expect(stored.data![0]!.key_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(stored.data![0]!.key_hash).not.toContain(key);

  const post = (headers: Record<string, string>, text: string) =>
    request.post("/api/snabb", { headers: { "content-type": "application/json", ...headers }, data: { text } });
  const added = await post({ authorization: `Bearer ${key}` }, "mjölk och ägg");
  expect(added.status()).toBe(200);
  expect(await added.text()).toBe("La till: Mjölk, Ägg");
  expect((await post({ authorization: `Bearer ${key.slice(0, -1)}x` }, "spöke")).status()).toBe(401);
  expect((await post({}, "spöke")).status()).toBe(401);
  const items = await admin.from("shopping_custom_item").select("label, meal_plan_id").eq("user_id", userId).order("created_at");
  expect(items.data).toEqual([
    { label: "Mjölk", meal_plan_id: null },
    { label: "Ägg", meal_plan_id: null },
  ]);

  // The quick-add address: the sheet is open and the text field has focus.
  await page.goto("/lista/lagg-till");
  const sheet = page.getByRole("dialog", { name: "Lägg till egen vara" });
  await expect(sheet).toBeVisible();
  await shot("quick-add");
  await expect(sheet.getByRole("combobox").or(sheet.getByRole("textbox")).first()).toBeFocused();

  // Revoke: the key stops working at once, and the page lists it as revoked.
  await page.goto("/installningar/siri");
  await expect(page.getByTestId("api-key")).toContainText("Senast använd");
  await page.getByRole("button", { name: /^Återkalla nyckeln/ }).click();
  await expect(page.getByTestId("api-key-revoked")).toBeVisible();
  expect((await post({ authorization: `Bearer ${key}` }, "kaffe")).status()).toBe(401);
  await admin.from("api_key").delete().eq("user_id", userId);
  await admin.from("shopping_custom_item").delete().eq("user_id", userId);
  expect(errors).toEqual([]);
});
