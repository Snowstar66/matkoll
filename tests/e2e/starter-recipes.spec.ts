import { type Browser, type BrowserContext, expect, test } from "@playwright/test";
import sharp from "sharp";
import { adminClient, e2eUserId, starterOwnerEmail, starterOwnerStorageState, starterUserEmail, starterUserStorageState } from "./support";

// Startrecept (Kom igång med recept), the whole journey with two households: the owner (made the app's owner
// in app_owner for this spec) puts own recipes in the pack from a recipe's menu and from Inställningar →
// Startrecept, notes one and previews the pack as a new household (nothing is copied). A new household turns
// Tillval Startrecept on, meets the offer in its empty Recept, opens a recipe, chooses both, and they are
// copied with the picture into its own list. It then changes one, and "Ta bort orörda startrecept" removes only
// the other. Recipes are made with the service role.

test.describe.configure({ mode: "serial" });

const phone = { width: 390, height: 844 };
const first = "Ägarens köttbullar";
const second = "Ägarens pytt i panna";
let owner: string;
let user: string;
let ownerHousehold: string;
let userHousehold: string;
let firstId: string;

async function contextFor(browser: Browser, storageState: string, starterOn: boolean): Promise<BrowserContext> {
  const context = await browser.newContext({ storageState, viewport: phone });
  if (starterOn) await context.addInitScript(() => window.localStorage.setItem("livskoll-option-starterRecipes", "1"));
  return context;
}

async function householdOf(userId: string): Promise<string> {
  const { data, error } = await adminClient().from("household_member").select("household_id").eq("user_id", userId).single();
  if (error) throw error;
  return (data as { household_id: string }).household_id;
}

/** A recipe of the owner's household with two steps and two lines, as an import saves one. */
async function addRecipe(title: string): Promise<string> {
  const admin = adminClient();
  const recipe = await admin
    .from("recipe")
    .insert({ user_id: owner, household_id: ownerHousehold, title, original_servings: 4, total_minutes: 30, source_kind: "text" })
    .select("id")
    .single();
  if (recipe.error) throw recipe.error;
  const id = (recipe.data as { id: string }).id;
  const steps = await admin.from("recipe_step").insert([
    { user_id: owner, household_id: ownerHousehold, recipe_id: id, position: 0, text: "Blanda färs, ströbröd och grädde. Låt vila." },
    { user_id: owner, household_id: ownerHousehold, recipe_id: id, position: 1, text: "Forma bollar och stek i smör." },
  ]);
  if (steps.error) throw steps.error;
  const lines = await admin.from("recipe_ingredient").insert([
    { user_id: owner, household_id: ownerHousehold, recipe_id: id, position: 0, original_text: "500 g köttfärs", amount: 500, unit: "g", is_vague: false },
    { user_id: owner, household_id: ownerHousehold, recipe_id: id, position: 1, original_text: "Salt och peppar", is_vague: true },
  ]);
  if (lines.error) throw lines.error;
  return id;
}

/** The owner's own stored picture of `id`, as the app keeps one (WebP, full and thumbnail). */
async function storePicture(id: string): Promise<void> {
  const webp = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 190, g: 110, b: 50 } } }).webp().toBuffer();
  const folder = `${ownerHousehold}/${id}`;
  for (const size of ["full", "thumb"]) {
    const uploaded = await adminClient().storage.from("recipe-images").upload(`${folder}/${size}`, webp, { contentType: "image/webp", upsert: true });
    if (uploaded.error) throw uploaded.error;
  }
  const { error } = await adminClient().from("recipe").update({ image_path: folder }).eq("id", id);
  if (error) throw error;
}

async function clean(): Promise<void> {
  const admin = adminClient();
  for (const household of [ownerHousehold, userHousehold]) {
    const { data } = await admin.storage.from("recipe-images").list(household);
    for (const folder of data ?? []) await admin.storage.from("recipe-images").remove([`${household}/${folder.name}/full`, `${household}/${folder.name}/thumb`]);
    await admin.from("meal_plan").delete().eq("household_id", household);
    await admin.from("recipe").delete().eq("household_id", household);
  }
}

