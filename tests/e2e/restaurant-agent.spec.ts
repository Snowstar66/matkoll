import { expect, type Page, test } from "@playwright/test";
import { userStorageState } from "./support";

// Restaurangagenten (Tillval, off by default), the screens of PR 3: the card on Menyrådgivarens start (only with the
// Tillval on), the question screen (the phone's place is asked by itself when it shows, a refusal says how to turn it on and offers a retry) and the
// layout at 375 px and at the larger text. The search itself needs the backend of PR 2 and is covered by the component
// tests with a fake action.

const mobile = { width: 375, height: 812 };
test.use({ storageState: userStorageState, viewport: mobile });

async function optionsOn(page: Page, agent: boolean, size?: "xl", web = false) {
  await page.addInitScript(
    ([withAgent, textSize, withWeb]) => {
      localStorage.setItem("livskoll-option-menuAdvisor", "1");
      if (withAgent) localStorage.setItem("livskoll-option-restaurantAgent", "1");
      if (withWeb) localStorage.setItem("livskoll-option-restaurantAgentWeb", "1");
      if (textSize) localStorage.setItem("livskoll-text", textSize);
    },
    [agent, size ?? null, web] as const,
  );
}

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("the card is there only with the Tillval on", async ({ page }) => {
  await optionsOn(page, false);
  await page.goto("/matsedel/menyer");
  await expect(page.getByTestId("menu-start")).toBeVisible();
  await expect(page.getByTestId("restaurant-agent-card")).toHaveCount(0);
});

async function geo(page: Page, mode: "ok" | "denied") {
  await page.addInitScript((m) => {
    const w = window as unknown as { __geoCalls: number };
    w.__geoCalls = 0;
    navigator.geolocation.getCurrentPosition = (ok, fail) => {
      w.__geoCalls += 1;
      if (m === "ok") ok({ coords: { latitude: 59.8586, longitude: 17.6389 } } as GeolocationPosition);
      else fail?.({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
    };
  }, mode);
}

for (const size of [undefined, "xl"] as const) {
  test(`the question screen fits at 375 px${size ? " with the larger text" : ""}`, async ({ page }) => {
    await optionsOn(page, true, size);
    await geo(page, "ok");
    await page.goto("/matsedel/menyer");
    await page.getByTestId("restaurant-agent-card").click();
    await expect(page.getByTestId("restaurant-where")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sök restauranger" })).toBeVisible();
    await expect(page.getByTestId("restaurant-place-got")).toBeVisible();
    // No place button, no text field, no menu link; one Google Maps link, and no AI button without its own Tillval.
    await expect(page.getByTestId("restaurant-use-place")).toHaveCount(0);
    await expect(page.getByTestId("restaurant-place-text")).toHaveCount(0);
    await expect(page.getByTestId("menu-link-input")).toHaveCount(0);
    const maps = page.getByTestId("direct-map-link");
    await expect(maps).toHaveCount(1);
    await expect(maps).toBeVisible();
    await expect(page.getByTestId("restaurant-find")).toHaveCount(0);
    await page.getByRole("button", { name: "Pizza" }).click();
    await expect(maps).toHaveAttribute("href", /search\/pizza%20restaurang\/@59\.86,17\.64,14z/);
    expect(await noSideScroll(page)).toBe(true);
  });
}

test("the agent button shows only with the web search Tillval on, and needs the place", async ({ page }) => {
  await optionsOn(page, true, undefined, true);
  await geo(page, "denied");
  await page.goto("/matsedel/menyer");
  await page.getByTestId("restaurant-agent-card").click();
  await expect(page.getByTestId("restaurant-find")).toBeDisabled();
  await page.getByTestId("restaurant-place-retry").waitFor();
  expect(await noSideScroll(page)).toBe(true);
});

test("the phone's place is asked by itself, and a refusal explains, keeps the map working and can be retried", async ({ page, context }) => {
  await optionsOn(page, true);
  await context.clearPermissions();
  await geo(page, "denied");
  await page.goto("/matsedel/menyer");
  const calls = () => page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls);
  await page.getByTestId("restaurant-agent-card").click();
  await expect(page.getByText(/Din plats kunde inte hämtas/)).toBeVisible();
  expect(await calls()).toBe(1);
  await expect(page.getByTestId("direct-map-link")).toHaveAttribute("href", /query=restaurang$/);
  await page.getByTestId("restaurant-place-retry").click();
  await expect.poll(calls).toBe(2);
});
