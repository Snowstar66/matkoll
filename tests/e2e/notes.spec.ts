import { mkdirSync } from "node:fs";
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { adminClient, e2eUserId, notesEmail, notesPartnerEmail, notesPartnerStorageState, notesStorageState } from "./support";

// Lappen på kylskåpet (Story 24.1): Pontus writes a note from the P button, Martina (a second
// browser, the same household) sees it on top of her tab within the live pace, puts the dish on
// the meal plan with its button, opens the list with the other, answers and marks it Klar; the
// answer comes back to Pontus. With NOTES_SHOTS set to a folder, the screenshots spec saves the
// write sheet, the received card and the reply at 390, dark 390 and 1280.

test.describe.configure({ mode: "serial" });

const phone = { width: 390, height: 844 };
const noteText = "Sugen på fisksoppa idag, kan du handla?";
let pontus: string;
let martina: string;
let household: string;
let recipeId: string;

/** The Next dev badge is not part of the app. */
async function hideDevBadge(page: Page) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

async function contextFor(browser: Browser, storageState: string, options: { width?: number; dark?: boolean } = {}): Promise<BrowserContext> {
  return browser.newContext({
    storageState,
    viewport: options.width ? { width: options.width, height: options.width > 1000 ? 900 : 844 } : phone,
    colorScheme: options.dark ? "dark" : "light",
  });
}

async function clearNotes() {
  await adminClient().from("household_note").delete().eq("household_id", household);
}

test.beforeAll(async () => {
  pontus = await e2eUserId(notesEmail);
  martina = await e2eUserId(notesPartnerEmail);
  const admin = adminClient();
  household = (await admin.from("household_member").select("household_id").eq("user_id", pontus).single()).data!.household_id;
  // Martina joins Pontus's household (Story 21.2b's invitation, done here with the service role); both have said their names.
  await admin.from("household_member").delete().eq("user_id", martina);
  const joined = await admin
    .from("household_member")
    .insert({ household_id: household, user_id: martina, role: "member", display_name: "Martina", color: "sky", named_at: new Date().toISOString() });
  expect(joined.error).toBeNull();
  await admin.from("household_member").update({ display_name: "Pontus", named_at: new Date().toISOString() }).eq("user_id", pontus);
  await admin.from("recipe").delete().eq("household_id", household);
  const recipe = await admin
    .from("recipe")
    .insert({ title: "Fisksoppa", original_servings: 4, total_minutes: 30, source_kind: "url", source_url: "https://www.koket.se/fisksoppa", user_id: pontus, household_id: household })
    .select("id")
    .single();
  expect(recipe.error).toBeNull();
  recipeId = recipe.data!.id;
  await admin.from("meal_plan").delete().eq("household_id", household);
  await clearNotes();
});

test.afterAll(async () => {
  await clearNotes();
});

