import { type BrowserContext, expect, test } from "@playwright/test";
import {
  adminClient,
  deleteMailsTo,
  e2eEmail,
  magicLinkPath,
  openMagicLink,
  mailHtml,
  mailsTo,
  outsiderEmail,
  outsiderStorageState,
  sessionCookiesFor,
  userStorageState,
} from "./support";

const sentText = "Vi har skickat en länk och en kod till din e-post.";
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
    await openMagicLink(otherPage, href!);
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

  test("an address and password sign in, and the session is kept for months (Story 17.2)", async ({ browser, baseURL }) => {
    const password = `pw-${Date.now()}-lang`;
    const admin = adminClient();
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const user = data.users.find((candidate) => candidate.email === e2eEmail);
    const updated = await admin.auth.admin.updateUserById(user!.id, { password });
    expect(updated.error).toBeNull();

    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto("/recept?flik=x");
    await page.getByLabel("E-postadress").fill(e2eEmail);
    await page.getByLabel("Lösenord").fill(`${password}x`);
    await page.getByRole("button", { name: "Logga in", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("E-postadressen eller lösenordet stämmer inte.");

    await page.getByLabel("Lösenord").fill(password);
    await page.getByRole("button", { name: "Logga in", exact: true }).click();
    await expect(page).toHaveURL(/\/recept\?flik=x$/);
    const cookie = (await context.cookies()).find((candidate) => /^sb-.+-auth-token/.test(candidate.name));
    expect(cookie!.expires).toBeGreaterThan(Date.now() / 1000 + 60 * 24 * 60 * 60);
    await context.close();
  });

  test("an address outside the list gets the same sign-in answer", async ({ page }) => {
    const stranger = `okand-${Date.now()}@matkoll.test`;
    await page.goto("/logga-in");
    await page.getByLabel("E-postadress").fill(stranger);
    await page.getByLabel("Lösenord").fill("ett-langt-losenord");
    await page.getByRole("button", { name: "Logga in", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("E-postadressen eller lösenordet stämmer inte.");
    await expect(page.getByRole("button", { name: "Skapa konto" })).toHaveCount(0);
  });

  test("Välj lösenord mails a link for an allowed address and nothing for others", async ({ page }) => {
    const stranger = `okand-${Date.now()}@matkoll.test`;
    await deleteMailsTo(e2eEmail);
    for (const email of [e2eEmail, stranger]) {
      await page.goto("/logga-in");
      await page.getByLabel("E-postadress").fill(email);
      await page.getByRole("button", { name: "Första gången eller glömt lösenordet? Välj lösenord" }).click();
      await page.getByRole("button", { name: "Skicka länk för att välja lösenord" }).click();
      await expect(page.getByText("Om adressen har ett konto skickar vi ett mejl")).toBeVisible();
    }
    await expect.poll(async () => (await mailsTo(e2eEmail)).length, { timeout: 10_000 }).toBe(1);
    await page.waitForTimeout(500);
    expect(await mailsTo(stranger)).toHaveLength(0);
  });

  test("an invalid or used link leads to the login page with an explanation", async ({ page }) => {
    await openMagicLink(page, "/auth/confirm?token_hash=ogiltig&type=email&next=/recept");
    await expect(page).toHaveURL(/\/logga-in\?fel=lank&next=%2Frecept$/);
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Länken har gått ut eller redan använts. Be om en ny.");
  });

  test("a valid link for an address outside ALLOWED_EMAILS gives no session", async ({ page, context }) => {
    await openMagicLink(page, await magicLinkPath(outsiderEmail, "/recept"));
    await expect(page).toHaveURL(/\/logga-in\?fel=atkomst$/);
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Adressen har inte åtkomst till Livskoll.");
    const authCookies = (await context.cookies()).filter((cookie) => /^sb-.+-auth-token/.test(cookie.name));
    expect(authCookies).toEqual([]);
  });

  test("opening a link uses nothing up: only the button signs in (Story 11.6)", async ({ page, request }) => {
    // A mail scanner fetches the link; the page answers with the button and nothing more.
    const link = await magicLinkPath(e2eEmail, "/recept?flik=x");
    for (let i = 0; i < 2; i++) {
      const response = await request.get(link, { maxRedirects: 0 });
      expect(response.status()).toBe(200);
      expect(await response.text()).toContain("Logga in");
    }
    await page.goto(link);
    await expect(page).toHaveURL(/\/auth\/confirm\?/);
    await expect(page.getByRole("heading", { level: 1, name: "Logga in" })).toBeVisible();
    await page.getByRole("main").getByRole("button", { name: "Logga in" }).click();
    await expect(page).toHaveURL(/\/recept\?flik=x$/);
  });

  test("a link without a token leads to the login page without a button", async ({ page }) => {
    await page.goto("/auth/confirm?next=/matsedel");
    await expect(page).toHaveURL(/\/logga-in\?fel=lank&next=%2Fmatsedel$/);
  });

  for (const next of ["//evil.com", "https://evil.com", "/\\evil.com", "/%5Cevil.com"]) {
    test(`an unsafe next (${next}) is ignored`, async ({ page, baseURL }) => {
      await openMagicLink(page, await magicLinkPath(e2eEmail, next));
      await expect(page).toHaveURL(`${baseURL}/recept`);
    });
  }
});

test.describe("the privacy note (Story 17.2)", () => {
  test("shows once per device and Okej keeps it away", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL });
    // A session made outside the app, so nothing has answered the note yet on this device.
    const cookies = await sessionCookiesFor(e2eEmail);
    await context.addCookies(cookies.map((cookie) => ({ ...cookie, url: baseURL! })));
    const page = await context.newPage();
    await page.goto("/recept");
    await expect(page.getByText("Den som driver Livskoll kan tekniskt se kontots data.")).toBeVisible();
    await page.getByRole("button", { name: "Okej" }).click();
    await expect(page.getByText("Den som driver Livskoll")).toHaveCount(0);
    await page.goto("/matsedel");
    await expect(page.getByText("Den som driver Livskoll")).toHaveCount(0);
    await context.close();
  });
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
    await openMagicLink(page, await magicLinkPath(e2eEmail, "/recept"));
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
