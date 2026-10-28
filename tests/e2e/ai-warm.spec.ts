import { expect, type Page, type Request, test } from "@playwright/test";
import { aiWarmStorageState } from "./support";

// Story 12.2: Lagersaldo and Recept ask the server to wake the model when
// they are shown, at most once per kind in five minutes per tab. The spec has
// an E2E user of its own (aiWarmEmail). With AI_PROVIDER=mock the server
// answers 202 and wakes nothing. Nothing is ever shown.

test.use({ storageState: aiWarmStorageState, viewport: { width: 375, height: 812 } });

/** Every warm-up the page asks for from now on, by kind. */
function watchWarmUps(page: Page): string[] {
  const kinds: string[] = [];
  page.on("request", (request) => {
    if (isWarmUp(request)) kinds.push((request.postDataJSON() as { kind: string }).kind);
  });
  return kinds;
}

function isWarmUp(request: Request): boolean {
  return request.method() === "POST" && new URL(request.url()).pathname === "/api/ai/warm";
}

const heading = (page: Page, name: string) => page.getByRole("heading", { level: 1, name }).filter({ visible: true });
const tab = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Huvudmeny" }).getByRole("link", { name: new RegExp(`^${name}`) });

/** Waits until the page has nothing more on its way, so a warm-up it would ask for has been asked for. */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
}

test("Lagersaldo wakes the model for a photo once, and not again when it is opened again", async ({ page }) => {
  const warmUps = watchWarmUps(page);
  const sent = page.waitForRequest(isWarmUp);
  await page.goto("/hemma");
  await expect(heading(page, "Lagersaldo")).toBeVisible();

  const request = await sent;
  expect(request.postDataJSON()).toEqual({ kind: "image" });
  expect(request.headers()["content-type"]).toBe("application/json");
  const response = await request.response();
  // 202 without a body (route.test.ts checks the body; the browser may have moved on before it is read).
  expect(response?.status()).toBe(202);

  // Opened again in the same tab: a new page load, the same session.
  await page.goto("/hemma");
  await expect(heading(page, "Lagersaldo")).toBeVisible();
  await settle(page);
  expect(warmUps).toEqual(["image"]);

  // Recept asks for its own kind; back on Lagersaldo (shown again after Activity), nothing new.
  await tab(page, "Recept").click();
  await expect(heading(page, "Recept")).toBeVisible();
  await expect.poll(() => warmUps).toEqual(["image", "text"]);
  await tab(page, "Lagersaldo").click();
  await expect(heading(page, "Lagersaldo")).toBeVisible();
  await settle(page);
  expect(warmUps).toEqual(["image", "text"]);
});

test("Recept wakes the model for the text flows, and shows nothing of it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const sent = page.waitForRequest(isWarmUp);
  await page.goto("/recept");
  await expect(heading(page, "Recept")).toBeVisible();

  const request = await sent;
  expect(request.postDataJSON()).toEqual({ kind: "text" });
  expect((await request.response())?.status()).toBe(202);
  await expect(page.getByRole("status").filter({ hasText: /AI|modell/i })).toHaveCount(0);
  expect(errors).toEqual([]);
});
