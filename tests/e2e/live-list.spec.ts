import { expect, type Locator, type Page, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, e2eUserId, liveListEmail, liveListStorageState, outsiderEmail, thisMonday } from "./support";

// Story 17.7: Live-inköpslista. Two phones (two browser contexts) are signed in
// as the same user and have /lista open; what one does shows on the other
// within a couple of seconds, without a reload, through Supabase Realtime.

const mobile = { width: 375, height: 812 };
const within = { timeout: 8_000 };
test.use({ storageState: liveListStorageState, viewport: mobile });
test.describe.configure({ mode: "serial" });

let userId = "";
let planId = "";
let ingredients = new Map<string, string>();
const recipes: Record<string, string> = {};

async function seedIngredients(): Promise<Map<string, string>> {
  const sections: Record<string, string> = { Grädde: "Mejeri", Mjöl: "Skafferi" };
  const { data, error } = await adminClient()
    .from("ingredient")
    .upsert(
      Object.entries(sections).map(([name, section]) => ({
        user_id: userId,
        name,
        normalized_name: name.toLocaleLowerCase("sv-SE"),
        section,
        location: "Kyl",
      })),
      { onConflict: "user_id,normalized_name" },
    )
    .select("id, name");
  if (error) throw error;
  return new Map((data as { id: string; name: string }[]).map((row) => [row.name, row.id]));
}

async function seedRecipe(title: string, ingredient: string, text: string, amount: number, unit: string) {
  const admin = adminClient();
  const recipe = await admin
    .from("recipe")
    .insert({ user_id: userId, title, original_servings: 4, total_minutes: 30, source_kind: "text" })
    .select("id")
    .single();
  if (recipe.error) throw recipe.error;
  const id = (recipe.data as { id: string }).id;
  const line = await admin.from("recipe_ingredient").insert({
    user_id: userId,
    recipe_id: id,
    position: 0,
    original_text: text,
    amount,
    unit,
    is_vague: false,
    ingredient_id: ingredients.get(ingredient),
  });
  if (line.error) throw line.error;
  recipes[title] = id;
}

async function addDish(title: string, position: number) {
  const { error } = await adminClient().from("meal_plan_recipe").insert({
    user_id: userId,
    meal_plan_id: planId,
    recipe_id: recipes[title],
    recipe_title: title,
    servings: 4,
    position,
  });
  if (error) throw error;
}

test.beforeAll(async () => {
  userId = await e2eUserId(liveListEmail);
  const admin = adminClient();
  for (const table of ["shopping_custom_item", "shopping_check", "meal_plan", "pantry_item", "recipe"] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  ingredients = await seedIngredients();
  await seedRecipe("Gryta", "Grädde", "2 dl grädde", 2, "dl");
  await seedRecipe("Paj", "Mjöl", "2 dl mjöl", 2, "dl");
  const plan = await admin
    .from("meal_plan")
    .insert({ user_id: userId, name: "Vecka", is_current: true, week_start: thisMonday() })
    .select("id")
    .single();
  if (plan.error) throw plan.error;
  planId = (plan.data as { id: string }).id;
  await addDish("Gryta", 0);
});

const check = (page: Page, name: RegExp) => page.getByRole("checkbox", { name }).filter({ visible: true });
const lineOf = (page: Page, text: string) => page.getByTestId("shopping-line").filter({ hasText: text }).filter({ visible: true });

async function swipeLeft(page: Page, row: Locator, distance = 150) {
  await row.scrollIntoViewIfNeeded();
  const box = await row.boundingBox();
  if (!box) throw new Error("no row");
  const x = box.x + box.width * 0.7;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - distance, y + 4, { steps: 12 });
  await page.mouse.up();
}

