import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import {
  adminClient,
  appInstallEmail,
  deleteMailsTo,
  magicLinkPath,
  openMagicLink,
  mailsTo,
  outsiderEmail,
  recreateE2eUser,
  thisMonday,
} from "./support";

// Story 11.6: Matkoll on the home screen. The manifest and the icons load
// without a session, <head> has what iPhone needs, the code from the e-mail
// signs in (the app on the home screen does not share cookies with Safari,
// where the link opens), and every page under a tab has a visible Tillbaka.
// The spec has an E2E user of its own (appInstallEmail), made again before
// each test that signs in, so a retry starts over, also with Auth's limits.

const mobile = { width: 375, height: 812 };
const sentText = "Vi har skickat en länk och en kod till din e-post.";
const invalidText = "Koden stämmer inte eller har gått ut. Skicka en ny länk.";
// The session cookie (in chunks); not the PKCE verifier "Skicka länk" leaves.
const authCookie = /^sb-.+-auth-token(\.\d+)?$/;

/** Width and height from a PNG's IHDR chunk. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * A fresh code for `email` and the link with the same token, from
 * auth.admin.generateLink: the same token Supabase puts in the e-mail as
 * {{ .Token }} and {{ .TokenHash }}, and it replaces the one mailed before.
 * The local Auth keeps the template it read when it started, so the code is
 * not read from Mailpit; tests/design/email-template.test.ts checks the
 * template. Never logged.
 */
async function freshCode(email: string): Promise<{ code: string; link: string }> {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const params = new URLSearchParams({ token_hash: data.properties.hashed_token, type: "email", next: "/recept" });
  return { code: data.properties.email_otp, link: `/auth/confirm?${params}` };
}

/** Auth's last sign-in time for `email`: it changes only when Supabase accepted a code or link. */
async function lastSignIn(email: string): Promise<string | undefined> {
  const { data, error } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  return data.users.find((user) => user.email === email)?.last_sign_in_at;
}

async function authCookies(context: BrowserContext) {
  return (await context.cookies()).filter((cookie) => authCookie.test(cookie.name));
}

const codeField = (page: Page) => page.getByRole("textbox", { name: "Kod från mejlet" });

