import { expect, type Page, test } from "@playwright/test";
import { settingsStorageState } from "./support";

// Färgtema: a theme chosen under Inställningar → Utseende changes the accent on every page,
// survives a reload (the inline script in <head> applies it before first paint), and
// Återställ till Grön brings the default back. The choice is per device (localStorage).

test.use({ storageState: settingsStorageState, viewport: { width: 375, height: 812 } });

const accent = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim().toUpperCase());

test("choosing Blå changes the accent on another page and after a reload, and Återställ brings Grön back", async ({ page }) => {
  await page.goto("/installningar/utseende");
  await expect(page.getByRole("radio", { name: "Grön" })).toBeChecked();
  expect(await accent(page)).toBe("#3E7C62");

  await page.getByRole("radio", { name: "Blå" }).click();
  await expect(page.getByRole("radio", { name: "Blå" })).toBeChecked();
  expect(await accent(page)).toBe("#3F6E94");

  // Another page, reached by navigation inside the app, and then a reload.
  await page.getByRole("navigation", { name: "Huvudmeny" }).getByRole("link", { name: /^Recept/ }).click();
  await expect(page).toHaveURL(/\/recept/);
  expect(await accent(page)).toBe("#3F6E94");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "bla");
  expect(await accent(page)).toBe("#3F6E94");

  await page.goto("/installningar/utseende");
  await page.getByRole("button", { name: "Återställ till Grön" }).click();
  await expect(page.getByRole("radio", { name: "Grön" })).toBeChecked();
  expect(await accent(page)).toBe("#3E7C62");
  await page.reload();
  await expect(page.locator("html")).not.toHaveAttribute("data-palette", /.+/);
  expect(await accent(page)).toBe("#3E7C62");
});

test("Egen shows the Ton slider and turns the accent with it", async ({ page }) => {
  await page.goto("/installningar/utseende");
  await expect(page.getByRole("slider", { name: "Ton" })).toHaveCount(0);
  await page.getByRole("radio", { name: "Egen" }).click();
  const slider = page.getByRole("slider", { name: "Ton" });
  await slider.fill("260");
  await expect(page.locator("html")).toHaveAttribute("style", /--hue:\s*260/);
  await page.reload();
  await expect(page.getByRole("slider", { name: "Ton" })).toHaveValue("260");
  await page.getByRole("button", { name: "Återställ till Grön" }).click();
});