test.beforeAll(async () => {
  owner = await e2eUserId(starterOwnerEmail);
  user = await e2eUserId(starterUserEmail);
  ownerHousehold = await householdOf(owner);
  userHousehold = await householdOf(user);
  const made = await adminClient().from("app_owner").upsert({ user_id: owner });
  if (made.error) throw made.error;
  await clean();
  firstId = await addRecipe(first);
  await addRecipe(second);
  await storePicture(firstId);
});

test.afterAll(async () => {
  await adminClient().from("app_owner").delete().eq("user_id", owner);
  await clean();
});

test("the owner puts own recipes in the pack, notes one and previews it as a new household", async ({ browser }) => {
  const page = await (await contextFor(browser, starterOwnerStorageState, false)).newPage();

  // From the recipe's menu.
  await page.goto(`/recept/${firstId}`);
  await expect(page.getByRole("heading", { level: 1, name: first })).toBeVisible();
  await page.getByRole("button", { name: "Fler val" }).click();
  await page.getByRole("menuitem", { name: "Lägg i startpaketet" }).click();
  await expect(page.getByText("Ligger nu i startpaketet.").first()).toBeVisible();
  await page.getByRole("button", { name: "Fler val" }).click();
  await expect(page.getByRole("menuitem", { name: "Ta bort ur startpaketet" })).toBeVisible();
  await page.keyboard.press("Escape");

  // From Inställningar → Startrecept, shown to the owner only.
  await page.goto("/installningar/startrecept");
  const admin = page.getByTestId("starter-admin");
  await expect(admin.getByTestId("starter-admin-row")).toHaveCount(1);
  await admin.getByRole("button", { name: `Lägg ${second} i startpaketet` }).click();
  await expect(admin.getByTestId("starter-admin-row")).toHaveCount(2);
  const row = admin.getByTestId("starter-admin-row").filter({ hasText: first });
  await row.getByRole("textbox").fill("Barnens favorit");
  await row.getByRole("button", { name: "Spara" }).click();
  await expect(page.getByText("Anteckningen är sparad.").first()).toBeVisible();

  // The preview: the pack as a new household sees it, and nothing is copied.
  await admin.getByTestId("starter-admin-preview").click();
  await expect(page).toHaveURL(/\/recept\/startrecept\?forhandsvisning=1$/);
  await expect(page.getByText(/Förhandsvisning: så ser ett nytt hushåll/)).toBeVisible();
  await expect(page.getByText("2 vardagsrätter. Välj de du vill ha.")).toBeVisible();
  await expect(page.getByTestId("starter-card").filter({ hasText: first })).toContainText("Barnens favorit");
  await page.getByRole("checkbox", { name: `Välj ${first}` }).click();
  await page.getByTestId("starter-add").click();
  await expect(page.getByText("Förhandsvisning: inget kopieras.").first()).toBeVisible();
  const copies = await adminClient().from("recipe").select("id").not("starter_item_id", "is", null).in("household_id", [ownerHousehold, userHousehold]);
  expect(copies.data).toEqual([]);
});