test("Pontus writes a note, Martina acts on it, answers and marks it Klar", async ({ browser }) => {
  test.setTimeout(120_000);
  const pontusContext = await contextFor(browser, notesStorageState);
  const writer = await pontusContext.newPage();
  await writer.goto("/lista");

  // Pontus: P → Skriv en lapp → the text, a mood, the buttons the text suggests → Skicka.
  await writer.getByRole("button", { name: "Konto" }).filter({ visible: true }).click();
  await writer.getByRole("button", { name: "Skriv en lapp" }).click();
  const sheet = writer.getByRole("dialog", { name: "Lapp till Martina" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("textbox", { name: "Lapp" }).fill(noteText);
  await sheet.getByRole("button", { name: "Kär" }).click();
  const actions = sheet.getByTestId("note-actions");
  await expect(actions.getByRole("button", { name: "Lägg Fisksoppa på matsedeln" })).toHaveAttribute("aria-pressed", "true");
  await expect(actions.getByRole("button", { name: "Visa listan" })).toHaveAttribute("aria-pressed", "true");
  await sheet.getByTestId("note-send").click();
  await expect(sheet).toBeHidden();
  await expect(writer.getByTestId("toast")).toContainText("Lappen är skickad.");
  // His own note waits, quietly; it is not a card for him.
  await expect(writer.getByTestId("own-note").filter({ visible: true })).toContainText("Väntar");
  await expect(writer.getByTestId("note-card").filter({ visible: true })).toHaveCount(0);

  // Martina: the note on top of her tab, with the dot on her P button.
  const martinaContext = await contextFor(browser, notesPartnerStorageState);
  const reader = await martinaContext.newPage();
  await reader.goto("/recept");
  const card = reader.getByTestId("note-card").filter({ visible: true });
  await expect(card).toContainText("Pontus");
  await expect(card).toContainText(`${noteText} 😍`);
  await expect(reader.getByRole("button", { name: "Konto, en lapp väntar" }).filter({ visible: true })).toBeVisible();

  // Lägg Fisksoppa på matsedeln: on this week's plan.
  await card.getByRole("button", { name: "Lägg Fisksoppa på matsedeln" }).click();
  await expect(reader.getByTestId("toast")).toContainText("Lade Fisksoppa på matsedeln.");
  await expect
    .poll(async () => (await adminClient().from("meal_plan_recipe").select("recipe_id").eq("household_id", household)).data?.map((row) => row.recipe_id))
    .toEqual([recipeId]);

  // Visa listan: Inköpslista, with the note still on top.
  await card.getByRole("button", { name: "Visa listan" }).click();
  await expect(reader).toHaveURL(/\/lista$/);
  const listCard = reader.getByTestId("note-card").filter({ visible: true });
  await expect(listCard).toBeVisible();

  // Svara with a quick reply.
  await listCard.getByRole("button", { name: "Svara" }).click();
  const reply = reader.getByRole("dialog", { name: "Svar till Pontus" });
  await expect(reply).toContainText(`Pontus: ${noteText} 😍`);
  await reply.getByRole("button", { name: "Ja, jag fixar det" }).click();
  await expect(reply.getByRole("textbox", { name: "Svar" })).toHaveValue("Ja, jag fixar det");
  await reply.getByTestId("note-send").click();
  await expect(reply).toBeHidden();
  await expect(reader.getByTestId("toast")).toContainText("Svaret är skickat.");

  // Klar: gone for the household, with Ångra.
  await listCard.getByRole("button", { name: "Klar" }).click();
  await expect(reader.getByTestId("toast")).toContainText("Lappen är klar.");
  await expect(reader.getByTestId("note-card").filter({ visible: true })).toHaveCount(0);
  await expect
    .poll(async () => (await adminClient().from("household_note").select("done_by").eq("user_id", pontus).single()).data?.done_by)
    .toBe(martina);

  // Pontus: the answer comes within the live pace (10 s), his own note is gone.
  const answer = writer.getByTestId("note-card").filter({ visible: true });
  await expect(answer).toContainText("Martina", { timeout: 25_000 });
  await expect(answer).toContainText("Ja, jag fixar det");
  await expect(writer.getByTestId("own-note").filter({ visible: true })).toHaveCount(0);

  await pontusContext.close();
  await martinaContext.close();
});

const shots = process.env.NOTES_SHOTS;

test("screenshots of the write sheet, the received card and the reply", async ({ browser }) => {
  test.skip(!shots, "NOTES_SHOTS is not set");
  test.setTimeout(180_000);
  mkdirSync(shots!, { recursive: true });
  await clearNotes();
  const inserted = await adminClient()
    .from("household_note")
    .insert({ text: noteText, mood: "love", actions: [{ kind: "plan", recipeId, title: "Fisksoppa" }, { kind: "list" }], user_id: pontus, household_id: household });
  expect(inserted.error).toBeNull();
  await adminClient().from("household_note").insert({ text: "Glöm inte soporna", user_id: pontus, household_id: household, created_at: new Date(Date.now() - 3600_000).toISOString() });

  for (const [name, options] of [
    ["390", { width: 390 }],
    ["390-dark", { width: 390, dark: true }],
    ["1280", { width: 1280 }],
  ] as const) {
    const desktop = options.width > 1000;

    // The write sheet, as Pontus.
    const writerContext = await contextFor(browser, notesStorageState, options);
    const writer = await writerContext.newPage();
    await writer.goto("/lista");
    await hideDevBadge(writer);
    if (desktop) await writer.getByRole("navigation", { name: "Huvudmeny" }).getByRole("button", { name: "Skriv en lapp" }).click();
    else {
      await writer.getByRole("button", { name: "Konto" }).filter({ visible: true }).click();
      await writer.getByRole("button", { name: "Skriv en lapp" }).click();
    }
    const sheet = writer.getByRole("dialog", { name: "Lapp till Martina" });
    await sheet.getByRole("textbox", { name: "Lapp" }).fill(noteText);
    await sheet.getByRole("button", { name: "Kär" }).click();
    await expect(sheet.getByTestId("note-actions")).toBeVisible();
    await writer.waitForTimeout(400);
    await writer.screenshot({ path: `${shots}/write-${name}.png` });
    await writerContext.close();

    // The received card, as Martina.
    const readerContext = await contextFor(browser, notesPartnerStorageState, options);
    const reader = await readerContext.newPage();
    await reader.goto("/lista");
    await hideDevBadge(reader);
    const card = reader.getByTestId("note-card").filter({ visible: true });
    await expect(card).toContainText(noteText);
    await reader.waitForTimeout(400);
    await reader.screenshot({ path: `${shots}/received-${name}.png` });

    // The reply sheet.
    await card.getByRole("button", { name: "Svara" }).click();
    const reply = reader.getByRole("dialog", { name: "Svar till Pontus" });
    await reply.getByRole("button", { name: "Ja, jag fixar det" }).click();
    await reader.waitForTimeout(400);
    await reader.screenshot({ path: `${shots}/reply-${name}.png` });
    await readerContext.close();
  }
});