test("a check, an own item and its removal on one phone show on the other, and a check on both ends once", async ({
  browser,
}) => {
  const phoneA = await browser.newContext({ storageState: liveListStorageState, viewport: mobile });
  const phoneB = await browser.newContext({ storageState: liveListStorageState, viewport: mobile });
  const a = await phoneA.newPage();
  const b = await phoneB.newPage();
  const errors: string[] = [];
  for (const page of [a, b]) {
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/lista");
    await expect(check(page, /^Grädde/)).not.toBeChecked();
  }
  // Give both sockets a moment to join before the first change.
  await b.waitForTimeout(1500);

  // Checking off.
  await check(a, /^Grädde/).click();
  await expect(check(b, /^Grädde/)).toBeChecked(within);

  // Adding an own item.
  await a.getByTestId("add-item-fab").filter({ visible: true }).click();
  const sheet = a.getByRole("dialog", { name: "Lägg till vara" });
  await sheet.getByRole("textbox", { name: "Vara" }).fill("diskmedel");
  await sheet.getByRole("button", { name: "Lägg till" }).click();
  // The sheet stays open for the next item; "Klar" stops.
  await expect(sheet.getByTestId("custom-item-added")).toHaveText("La till diskmedel.");
  await sheet.getByRole("button", { name: "Klar" }).click();
  await expect(lineOf(a, "diskmedel")).toHaveCount(1);
  await expect(lineOf(b, "diskmedel")).toHaveCount(1, within);

  // Removing it.
  const row = lineOf(a, "diskmedel");
  await swipeLeft(a, row);
  await a.getByRole("button", { name: "Svep bort diskmedel" }).click();
  await expect(lineOf(a, "diskmedel")).toHaveCount(0);
  await expect(lineOf(b, "diskmedel")).toHaveCount(0, within);

  // A change of the meal plan counts the list again on the other phone.
  await addDish("Paj", 1);
  await expect(check(a, /^Mjöl/)).toBeVisible(within);
  await expect(check(b, /^Mjöl/)).toBeVisible(within);

  // The same line checked on both phones at once ends checked, once, without errors.
  const cleared = await adminClient().from("shopping_check").delete().eq("user_id", userId);
  if (cleared.error) throw cleared.error;
  await expect(check(a, /^Mjöl/)).not.toBeChecked(within);
  await expect(check(b, /^Mjöl/)).not.toBeChecked(within);
  await Promise.all([check(a, /^Mjöl/).click(), check(b, /^Mjöl/).click()]);
  await expect(check(a, /^Mjöl/)).toBeChecked(within);
  await expect(check(b, /^Mjöl/)).toBeChecked(within);
  await a.waitForTimeout(1500);
  const stored = await adminClient()
    .from("shopping_check")
    .select("line_key")
    .eq("user_id", userId)
    .eq("line_key", `r:${ingredients.get("Mjöl")}:dl`);
  expect(stored.data).toHaveLength(1);
  // No notice of a failed save on either phone.
  await expect(a.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
  await expect(b.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
  expect(errors).toEqual([]);
  await phoneA.close();
  await phoneB.close();
});

// Realtime follows RLS for INSERT and UPDATE, but not for DELETE, whose record
// holds the row id only. Another account's subscription, with no filter at all,
// must never hear what is in this user's rows; a bare DELETE ping with only an
// id may arrive (a timing-only leak, accepted: Story 17.7).
test("another account's subscription never receives this user's row content", async () => {
  const link = await adminClient().auth.admin.generateLink({ type: "magiclink", email: outsiderEmail });
  if (link.error) throw link.error;
  const other = createClient(localSupabaseUrl(), process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const verified = await other.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "email" });
  if (verified.error) throw verified.error;

  const heard: { type: string; text: string }[] = [];
  let joined = false;
  const channel = other.channel("spy");
  for (const event of ["INSERT", "UPDATE", "DELETE"] as const) {
    channel.on("postgres_changes", { event, schema: "public", table: "shopping_check" }, (payload) =>
      heard.push({ type: payload.eventType, text: JSON.stringify(payload) }),
    );
  }
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") joined = true;
  });
  await expect.poll(() => joined, { timeout: 8_000 }).toBe(true);

  const admin = adminClient();
  const inserted = await admin
    .from("shopping_check")
    .insert({ user_id: userId, meal_plan_id: planId, line_key: "t:hemlignyckel" })
    .select("id")
    .single();
  if (inserted.error) throw inserted.error;
  const id = (inserted.data as { id: string }).id;
  await admin.from("shopping_check").update({ line_key: "t:hemlignyckel2" }).eq("id", id);
  await admin.from("shopping_check").delete().eq("id", id);
  await new Promise((resolve) => setTimeout(resolve, 3_000));
  await other.removeAllChannels();

  expect(heard.filter((event) => event.type !== "DELETE")).toEqual([]);
  for (const event of heard) {
    expect(event.text).not.toContain("t:hemlignyckel");
    expect(event.text).not.toContain(userId);
  }
});