test("a new household meets the offer, opens a recipe, adds both and gets them with the picture", async ({ browser }) => {
  // With the switch off (the default) Recept is as before.
  const off = await (await contextFor(browser, starterUserStorageState, false)).newPage();
  await off.goto("/recept");
  await expect(off.getByText("Inga recept än.")).toBeVisible();
  await expect(off.getByTestId("starter-offer")).toHaveCount(0);
  await off.context().close();

  const page = await (await contextFor(browser, starterUserStorageState, true)).newPage();
  await page.goto("/recept");
  await expect(page.getByRole("heading", { name: "Börja med några recept" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Importera ett eget recept" })).toBeVisible();
  await page.getByRole("link", { name: "Välj startrecept" }).click();
  await expect(page).toHaveURL(/\/recept\/startrecept$/);
  await expect(page.getByRole("heading", { level: 1, name: "Startrecept" })).toBeVisible();
  await expect(page.getByTestId("starter-count")).toHaveText("Inget valt");
  await expect(page.getByTestId("starter-add")).toBeDisabled();

  // Steg 3: open one first; its texts exactly as written.
  await page.getByTestId("starter-card").filter({ hasText: first }).getByRole("button", { name: new RegExp(first) }).click();
  const sheet = page.getByRole("dialog", { name: first });
  await expect(sheet.getByTestId("starter-preview")).toContainText("500 g köttfärs");
  await expect(sheet.getByTestId("starter-preview")).toContainText("Forma bollar och stek i smör.");
  await sheet.getByRole("button", { name: "Välj det här receptet" }).click();
  await expect(sheet.getByRole("button", { name: "Vald. Ta bort ur valet" })).toBeVisible();
  await sheet.getByRole("button", { name: "Stäng" }).click();
  await expect(page.getByTestId("starter-count")).toHaveText("1 valt");
  await page.getByRole("button", { name: "Välj alla 2" }).click();
  await expect(page.getByTestId("starter-add")).toHaveText("Lägg till 2 recept");

  // Steg 4 and 5.
  await page.getByTestId("starter-add").click();
  await expect(page.getByRole("heading", { level: 1, name: "2 recept tillagda" })).toBeVisible({ timeout: 30_000 });
  const rows = (await adminClient().from("recipe").select("id, title, image_path, starter_item_id").eq("household_id", userHousehold).order("title")).data ?? [];
  expect(rows.map((row) => row.title)).toEqual([first, second]);
  expect(rows.every((row) => row.starter_item_id !== null)).toBe(true);
  const copied = rows.find((row) => row.title === first)!;
  expect(copied.image_path, "the picture is copied into the household's own folder").toBe(`${userHousehold}/${copied.id}`);
  const steps = (await adminClient().from("recipe_step").select("text").eq("recipe_id", copied.id).order("position")).data ?? [];
  expect(steps.map((step) => step.text)).toEqual(["Blanda färs, ströbröd och grädde. Låt vila.", "Forma bollar och stek i smör."]);

  await page.getByRole("link", { name: "Visa i Recept" }).click();
  await expect(page).toHaveURL(/\/recept$/);
  await expect(page.getByRole("link", { name: first })).toBeVisible();
  // The picture comes from the household's own copy.
  const image = page.getByTestId("recipe-card").filter({ hasText: first }).locator("img");
  await expect(image).toHaveAttribute("src", `/api/recipe-image/${copied.id}/thumb`);
});

test("Ta bort orörda startrecept removes only the untouched copy", async ({ browser }) => {
  const changed = (await adminClient().from("recipe").select("id").eq("household_id", userHousehold).eq("title", second).single()).data as { id: string };
  // The household renames one: it is theirs now.
  const renamed = await adminClient().from("recipe").update({ title: "Mormors pytt" }).eq("id", changed.id);
  if (renamed.error) throw renamed.error;

  const page = await (await contextFor(browser, starterUserStorageState, true)).newPage();
  await page.goto("/recept/startrecept");
  await expect(page.getByRole("heading", { level: 1, name: "Ni har redan alla startrecept" })).toBeVisible();
  await page.getByTestId("starter-remove-copies").click();
  const question = page.getByRole("dialog", { name: "Ta bort 1 startrecept?" });
  await expect(question).toContainText("Era egna recept rörs inte.");
  await question.getByRole("button", { name: "Ta bort" }).click();
  await expect(page.getByText("1 startrecept borttagna.").first()).toBeVisible();
  const left = (await adminClient().from("recipe").select("title").eq("household_id", userHousehold)).data ?? [];
  expect(left.map((row) => row.title)).toEqual(["Mormors pytt"]);
  // The removed one can be chosen again.
  await expect(page.getByTestId("starter-card").filter({ hasText: first })).toBeVisible();
  await expect(page.getByTestId("starter-card").filter({ hasText: second })).toContainText("Finns redan");
});
