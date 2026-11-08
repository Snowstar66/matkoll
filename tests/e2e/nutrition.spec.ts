import { expect, type Page, test } from "@playwright/test";
import { normalizeIngredientText } from "@/features/catalog/domain/normalize";
import { adminClient, e2eUserId, nutritionEmail, nutritionStorageState } from "./support";

// Näring i receptet: off by default. With Tillval "Visa näring" on, the recipe shows the plate card with
// a tag, "Visa kcal" adds "ca N kcal per portion", and Recept gets the chip Nyttigt, which keeps the
// recipes that follow the kostråd. The spec has an E2E user of its own (nutritionEmail); its recipes are
// made with the service role, from ingredients that are in the nutrition table (Livsmedelsverket's).
//
// - Broccolipasta: 800 g broccoli, 300 g pasta, 2 gul lök, for 4: green, so "Mycket grönt" and Nyttigt.
// - Pasta med smör: 400 g pasta for 4: a plate of carbohydrates only, no tag, not Nyttigt.

test.use({ storageState: nutritionStorageState, viewport: { width: 390, height: 844 } });
test.describe.configure({ mode: "serial" });

const broccoli = "Broccolipasta";
const plain = "Pasta med smör";

let userId = "";

async function seedIngredients(names: string[]): Promise<Map<string, string>> {
  const { data, error } = await adminClient()
    .from("ingredient")
    .upsert(
      names.map((name) => ({ user_id: userId, name, normalized_name: normalizeIngredientText(name), section: "Övrigt", location: "Skafferi" })),
      { onConflict: "household_id,normalized_name" },
    )
    .select("id, name");
  if (error) throw error;
  return new Map((data as { id: string; name: string }[]).map((row) => [row.name, row.id]));
}

type SeedLine = { text: string; amount: number; unit: string; ingredientId: string };

async function seedRecipe(title: string, createdAt: string, lines: SeedLine[]) {
  const admin = adminClient();
  const recipe = await admin
    .from("recipe")
    .insert({ user_id: userId, title, original_servings: 4, total_minutes: 30, source_kind: "text", created_at: createdAt })
    .select("id")
    .single();
  if (recipe.error) throw recipe.error;
  const inserted = await admin.from("recipe_ingredient").insert(
    lines.map((line, position) => ({
      user_id: userId,
      recipe_id: (recipe.data as { id: string }).id,
      position,
      original_text: line.text,
      amount: line.amount,
      unit: line.unit,
      is_vague: false,
      ingredient_id: line.ingredientId,
    })),
  );
  if (inserted.error) throw inserted.error;
}

test.beforeEach(async () => {
  userId = await e2eUserId(nutritionEmail);
  const admin = adminClient();
  for (const table of ["pantry_item", "recipe_ingredient", "recipe_step", "recipe"] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  const ids = await seedIngredients(["Broccoli", "Pasta", "Gul lök"]);
  const id = (name: string) => ids.get(name)!;
  await seedRecipe(broccoli, "2026-10-01T08:00:00Z", [
    { text: "800 g broccoli", amount: 800, unit: "g", ingredientId: id("Broccoli") },
    { text: "300 g pasta", amount: 300, unit: "g", ingredientId: id("Pasta") },
    { text: "2 gul lök", amount: 2, unit: "st", ingredientId: id("Gul lök") },
  ]);
  await seedRecipe(plain, "2026-10-02T08:00:00Z", [{ text: "400 g pasta", amount: 400, unit: "g", ingredientId: id("Pasta") }]);
});

async function turn(page: Page, name: "Visa näring" | "Visa kcal", on: boolean) {
  await page.goto("/installningar/tillval");
  const toggle = page.getByRole("switch", { name: new RegExp(name) });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-checked")) !== String(on)) await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", String(on));
}

async function openRecipe(page: Page, title: string) {
  await page.goto("/recept");
  await page.getByRole("link", { name: new RegExp(title) }).filter({ visible: true }).first().click();
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
}

test("Näring is off by default: no card on the recipe and no Nyttigt chip", async ({ page }) => {
  await page.goto("/installningar/tillval");
  await expect(page.getByRole("switch", { name: /Visa näring/ })).toHaveAttribute("aria-checked", "false");
  await openRecipe(page, broccoli);
  await expect(page.getByTestId("recipe-chips")).toBeVisible();
  await expect(page.getByTestId("nutrition-card")).toHaveCount(0);
  await page.goto("/recept");
  await expect(page.getByTestId("recipe-filters")).toBeVisible();
  await expect(page.getByRole("button", { name: "Nyttigt" })).toHaveCount(0);
});

test("with Visa näring on the recipe has the plate card and a tag; Visa kcal adds kcal; Nyttigt keeps the green dish", async ({ page }) => {
  await turn(page, "Visa näring", true);
  await openRecipe(page, broccoli);
  const card = page.getByTestId("nutrition-card");
  await expect(card).toBeVisible();
  await expect(card.getByTestId("nutrition-plate")).toBeVisible();
  await expect(card.getByText("Mycket grönt")).toBeVisible();
  await expect(card).not.toContainText("kcal");

  await turn(page, "Visa kcal", true);
  await openRecipe(page, broccoli);
  await expect(page.getByTestId("nutrition-kcal")).toContainText("kcal per portion");
  await page.getByTestId("nutrition-card").click();
  const sheet = page.getByRole("dialog", { name: "Näring" });
  await expect(sheet.getByText("Räknat på 3 av 3 varor.")).toBeVisible();
  await expect(sheet.getByText("Energi")).toBeVisible();
  await sheet.getByRole("button", { name: "Klar" }).click();

  await page.goto("/recept");
  const chip = page.getByRole("button", { name: "Nyttigt" }).filter({ visible: true });
  await expect(chip).toBeVisible();
  await chip.click();
  const cards = page.getByTestId("recipe-card").filter({ visible: true });
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText(broccoli);
  await chip.click();
  await expect(cards).toHaveCount(2);

  // The plain pasta has neither a tag nor a plate worth showing as healthy: its card has no tag.
  await openRecipe(page, plain);
  await expect(page.getByTestId("nutrition-tags")).toHaveCount(0);
});
