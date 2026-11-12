import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { adminClient, e2eUserId, sharedOwnerEmail, sharedOwnerStorageState, sharedSaverEmail, sharedSaverStorageState } from "./support";

// Delade recept, with two households: Lindqvists (sharedOwnerEmail) share their recipe from its
// menu, Bergs (sharedSaverEmail) find it under the chip Delade in Recept, open it, save it and open
// their copy, and Lindqvists then see "Sparat av Bergs". Sluta dela alla in Tillval takes it out
// of Delade, and Bergs keep their copy. Recipes are made with the service role.

test.describe.configure({ mode: "serial" });

const phone = { width: 390, height: 844 };
const title = "Delad caesarkyckling";
let owner: string;
let saver: string;
let ownerHousehold: string;
let saverHousehold: string;
let recipeId: string;

/** With SHARED_SHOTS set to a folder, a screenshot of `page` there (for comparing with the mockups). */
async function shot(page: Page, name: string) {
  const folder = process.env.SHARED_SHOTS;
  if (!folder) return;
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: `${folder}/${name}.png` });
}

async function contextFor(browser: Browser, storageState: string): Promise<BrowserContext> {
  return browser.newContext({ storageState, viewport: phone });
}

async function householdOf(userId: string): Promise<string> {
  const { data, error } = await adminClient().from("household_member").select("household_id").eq("user_id", userId).single();
  if (error) throw error;
  return (data as { household_id: string }).household_id;
}

/** A recipe of the household with one step and two lines, one of them on a catalog ingredient of its own. */
async function addRecipe(userId: string, household: string, recipeTitle: string): Promise<string> {
  const admin = adminClient();
  const ingredient = await admin
    .from("ingredient")
    .upsert(
      { user_id: userId, household_id: household, name: "Kycklingfilé", normalized_name: "kycklingfilé", section: "Kött och fisk", location: "Kyl" },
      { onConflict: "household_id,normalized_name" },
    )
    .select("id")
    .single();
  if (ingredient.error) throw ingredient.error;
  const recipe = await admin
    .from("recipe")
    .insert({ user_id: userId, household_id: household, title: recipeTitle, original_servings: 4, total_minutes: 45, source_kind: "url", source_url: "https://www.tasteline.com/recept/caesarkyckling" })
    .select("id")
    .single();
  if (recipe.error) throw recipe.error;
  const id = (recipe.data as { id: string }).id;
  const step = await admin.from("recipe_step").insert({ user_id: userId, household_id: household, recipe_id: id, position: 0, text: "Stek kycklingen i 10 minuter." });
  if (step.error) throw step.error;
  const lines = await admin.from("recipe_ingredient").insert([
    { user_id: userId, household_id: household, recipe_id: id, position: 0, original_text: "600 g kycklingfilé", amount: 600, unit: "g", is_vague: false, ingredient_id: (ingredient.data as { id: string }).id },
    { user_id: userId, household_id: household, recipe_id: id, position: 1, original_text: "salt", is_vague: true },
  ]);
  if (lines.error) throw lines.error;
  return id;
}

test.beforeAll(async () => {
  owner = await e2eUserId(sharedOwnerEmail);
  saver = await e2eUserId(sharedSaverEmail);
  ownerHousehold = await householdOf(owner);
  saverHousehold = await householdOf(saver);
  const admin = adminClient();
  await admin.from("household").update({ name: "Lindqvists", name_is_default: false, share_all: false }).eq("id", ownerHousehold);
  await admin.from("household").update({ name: "Bergs", name_is_default: false, share_all: false }).eq("id", saverHousehold);
  for (const household of [ownerHousehold, saverHousehold]) {
    await admin.from("meal_plan").delete().eq("household_id", household);
    await admin.from("recipe").delete().eq("household_id", household);
  }
  recipeId = await addRecipe(owner, ownerHousehold, title);
  // Bergs have a recipe of their own, so Recept shows the library with its chips.
  await addRecipe(saver, saverHousehold, "Bergs kycklinggryta");
});

