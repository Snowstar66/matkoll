import { expect, type Page, test } from "@playwright/test";
import { adminClient, e2eUserId, listImportEmail, listImportStorageState } from "./support";

// Fota eller klistra in en inköpslista: in Lägg till vara (the + in Inköpslista's header) two small choices under the
// field, "Fota en lista" (the mock AI answers five items for any photo) and "Klistra in en lista". Both end in a review:
// rows with a tick box, everything ticked except what is on the list already ("Finns redan"); a name that is a catalog
// ingredient lands in its section; "Lägg till N varor" adds them as own items and "Ångra" removes exactly those. The spec
// has an E2E user of its own (listImportEmail); the catalog has Mjölk (Mejeri) and Kaffe (Skafferi).

const mobile = { width: 375, height: 812 };
const photo = "tests/fixtures/ai/kyl.png";
const reservedPhoto = "tests/fixtures/ai/reserved-ai_unavailable.png";

test.use({ storageState: listImportStorageState, viewport: mobile });
test.describe.configure({ mode: "serial" });

let userId = "";

test.beforeAll(async () => {
  userId = await e2eUserId(listImportEmail);
  const admin = adminClient();
  const cleared = await admin.from("shopping_custom_item").delete().eq("user_id", userId);
  if (cleared.error) throw cleared.error;
  const seeded = await admin.from("ingredient").upsert(
    [
      { name: "Mjölk", section: "Mejeri" },
      { name: "Kaffe", section: "Skafferi" },
    ].map(({ name, section }) => ({ user_id: userId, name, normalized_name: name.toLocaleLowerCase("sv-SE"), section, location: "Skafferi" })),
    { onConflict: "household_id,normalized_name" },
  );
  if (seeded.error) throw seeded.error;
});

const sheet = (page: Page) => page.getByRole("dialog", { name: "Lägg till vara" });
const lines = (page: Page) => page.getByTestId("shopping-line").filter({ visible: true });
const rows = (page: Page) => page.getByTestId("list-import-row");
const sectionHeadings = (page: Page) => page.getByRole("heading", { level: 2 }).filter({ visible: true });

async function openSheet(page: Page) {
  await page.goto("/lista");
  await page.getByRole("button", { name: "Lägg till vara" }).click();
  await expect(sheet(page)).toBeVisible();
}

test("a pasted list is reviewed, added in the right sections and taken back with Ångra", async ({ page }) => {
  await openSheet(page);
  // The choices are under the field, and the page itself has no new button.
  await expect(sheet(page).getByRole("button", { name: "Fota en lista" })).toBeVisible();
  await sheet(page).getByRole("button", { name: "Klistra in en lista" }).click();
  await page.getByTestId("list-import-text").fill("- Mjölk\n2 dl Grädde\n☐ Kaffe\n1. Hushållspapper\nmjölk");
  await page.getByRole("button", { name: "Läs listan" }).click();

  // Four rows: the repeated Mjölk counts once; all ticked, none on the list yet.
  await expect(rows(page)).toHaveCount(4);
  await expect(rows(page).getByRole("checkbox", { checked: true })).toHaveCount(4);
  await expect(page.getByText("Finns redan")).toHaveCount(0);
  await expect(rows(page).nth(1)).toContainText("2 dl");
  await page.getByRole("button", { name: "Lägg till 4 varor" }).click();

  await expect(sheet(page)).toBeHidden();
  await expect(page.getByText("Lade till 4 varor på inköpslistan.").last()).toBeVisible();
  await expect(lines(page)).toHaveCount(4);
  // Mjölk is linked to its catalog ingredient, so it is under Mejeri; Kaffe under Skafferi; the rest under Övrigt.
  await expect(sectionHeadings(page)).toHaveText(["Mejeri & ägg", "Torrvaror & konserver", "Övrigt"]);

  await page.getByRole("button", { name: "Ångra" }).click();
  await expect(lines(page)).toHaveCount(0);
});

test("a photo of a list is read by the AI, and what is on the list already is not ticked", async ({ page }) => {
  await openSheet(page);
  await sheet(page).getByRole("button", { name: "Klistra in en lista" }).click();
  await page.getByTestId("list-import-text").fill("kaffe");
  await page.getByRole("button", { name: "Läs listan" }).click();
  await page.getByRole("button", { name: "Lägg till 1 vara" }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(lines(page)).toHaveCount(1);

  await page.getByRole("button", { name: "Lägg till vara" }).click();
  await page.getByTestId("list-import-file").setInputFiles(photo);
  // The mock takes a few seconds for a photo it does not know.
  await expect(rows(page)).toHaveCount(5);
  await expect(rows(page).nth(0)).toContainText("Mjölk");
  await expect(rows(page).nth(0)).toContainText("2 l");
  await expect(rows(page).nth(1)).toContainText("6 st");
  await expect(rows(page).nth(3)).toContainText("Kaffe");
  await expect(rows(page).nth(3)).toContainText("Finns redan");
  await expect(rows(page).nth(3).getByRole("checkbox")).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "Lägg till 4 varor" }).click();

  await expect(sheet(page)).toBeHidden();
  await expect(page.getByText("Lade till 4 varor på inköpslistan.").last()).toBeVisible();
  await expect(lines(page)).toHaveCount(5);
  await page.getByRole("button", { name: "Ångra" }).click();
  await expect(lines(page)).toHaveCount(1);
});

test("a photo the AI cannot read shows its message in the sheet and nothing is added", async ({ page }) => {
  await openSheet(page);
  await page.getByTestId("list-import-file").setInputFiles(reservedPhoto);
  await expect(sheet(page).getByRole("alert")).toContainText("AI-tjänsten svarar inte");
  await expect(sheet(page).getByRole("button", { name: "Klistra in en lista" })).toBeVisible();
});
