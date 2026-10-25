import { expect, test } from "@playwright/test";

test("the login page answers in Swedish", async ({ page }) => {
  const response = await page.goto("/logga-in");
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveTitle("Logga in – Matkoll");
  await expect(page.locator("html")).toHaveAttribute("lang", "sv");
  await expect(page.getByRole("heading", { level: 1, name: "Logga in" })).toBeVisible();
});