test("Lindqvists share a recipe, Bergs find it under Delade and save it, and Lindqvists see Sparat av", async ({ browser }) => {
  const lindqvists = await (await contextFor(browser, sharedOwnerStorageState)).newPage();
  const bergs = await (await contextFor(browser, sharedSaverStorageState)).newPage();

  // Lindqvists share from the menu, at once and without a question.
  await lindqvists.goto(`/recept/${recipeId}`);
  await expect(lindqvists.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await lindqvists.getByRole("button", { name: "Fler val" }).click();
  const menu = lindqvists.getByRole("menu");
  await expect(menu.getByTestId("recipe-share-status")).toHaveCount(0);
  await expect(menu.getByRole("menuitem")).toHaveText(["Ändra", "Dela med andra", "Ta bort"]);
  await shot(lindqvists, "eget-meny");
  await menu.getByRole("menuitem", { name: "Dela med andra" }).click();
  // UX-01: "Delat" is no pill at the top any more; the menu says it.
  await expect(lindqvists.getByTestId("recipe-saved-by")).toHaveCount(0);
  await lindqvists.getByRole("button", { name: "Fler val" }).click();
  await expect(lindqvists.getByRole("menu").getByTestId("recipe-share-status")).toHaveText("Delat med andra");
  await lindqvists.keyboard.press("Escape");

  // Bergs: the chip Delade first, the card with whose it is, no heart.
  await bergs.goto("/recept");
  const chips = bergs.getByTestId("recipe-filters").getByRole("button");
  await expect(chips.first()).toHaveText("Delade");
  await chips.first().click();
  await expect(bergs.getByTestId("recipe-count")).toContainText(/del(ade|at) recept/);
  await shot(bergs, "lista");
  const card = bergs.getByTestId("shared-recipe-card").filter({ hasText: title });
  await expect(card).toBeVisible();
  await expect(card.getByTestId("recipe-card-byline")).toHaveText("från Lindqvists");
  await expect(card.getByRole("button", { name: /^Favorit/ })).toHaveCount(0);
  await expect(bergs.getByTestId("shared-recipe-card").filter({ hasText: "Bergs kycklinggryta" })).toHaveCount(0);

  // Opened: usable, whose it is, no heart or menu; Spara makes the copy.
  await card.getByRole("link", { name: title }).click();
  await expect(bergs).toHaveURL(new RegExp(`/recept/delade/${recipeId}$`));
  await expect(bergs.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(bergs.getByTestId("recipe-shared-by").filter({ visible: true })).toHaveText("Delat av Lindqvists");
  await expect(bergs.getByRole("button", { name: "Fler val" })).toHaveCount(0);
  await expect(bergs.getByRole("button", { name: /^Favorit/ })).toHaveCount(0);
  // Bergs have chicken in their catalog but not at home: it is missing.
  await expect(bergs.getByTestId("recipe-at-home")).toHaveText("0 av 1 hemma");
  await shot(bergs, "delat");
  await expect(bergs.getByRole("button", { name: "Lägg på matsedeln" })).toBeVisible();
  await expect(bergs.getByTestId("fixed-action")).toHaveAttribute("data-layout", "stacked");
  await bergs.getByRole("button", { name: "Spara i mina recept" }).click();
  const toast = bergs.getByTestId("toast");
  await expect(toast).toContainText("Sparat i dina recept");
  await expect(bergs.getByTestId("save-shared")).toBeDisabled();
  await expect(bergs.getByTestId("save-shared")).toHaveText("Sparat");
  await expect(bergs.getByTestId("recipe-shared-note")).toHaveText("Den som delar ser att ni har sparat det.");
  await shot(bergs, "delat-sparat");
  await toast.getByRole("button", { name: "Öppna" }).click();
  await expect(bergs).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
  await expect(bergs.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(bergs.getByTestId("recipe-shared-by").filter({ visible: true })).toHaveText("Delat av Lindqvists");
  const copies = await adminClient().from("recipe").select("id").eq("household_id", saverHousehold).eq("shared_from_recipe_id", recipeId);
  expect(copies.data).toHaveLength(1);

  // Saved: the card says so (Delade is still chosen: the filter is kept on the device).
  await bergs.goto("/recept");
  const delade = bergs.getByTestId("recipe-filters").getByRole("button", { name: "Delade" });
  await expect(delade).toHaveAttribute("aria-pressed", "true");
  await expect(bergs.getByTestId("shared-recipe-card").filter({ hasText: title }).getByTestId("shared-saved")).toBeVisible();

  // Lindqvists see who saved it.
  await lindqvists.reload();
  await expect(lindqvists.getByTestId("recipe-saved-by")).toHaveText("Sparat av Bergs");
  await lindqvists.getByRole("button", { name: "Fler val" }).click();
  await expect(lindqvists.getByRole("menu").getByTestId("recipe-share-status")).toBeVisible();
  await lindqvists.keyboard.press("Escape");
  await shot(lindqvists, "eget-delat");

  // Sluta dela alla in Tillval: asked first, not red; then gone from Delade, and Bergs keep their copy.
  await lindqvists.goto("/installningar/tillval");
  const group = lindqvists.getByTestId("shared-group");
  await expect(group.getByRole("switch", { name: /^Visa delade recept/ })).toHaveAttribute("aria-checked", "true");
  await group.getByRole("button", { name: /Sluta dela alla/ }).click();
  const sheet = lindqvists.getByRole("dialog", { name: "Sluta dela alla?" });
  await expect(sheet).toContainText("1 recept slutar delas. Kopior som andra redan har sparat finns kvar hos dem.");
  await shot(lindqvists, "tillval-fraga");
  await sheet.getByRole("button", { name: "Sluta dela" }).click();
  await expect(group.getByRole("button", { name: /Sluta dela alla/ })).toHaveCount(0);

  await bergs.goto("/recept");
  await expect(delade).toHaveAttribute("aria-pressed", "true");
  await expect(bergs.getByTestId("shared-recipe-card").filter({ hasText: title })).toHaveCount(0);
  await delade.click();
  await expect(delade).toHaveAttribute("aria-pressed", "false");
  await expect(bergs.getByTestId("recipe-card").filter({ hasText: title })).toBeVisible();
  await bergs.goto(`/recept/delade/${recipeId}`);
  await expect(bergs.getByText("Sidan finns inte.")).toBeVisible();
});

// The first share of a household that still has the name it got with its account asks for a name,
// and the other household then sees "från <name>". The second share asks nothing.
test("the first share asks what others should see the household as, and Bergs see that name", async ({ browser }) => {
  const admin = adminClient();
  await admin.from("recipe").delete().eq("household_id", ownerHousehold);
  // A default name: the flag is set after the name, since changing the name clears it.
  await admin.from("household").update({ name: "Phellgren85s hushåll", share_all: false }).eq("id", ownerHousehold);
  await admin.from("household").update({ name_is_default: true }).eq("id", ownerHousehold);
  const first = await addRecipe(owner, ownerHousehold, "Hellgrens paj");
  const second = await addRecipe(owner, ownerHousehold, "Hellgrens soppa");
  const hellgrens = await (await contextFor(browser, sharedOwnerStorageState)).newPage();
  const bergs = await (await contextFor(browser, sharedSaverStorageState)).newPage();

  await hellgrens.goto(`/recept/${first}`);
  await hellgrens.getByRole("button", { name: "Fler val" }).click();
  await hellgrens.getByRole("menuitem", { name: "Dela med andra" }).click();
  const sheet = hellgrens.getByRole("dialog", { name: "Vad ska andra se att ni heter?" });
  await expect(sheet).toBeVisible();
  const field = sheet.getByRole("textbox", { name: "Hushållets namn" });
  await expect(field).toHaveValue("");
  await expect(field).toHaveAttribute("placeholder", "Till exempel Hellgrens");
  await shot(hellgrens, "namnfraga");
  await field.fill("Hellgrens");
  await sheet.getByRole("button", { name: "Spara och dela" }).click();
  await expect(sheet).toHaveCount(0);
  await hellgrens.getByRole("button", { name: "Fler val" }).click();
  await expect(hellgrens.getByRole("menuitem", { name: "Sluta dela" })).toBeVisible();
  await hellgrens.keyboard.press("Escape");
  expect((await admin.from("household").select("name, name_is_default").eq("id", ownerHousehold).single()).data).toEqual({ name: "Hellgrens", name_is_default: false });

  await bergs.goto("/recept");
  await bergs.getByTestId("recipe-filters").getByRole("button").first().click();
  const card = bergs.getByTestId("shared-recipe-card").filter({ hasText: "Hellgrens paj" });
  await expect(card.getByTestId("recipe-card-byline")).toHaveText("från Hellgrens");

  // The name is chosen now: the next share asks nothing.
  await hellgrens.goto(`/recept/${second}`);
  await hellgrens.getByRole("button", { name: "Fler val" }).click();
  await hellgrens.getByRole("menuitem", { name: "Dela med andra" }).click();
  await expect(hellgrens.getByRole("dialog")).toHaveCount(0);
  await hellgrens.getByRole("button", { name: "Fler val" }).click();
  await expect(hellgrens.getByRole("menuitem", { name: "Sluta dela" })).toBeVisible();

  // Newest shared first: the recipe shared last is first in Delade.
  await bergs.reload();
  // Delade is still chosen: the filter is kept on the device.
  await expect(bergs.getByTestId("recipe-filters").getByRole("button").first()).toHaveAttribute("aria-pressed", "true");
  await expect(bergs.getByTestId("shared-recipe-card").first()).toContainText("Hellgrens soppa");

  // Turning Dela alla off asks while recipes are shared; Behåll dem keeps them.
  await hellgrens.goto("/installningar/tillval");
  const group = hellgrens.getByTestId("shared-group");
  const all = group.getByRole("switch", { name: /^Dela alla mina recept/ });
  await all.click();
  await expect(all).toHaveAttribute("aria-checked", "true");
  await all.click();
  const question = hellgrens.getByRole("dialog", { name: "Sluta dela de recept som delas nu?" });
  await expect(question).toContainText("2 recept delas nu.");
  await shot(hellgrens, "dela-alla-av");
  await question.getByRole("button", { name: "Behåll dem" }).click();
  await expect(all).toHaveAttribute("aria-checked", "false");
  await expect(group.getByTestId("shared-count")).toHaveText("2 recept");
});
