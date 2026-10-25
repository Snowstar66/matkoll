import { expect, test } from "@playwright/test";

test("the start page answers in Swedish with the title Matkoll", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveTitle("Matkoll");
  await expect(page.locator("html")).toHaveAttribute("lang", "sv");
  await expect(page.getByRole("heading", { level: 1, name: "Matkoll" })).toBeVisible();
});
