import { expect, type Page, test } from "@playwright/test";
import { adminClient, e2eUserId, pantryEmail, pantryStorageState } from "./support";

// Story 2.1: Hemma with the location cards and the chosen location's items.
// The spec has an E2E user of its own (pantryEmail), whose catalog
// ingredients and pantry rows are made with the service role before the
// tests: 3 items in Kyl (two with an amount, Salt unlimited), 1 in Frys and
// none in Skafferi. Nothing in the app writes to the pantry yet.

const mobile = { width: 375, height: 812 };
const desktop = { width: 1280, height: 800 };

const ingredients = [
  { name: "Mjölk", section: "Mejeri", location: "Kyl" },
  { name: "Smör", section: "Mejeri", location: "Kyl" },
  { name: "Salt", section: "Skafferi", location: "Skafferi" },
  { name: "Ärtor", section: "Frys", location: "Frys" },
] as const;
type Name = (typeof ingredients)[number]["name"];

const items: { name: Name; location: string; amount?: number; unit?: string }[] = [
  { name: "Mjölk", location: "Kyl", amount: 1, unit: "l" },
  { name: "Smör", location: "Kyl", amount: 250, unit: "g" },
  { name: "Salt", location: "Kyl" },
  { name: "Ärtor", location: "Frys", amount: 500, unit: "g" },
];

/** Sets the user's pantry to `items`, with the service role. Catalog ingredients are never deleted, so they are upserted. */
async function seedPantry(userId: string) {
  const admin = adminClient();
  const catalog = await admin
    .from("ingredient")
    .upsert(
      ingredients.map((ingredient) => ({
        user_id: userId,
        name: ingredient.name,
        normalized_name: ingredient.name.toLocaleLowerCase("sv-SE"),
        section: ingredient.section,
        location: ingredient.location,
      })),
      { onConflict: "user_id,normalized_name" },
    )
    .select("id, name");
  if (catalog.error) throw catalog.error;
  const ids = new Map((catalog.data as { id: string; name: string }[]).map((row) => [row.name, row.id]));

  const removed = await admin.from("pantry_item").delete().eq("user_id", userId);
  if (removed.error) throw removed.error;
  const inserted = await admin.from("pantry_item").insert(
    items.map((item) => ({
      user_id: userId,
      ingredient_id: ids.get(item.name),
      location: item.location,
      amount: item.amount ?? null,
      unit: item.unit ?? null,
    })),
  );
  if (inserted.error) throw inserted.error;
}

/** Collects console errors and uncaught exceptions for the page. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

// Earlier routes stay mounted but hidden after a client navigation, so every
// locator is scoped to what is visible.
const places = (page: Page) => page.getByRole("navigation", { name: "Platser" });
const card = (page: Page, name: "Kyl" | "Frys" | "Skafferi") => places(page).getByRole("link", { name: new RegExp(`^${name}`) });
const rows = (page: Page) => page.getByTestId("pantry-row").filter({ visible: true });
const tags = (page: Page) => page.getByTestId("pantry-tag").filter({ visible: true });
const heading = (page: Page, name: string) => page.getByRole("heading", { level: 2, name });

async function expectChosen(page: Page, name: "Kyl" | "Frys" | "Skafferi") {
  for (const other of ["Kyl", "Frys", "Skafferi"] as const) {
    if (other === name) await expect(card(page, other)).toHaveAttribute("aria-current", "true");
    else await expect(card(page, other)).not.toHaveAttribute("aria-current");
  }
}

test.use({ storageState: pantryStorageState });
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await seedPantry(await e2eUserId(pantryEmail));
});

test.describe("on a phone", () => {
  test.use({ viewport: mobile });

  test("shows the three location cards with counts, and Kyl's rows and tags", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/hemma");
    await expect(page.getByRole("heading", { level: 1, name: "Hemma" })).toBeVisible();

    await expect(card(page, "Kyl")).toHaveText(/^Kyl\s*3 varor$/);
    await expect(card(page, "Frys")).toHaveText(/^Frys\s*1 vara$/);
    await expect(card(page, "Skafferi")).toHaveText(/^Skafferi\s*0 varor$/);
    await expectChosen(page, "Kyl");

    // Three cards in one row, each at least 44 px, without horizontal scroll.
    const boxes = await places(page).getByRole("link").evaluateAll((links) =>
      links.map((link) => link.getBoundingClientRect().toJSON() as DOMRect),
    );
    expect(new Set(boxes.map((box) => Math.round(box.top))).size).toBe(1);
    for (const box of boxes) expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await expect(heading(page, "Med mängd")).toBeVisible();
    await expect(rows(page)).toHaveText([/^Mjölk\s*1 l$/, /^Smör\s*250 g$/]);
    await expect(heading(page, "Finns hemma")).toBeVisible();
    await expect(tags(page)).toHaveText(["Salt"]);
    expect(errors).toEqual([]);
  });

  test("a tap on a card chooses the location, and the choice is in the address", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/hemma");
    await expect(rows(page)).toHaveCount(2);

    await card(page, "Frys").click();
    await expect(page).toHaveURL(/\/hemma\?plats=frys$/);
    await expectChosen(page, "Frys");
    await expect(rows(page)).toHaveText([/^Ärtor\s*500 g$/]);
    await expect(tags(page)).toHaveCount(0);
    await expect(heading(page, "Finns hemma")).toHaveCount(0);

    await card(page, "Skafferi").click();
    await expect(page).toHaveURL(/\/hemma\?plats=skafferi$/);
    await expectChosen(page, "Skafferi");
    await expect(page.getByText("Inget i skafferiet än.")).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    await expect(tags(page)).toHaveCount(0);

    await card(page, "Kyl").click();
    await expect(page).toHaveURL(/\/hemma\?plats=kyl$/);
    await expectChosen(page, "Kyl");
    await expect(tags(page)).toHaveText(["Salt"]);
    expect(errors).toEqual([]);
  });

  test("an unknown location in the address shows Kyl", async ({ page }) => {
    await page.goto("/hemma?plats=garage");
    await expectChosen(page, "Kyl");
    await expect(rows(page)).toHaveText([/^Mjölk\s*1 l$/, /^Smör\s*250 g$/]);
  });
});

test.describe("on a computer", () => {
  test.use({ viewport: desktop });

  test("opens the location in the address and shows the cards in a row", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/hemma?plats=frys");
    await expectChosen(page, "Frys");
    await expect(rows(page)).toHaveText([/^Ärtor\s*500 g$/]);

    const boxes = await places(page).getByRole("link").evaluateAll((links) =>
      links.map((link) => link.getBoundingClientRect().toJSON() as DOMRect),
    );
    expect(new Set(boxes.map((box) => Math.round(box.top))).size).toBe(1);

    await card(page, "Kyl").click();
    await expect(page).toHaveURL(/\/hemma\?plats=kyl$/);
    await expect(rows(page)).toHaveText([/^Mjölk\s*1 l$/, /^Smör\s*250 g$/]);
    await expect(tags(page)).toHaveText(["Salt"]);
    expect(errors).toEqual([]);
  });
});
