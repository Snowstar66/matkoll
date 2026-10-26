import { type BrowserContext, expect, test } from "@playwright/test";
import {
  adminClient,
  deleteMailsTo,
  e2eEmail,
  magicLinkPath,
  mailHtml,
  mailsTo,
  outsiderEmail,
  outsiderStorageState,
  userStorageState,
} from "./support";

const sentText = "Om adressen har åtkomst får du en länk";
// Shown only once the page has checked the session (inside <Suspense>).
const emptyLibrary = "Inga recept än.";

// The tests in this file run in order (the default). They share the E2E user, and a
// new magic link for a user replaces the previous one, so they must not run in parallel.

test.describe("without a session", () => {
  test("a page answers 307 to the login page with next", async ({ request }) => {
    const response = await request.get("/recept", { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toMatch(/\/logga-in\?next=%2Frecept$/);
  });

  test("next keeps the query string", async ({ request }) => {
    const response = await request.get("/recept?flik=x", { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toMatch(/\/logga-in\?next=%2Frecept%3Fflik%3Dx$/);
  });

  test("the start page leads to the login page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/logga-in\?next=%2Frecept$/);
    await expect(page.getByRole("heading", { name: "Logga in" })).toBeVisible();
  });

  test("an invalid address gets a validation message", async ({ page }) => {
    await page.goto("/logga-in");
    await page.getByLabel("E-postadress").fill("inte-en-adress");
    await page.getByRole("button", { name: "Skicka länk" }).click();
    await expect(page.getByText("Ange en giltig e-postadress.")).toBeVisible();
    await expect(page.getByText(sentText)).toHaveCount(0);
  });

  test("an allowed address gets a link that signs in, even in another browser", async ({ page, browser, baseURL }) => {
    await deleteMailsTo(e2eEmail);
    await page.goto("/recept?flik=x");
    await expect(page).toHaveURL(/\/logga-in\?next=%2Frecept%3Fflik%3Dx$/);
    await page.getByLabel("E-postadress").fill(e2eEmail);
    await page.getByRole("button", { name: "Skicka länk" }).click();
    await expect(page.getByText(sentText)).toBeVisible();

    await expect.poll(async () => (await mailsTo(e2eEmail)).length, { timeout: 10_000 }).toBe(1);
    const [mail] = await mailsTo(e2eEmail);
    const href = (await mailHtml(mail.ID)).match(/href="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
    expect(href).toBeDefined();
    const link = new URL(href!);
    expect(`${link.origin}${link.pathname}`).toBe(`${baseURL}/auth/confirm`);
    expect(link.searchParams.get("type")).toBe("email");
    expect(link.searchParams.get("next")).toBe("/recept?flik=x");

    const otherBrowser = await browser.newContext();
    const otherPage = await otherBrowser.newPage();
    await otherPage.goto(href!);
    await expect(otherPage).toHaveURL(/\/recept\?flik=x$/);
    await expect(otherPage.getByText(emptyLibrary)).toBeVisible();
    await otherBrowser.close();
  });

  test("an address outside the list gets the same answer, no mail and no user", async ({ page }) => {
    const stranger = `okand-${Date.now()}@matkoll.test`;
    await page.goto("/logga-in");
    await page.getByLabel("E-postadress").fill(stranger);
    await page.getByRole("button", { name: "Skicka länk" }).click();
    await expect(page.getByText(sentText)).toBeVisible();

    await page.waitForTimeout(1_000);
    expect(await mailsTo(stranger)).toHaveLength(0);
    const { data } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
    expect(data.users.filter((user) => user.email === stranger)).toHaveLength(0);
  });

  test("an invalid or used link leads to the login page with an explanation", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=ogiltig&type=email&next=/recept");
    await expect(page).toHaveURL(/\/logga-in\?fel=lank&next=%2Frecept$/);
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Länken har gått ut eller redan använts. Be om en ny.");
  });

  test("a valid link for an address outside ALLOWED_EMAILS gives no session", async ({ page, context }) => {
    await page.goto(await magicLinkPath(outsiderEmail, "/recept"));
    await expect(page).toHaveURL(/\/logga-in\?fel=atkomst$/);
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Adressen har inte åtkomst till Matkoll.");
    const authCookies = (await context.cookies()).filter((cookie) => /^sb-.+-auth-token/.test(cookie.name));
    expect(authCookies).toEqual([]);
  });

  test("a link keeps a next with a query string", async ({ request, baseURL }) => {
    const response = await request.get(await magicLinkPath(e2eEmail, "/recept?flik=x"), { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(new URL(response.headers().location, baseURL).toString()).toBe(`${baseURL}/recept?flik=x`);
  });

  for (const next of ["//evil.com", "https://evil.com", "/\\evil.com"]) {
    test(`an unsafe next (${next}) is ignored`, async ({ request, baseURL }) => {
      const response = await request.get(await magicLinkPath(e2eEmail, next), { maxRedirects: 0 });
      expect(response.status()).toBe(307);
      expect(new URL(response.headers().location, baseURL).toString()).toBe(`${baseURL}/recept`);
    });
  }
});

test.describe("signed in", () => {
  test.use({ storageState: userStorageState });

  test("the start page is the recipe page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/recept$/);
    await expect(page.getByRole("heading", { level: 1, name: "Recept" })).toBeVisible();
    await expect(page.getByText(emptyLibrary)).toBeVisible();
  });
});

test.describe("session for an address outside ALLOWED_EMAILS", () => {
  test.use({ storageState: outsiderStorageState });

  for (const path of ["/recept", "/matsedel", "/lista", "/hemma", "/installningar"]) {
    test(`${path} sends the user to the login page`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/logga-in\\?next=${encodeURIComponent(path)}$`));
      await expect(page.getByRole("heading", { level: 1, name: "Logga in" })).toBeVisible();
      await expect(page.getByText(emptyLibrary)).toHaveCount(0);
    });
  }

  test("/hemma?plats=frys keeps the location in next", async ({ page }) => {
    await page.goto("/hemma?plats=frys");
    await expect(page).toHaveURL(/\/logga-in\?next=%2Fhemma%3Fplats%3Dfrys$/);
    await expect(page.getByRole("heading", { level: 1, name: "Logga in" })).toBeVisible();
  });
});

test.describe("session refresh", () => {
  const authCookie = /^sb-.+-auth-token(\.\d+)?$/;

  async function sessionCookie(context: BrowserContext) {
    const cookies = (await context.cookies()).filter((cookie) => authCookie.test(cookie.name));
    cookies.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
    expect(cookies.length).toBeGreaterThan(0);
    const value = cookies.map((cookie) => cookie.value).join("");
    expect(value.startsWith("base64-")).toBe(true);
    const session = JSON.parse(Buffer.from(value.slice("base64-".length), "base64url").toString("utf8"));
    return { first: cookies[0], session };
  }

  test("the proxy refreshes an expired access token and the user stays signed in", async ({ browser, baseURL }) => {
    // A session of its own, so the shared storage state keeps its refresh token.
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto(await magicLinkPath(e2eEmail, "/recept"));
    await expect(page).toHaveURL(/\/recept$/);

    const { first, session } = await sessionCookie(context);
    const expired = { ...session, expires_at: Math.floor(Date.now() / 1000) - 60 };
    await context.clearCookies({ name: authCookie });
    await context.addCookies([
      {
        ...first,
        name: first.name.replace(/\.\d+$/, ""),
        value: `base64-${Buffer.from(JSON.stringify(expired)).toString("base64url")}`,
      },
    ]);

    await page.reload();
    await expect(page).toHaveURL(/\/recept$/);
    await expect(page.getByText(emptyLibrary)).toBeVisible();

    const refreshed = await sessionCookie(context);
    expect(refreshed.session.access_token).not.toBe(session.access_token);
    expect(refreshed.session.expires_at).toBeGreaterThan(Date.now() / 1000);
    await context.close();
  });
});
