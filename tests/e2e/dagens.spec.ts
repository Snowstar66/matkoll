import { expect, test } from "@playwright/test";
import { settingsStorageState } from "./support";

// Dagens: the card on top of Recept shows a line about the day, the X hides it until
// tomorrow (this device), and "Visa Dagens" in Inställningar → Tillval turns it off for good.

test.use({ storageState: settingsStorageState, viewport: { width: 390, height: 844 } });

test("the card shows on Recept, X hides it, and Visa Dagens turns it off", async ({ page }) => {
  await page.goto("/recept");
  const card = page.getByTestId("dagens-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText(/Dagens · /);

  await page.getByRole("button", { name: "Dölj idag" }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Recept" })).toBeVisible();
  await expect(card).toHaveCount(0);

  // Tillval: switch the card off, clear the hiding, and see that it stays away.
  await page.goto("/installningar/tillval");
  await expect(page.getByRole("heading", { name: "Dagens" })).toBeVisible();
  const show = page.getByRole("switch", { name: "Visa Dagens" });
  await expect(show).toBeChecked();
  await expect(page.getByRole("switch", { name: "Matdagar och säsong" })).toBeChecked();
  await expect(page.getByRole("switch", { name: "Namnsdag" })).not.toBeChecked();
  await expect(page.getByRole("switch", { name: "Kinesiska almanackan" })).not.toBeChecked();
  await page.evaluate(() => localStorage.removeItem("livskoll-dagens-hidden"));
  await show.click();
  await expect(show).not.toBeChecked();
  await page.goto("/recept");
  await expect(page.getByRole("heading", { name: "Recept" })).toBeVisible();
  await expect(card).toHaveCount(0);

  // Back on: the card returns (some days have no name day, so Namnsdag is only switched, not read).
  await page.goto("/installningar/tillval");
  await page.getByRole("switch", { name: "Visa Dagens" }).click();
  await page.getByRole("switch", { name: "Namnsdag" }).click();
  await page.goto("/recept");
  await expect(card).toBeVisible();
  await page.goto("/installningar/tillval");
  await page.getByRole("switch", { name: "Namnsdag" }).click();
});