test.describe("without a session", () => {
  test("the manifest answers 200 with Matkoll's fields", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/manifest+json");
    expect(await response.json()).toEqual({
      id: "/",
      name: "Livskoll",
      short_name: "Livskoll",
      description: "Recept, matsedel, inköpslista och det du har hemma.",
      lang: "sv",
      start_url: "/recept",
      scope: "/",
      share_target: { action: "/recept/importera", method: "GET", params: { url: "url", text: "text" } },
      shortcuts: [{ name: "Lägg till vara", short_name: "Lägg till", url: "/lista/lagg-till" }],
      display: "standalone",
      background_color: "#F5F7F4",
      theme_color: "#F5F7F4",
      icons: [
        { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    });
  });

  test("the icons in the manifest and in <head> answer 200 with PNGs of their size", async ({ request, page }) => {
    const manifest = (await (await request.get("/manifest.webmanifest")).json()) as {
      icons: { src: string; sizes: string }[];
    };
    // <head> of the login page, which needs no session either.
    await page.goto("/logga-in");
    const headIcons = await page
      .locator('head link[rel="icon"][type="image/png"], head link[rel="apple-touch-icon"]')
      .evaluateAll((links) => links.map((link) => ({ src: link.getAttribute("href")!, sizes: link.getAttribute("sizes")! })));
    expect(headIcons.map((icon) => icon.src.replace(/\?.*$/, "")).sort()).toEqual(
      ["/apple-icon", "/icon/192", "/icon/512", "/icon/maskable"].sort(),
    );

    for (const icon of [...manifest.icons, ...headIcons]) {
      const response = await request.get(icon.src, { maxRedirects: 0 });
      expect(response.status(), icon.src).toBe(200);
      expect(response.headers()["content-type"], icon.src).toBe("image/png");
      const [width, height] = icon.sizes.split("x").map(Number);
      expect(pngSize(await response.body()), icon.src).toEqual({ width, height });
    }
  });

  test("an unknown icon is not found", async ({ request }) => {
    const response = await request.get("/icon/zzz", { maxRedirects: 0 });
    expect(response.status()).toBe(404);
  });

  test("a page still answers 307 to the login page", async ({ request }) => {
    for (const path of ["/recept", "/icons", "/icon/192/extra", "/recept/icon", "/manifest", "/recept/x.json"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(307);
      expect(response.headers().location, path).toMatch(/\/logga-in\?next=/);
    }
    const response = await request.get("/recept", { maxRedirects: 0 });
    expect(response.headers().location).toMatch(/\/logga-in\?next=%2Frecept$/);
  });
});

test.describe("<head>", () => {
  test("has the manifest, the Apple icon and title, the status bar style and both theme colours", async ({ page }) => {
    await recreateE2eUser(appInstallEmail);
    await openMagicLink(page, await magicLinkPath(appInstallEmail, "/recept"));
    await expect(page).toHaveURL(/\/recept$/);
    const head = page.locator("head");
    await expect(head.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
    await expect(head.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /^\/apple-icon(\?|$)/);
    await expect(head.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("sizes", "180x180");
    await expect(head.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "Livskoll");
    await expect(head.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute("content", "default");
    await expect(head.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
    const themeColors = await head
      .locator('meta[name="theme-color"]')
      .evaluateAll((metas) => metas.map((meta) => [meta.getAttribute("media"), meta.getAttribute("content")]));
    expect(themeColors).toEqual([
      ["(prefers-color-scheme: light)", "rgb(245 247 244)"],
      ["(prefers-color-scheme: dark)", "rgb(18 23 20)"],
    ]);
  });
});

test.describe("signing in with the code", () => {
  test.use({ viewport: mobile });

  test("a wrong code is refused, the right one signs in, and the link with the same token is then used up", async ({
    page,
    context,
    browser,
  }) => {
    await recreateE2eUser(appInstallEmail);
    await deleteMailsTo(appInstallEmail);
    await page.goto("/recept?flik=x");
    await expect(page).toHaveURL(/\/logga-in\?next=%2Frecept%3Fflik%3Dx$/);
    await expect(codeField(page)).toHaveCount(0);
    await page.getByLabel("E-postadress").fill(appInstallEmail);
    await page.getByRole("button", { name: "Skicka länk" }).click();
    await expect(page.getByRole("status")).toHaveText(sentText);
    await expect(page.getByLabel("E-postadress")).toHaveValue(appInstallEmail);
    await expect(codeField(page)).toHaveAttribute("inputmode", "numeric");
    await expect(codeField(page)).toHaveAttribute("autocomplete", "one-time-code");
    expect(await codeField(page).evaluate((input) => parseFloat(getComputedStyle(input).fontSize))).toBeGreaterThanOrEqual(16);

    // Supabase sent the mail; the code comes from a fresh token (see freshCode).
    await expect.poll(async () => (await mailsTo(appInstallEmail)).length, { timeout: 10_000 }).toBe(1);
    const { code, link } = await freshCode(appInstallEmail);

    // Not six digits: the same answer, without asking the server.
    await codeField(page).fill("12a45");
    await page.getByRole("button", { name: "Logga in" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(invalidText);

    // A wrong code: the same answer, the field stays and there is no session.
    const wrong = `${(Number(code[0]) + 1) % 10}${code.slice(1)}`;
    await codeField(page).fill(wrong);
    await page.getByRole("button", { name: "Logga in" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(invalidText);
    await expect(codeField(page)).toHaveValue(wrong);
    await expect(page).toHaveURL(/\/logga-in/);
    expect(await authCookies(context)).toEqual([]);

    await codeField(page).fill(code);
    await page.getByRole("button", { name: "Logga in" }).click();
    await expect(page).toHaveURL(/\/recept\?flik=x$/);
    await expect(page.getByRole("heading", { level: 1, name: "Recept" })).toBeVisible();
    expect((await authCookies(context)).length).toBeGreaterThan(0);

    // The code and the link are one token: once the code is used, so is the link.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await openMagicLink(otherPage, link);
    await expect(otherPage).toHaveURL(/\/logga-in\?fel=lank/);
    await other.close();
  });

  test("a valid code for an address outside ALLOWED_EMAILS gives the same answer and no session", async ({ page, context }) => {
    const { code } = await freshCode(outsiderEmail);
    const before = await lastSignIn(outsiderEmail);
    await page.goto("/logga-in");
    await page.getByLabel("E-postadress").fill(outsiderEmail);
    await page.getByRole("button", { name: "Skicka länk" }).click();
    await expect(page.getByRole("status")).toHaveText(sentText);
    await codeField(page).fill(code);
    await page.getByRole("button", { name: "Logga in" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(invalidText);
    await expect(page).toHaveURL(/\/logga-in$/);
    expect(await authCookies(context)).toEqual([]);
    // The allowlist refused it before Supabase was asked: no sign-in was recorded.
    expect(await lastSignIn(outsiderEmail)).toBe(before);
  });
});

test.describe("Tillbaka on every page under a tab", () => {
  test.use({ viewport: mobile });
  const title = "Snabb tomatsoppa";
  let recipeId = "";

  test.beforeEach(async ({ page }) => {
    const userId = await recreateE2eUser(appInstallEmail);
    const admin = adminClient();
    const recipe = await admin
      .from("recipe")
      .insert({ user_id: userId, title, original_servings: 2, source_kind: "text", is_favorite: true })
      .select("id")
      .single();
    if (recipe.error) throw recipe.error;
    recipeId = (recipe.data as { id: string }).id;
    const plan = await admin.from("meal_plan").insert({ user_id: userId, name: "Vecka 44", is_current: true, week_start: thisMonday() }).select("id").single();
    if (plan.error) throw plan.error;
    const dish = await admin.from("meal_plan_recipe").insert({
      user_id: userId,
      meal_plan_id: (plan.data as { id: string }).id,
      recipe_id: recipeId,
      recipe_title: title,
      servings: 2,
      position: 0,
    });
    if (dish.error) throw dish.error;
    await openMagicLink(page, await magicLinkPath(appInstallEmail, "/recept"));
    await expect(page).toHaveURL(/\/recept$/);
  });

  async function goBack(page: Page) {
    const back = page.getByRole("main").getByRole("link", { name: "Tillbaka" }).filter({ visible: true });
    await expect(back).toBeVisible();
    const box = await back.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await back.click();
  }

  test("the recipe view leads back to Recept with the filter kept", async ({ page }) => {
    await page.getByRole("radio", { name: "Favoriter" }).click();
    await expect(page.getByRole("radio", { name: "Favoriter" })).toBeChecked();
    await page.getByTestId("recipe-card").filter({ hasText: title }).getByRole("link").click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await goBack(page);
    await expect(page).toHaveURL(/\/recept$/);
    await expect(page.getByRole("radio", { name: "Favoriter" }).filter({ visible: true })).toBeChecked();
  });

  test("a recipe opened from Matsedel leads back to Matsedel", async ({ page }) => {
    await page.getByRole("navigation", { name: "Huvudmeny" }).getByRole("link", { name: "Matsedel" }).click();
    await expect(page).toHaveURL(/\/matsedel$/);
    await page.getByRole("main").getByRole("link", { name: title }).filter({ visible: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await goBack(page);
    await expect(page).toHaveURL(/\/matsedel$/);
  });

  test("a recipe opened by its address leads to Recept", async ({ page }) => {
    await page.goto(`/recept/${recipeId}`);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await goBack(page);
    await expect(page).toHaveURL(/\/recept$/);
  });

  test("Inställningar and Tidigare matsedlar lead to the page above", async ({ page }) => {
    await page.goto("/installningar");
    await expect(page.getByRole("heading", { level: 1, name: "Inställningar" })).toBeVisible();
    await goBack(page);
    await expect(page).toHaveURL(/\/recept$/);

    await page.goto("/matsedel/tidigare");
    await expect(page.getByRole("heading", { level: 1, name: "Tidigare matsedlar" })).toBeVisible();
    await goBack(page);
    await expect(page).toHaveURL(/\/matsedel$/);
  });
});

test.describe("Inställningar on an iPhone", () => {
  test.use({
    viewport: mobile,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });

  test("says how to put Matkoll on the home screen in Safari", async ({ page }) => {
    await recreateE2eUser(appInstallEmail);
    await openMagicLink(page, await magicLinkPath(appInstallEmail, "/installningar/installera"));
    await expect(page).toHaveURL(/\/installningar\/installera$/);
    await expect(page.getByTestId("install-text")).toContainText("Tryck Dela i Safari och sedan Lägg till på hemskärmen.");
  });
});
