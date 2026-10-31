import { expect, test } from "@playwright/test";

test("the login page answers in Swedish", async ({ page }) => {
  const response = await page.goto("/logga-in");
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveTitle("Logga in – Livskoll");
  await expect(page.locator("html")).toHaveAttribute("lang", "sv");
  await expect(page.getByRole("heading", { level: 1, name: "Logga in" })).toBeVisible();
});

test("the root layout sets theme colours for light and dark and covers the iPhone safe areas", async ({ page }) => {
  await page.goto("/logga-in");
  const themeColors = await page.locator('meta[name="theme-color"]').evaluateAll((metas) =>
    metas.map((meta) => ({ media: meta.getAttribute("media"), content: meta.getAttribute("content") })),
  );
  expect(themeColors).toEqual([
    { media: "(prefers-color-scheme: light)", content: "rgb(245 247 244)" },
    { media: "(prefers-color-scheme: dark)", content: "rgb(18 23 20)" },
  ]);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
});
