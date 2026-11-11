import { expect, type Page, test } from "@playwright/test";
import { userStorageState } from "./support";

// Restaurangagenten (Tillval, off by default), the screens of PR 3: the card on Menyrådgivarens start (only with the
// Tillval on), the question screen (the phone's place is asked only after a tap, a typed place is the fallback) and the
// layout at 375 px and at the larger text. The search itself needs the backend of PR 2 and is covered by the component
// tests with a fake action.

const mobile = { width: 375, height: 812 };
test.use({ storageState: userStorageState, viewport: mobile });

async function optionsOn(page: Page, agent: boolean, size?: "xl") {
  await page.addInitScript(
    ([withAgent, textSize]) => {
      localStorage.setItem("livskoll-option-menuAdvisor", "1");
      if (withAgent) localStorage.setItem("livskoll-option-restaurantAgent", "1");
      if (textSize) localStorage.setItem("livskoll-text", textSize);
    },
    [agent, size ?? null] as const,
  );
}

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("the card is there only with the Tillval on", async ({ page }) => {
  await optionsOn(page, false);
  await page.goto("/matsedel/menyer");
  await expect(page.getByTestId("menu-start")).toBeVisible();
  await expect(page.getByTestId("restaurant-agent-card")).toHaveCount(0);
});

for (const size of [undefined, "xl"] as const) {
  test(`the question screen fits at 375 px${size ? " with the larger text" : ""}`, async ({ page }) => {
    await optionsOn(page, true, size);
    await page.goto("/matsedel/menyer");
    await page.getByTestId("restaurant-agent-card").click();
    await expect(page.getByTestId("restaurant-where")).toBeVisible();
    await expect(page.getByTestId("restaurant-use-place")).toBeVisible();
    await expect(page.getByTestId("restaurant-find")).toBeDisabled();
    await page.getByRole("button", { name: "Pizza" }).click();
    await page.getByTestId("restaurant-place-text").fill("Uppsala");
    await expect(page.getByTestId("restaurant-find")).toBeEnabled();
    expect(await noSideScroll(page)).toBe(true);
  });
}

test("the phone's place is asked only after the tap, and a refusal leaves the text field", async ({ page, context }) => {
  await optionsOn(page, true);
  await context.clearPermissions();
  await page.addInitScript(() => {
    const w = window as unknown as { __geoCalls: number };
    w.__geoCalls = 0;
    navigator.geolocation.getCurrentPosition = (_ok, fail) => {
      w.__geoCalls += 1;
      fail?.({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
    };
  });
  await page.goto("/matsedel/menyer");
  await page.getByTestId("restaurant-agent-card").click();
  expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(0);
  await page.getByTestId("restaurant-use-place").click();
  expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(1);
  await expect(page.getByText(/Vi fick ingen plats/)).toBeVisible();
  await page.getByTestId("restaurant-place-text").fill("753 20");
  await expect(page.getByTestId("restaurant-find")).toBeEnabled();
});
