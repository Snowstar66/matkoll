import { expect, type Page, test } from "@playwright/test";
import { addWeeks, currentWeekStart, weekParam } from "@/features/mealplan";
import { adminClient, e2eUserId, weekAgentEmail, weekAgentStorageState } from "./support";

// Veckoagenten (Tillval, off by default), the screens of PR 3: the card at the top of Matsedel, the proposal with a
// reason per day, "Använd veckan" which fills only the empty days, and a week where Thursday is already the
// household's own. It needs the backend of PR 2 (the Server Actions proposeWeek, applyWeek, ...): until it is merged
// the proposal screen answers "Veckoagenten är inte klar än" and each test skips itself, so the spec can be merged
// first and starts to count when PR 2 is in. The AI of the E2E run is the mock (AI_PROVIDER=mock) or, when it
// answers nothing usable, the rules without AI ("Enkelt förslag"): both give five dishes, so the spec accepts either.
// The spec has an E2E user of its own (weekAgentEmail): eight recipes, an empty plan and no settings or drafts.

const mobile = { width: 375, height: 812 };
const titles = ["Pasta med köttfärssås", "Ugnsbakad lax med potatis", "Linssoppa med bröd", "Kycklingwok med ris", "Tacos", "Grönsakscurry med ris", "Korvstroganoff", "Fiskgratäng"];
const lines: Record<string, string[]> = {
  "Pasta med köttfärssås": ["400 g spaghetti", "500 g nötfärs", "1 burk krossade tomater"],
  "Ugnsbakad lax med potatis": ["600 g laxfilé", "800 g potatis"],
  "Linssoppa med bröd": ["3 dl röda linser", "1 gul lök", "1 morot"],
  "Kycklingwok med ris": ["600 g kycklingfilé", "2 paprika", "3 dl ris"],
  Tacos: ["500 g nötfärs", "1 paket tortillabröd", "1 dl gräddfil"],
  "Grönsakscurry med ris": ["1 blomkål", "2 dl kokosmjölk", "3 dl ris"],
  Korvstroganoff: ["500 g falukorv", "2 dl grädde", "3 dl ris"],
  Fiskgratäng: ["600 g torsk", "3 dl vetemjöl", "1 gul lök"],
};
const nextWeek = addWeeks(currentWeekStart(), 1);
const nextWeekAddress = `/matsedel?vecka=${weekParam(nextWeek)}`;

test.use({ storageState: weekAgentStorageState, viewport: mobile });
test.describe.configure({ mode: "serial" });

let userId = "";
const recipeIds: Record<string, string> = {};

test.beforeAll(async () => {
  userId = await e2eUserId(weekAgentEmail);
  const admin = adminClient();
  for (const table of ["meal_plan", "week_agent_proposals", "pantry_item", "recipe"] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error && table !== "week_agent_proposals") throw error;
  }
  for (const title of titles) {
    const recipe = await admin.from("recipe").insert({ user_id: userId, title, original_servings: 4, total_minutes: 30, source_kind: "text" }).select("id").single();
    if (recipe.error) throw recipe.error;
    const id = (recipe.data as { id: string }).id;
    recipeIds[title] = id;
    const inserted = await admin.from("recipe_ingredient").insert(
      (lines[title] ?? []).map((text, position) => ({ user_id: userId, recipe_id: id, position, original_text: text, amount: 1, unit: "st", is_vague: false })),
    );
    if (inserted.error) throw inserted.error;
  }
});

/** The agent is a Tillval, off from the start: this device turns it on. */
async function agentOn(page: Page) {
  await page.addInitScript(() => localStorage.setItem("livskoll-option-weekAgent", "1"));
}

async function clearNextWeek() {
  const admin = adminClient();
  await admin.from("week_agent_proposals").delete().eq("week_start", nextWeek);
  const plans = await admin.from("meal_plan").select("id").eq("user_id", userId).eq("week_start", nextWeek);
  for (const plan of (plans.data ?? []) as { id: string }[]) {
    await admin.from("meal_plan_recipe").delete().eq("meal_plan_id", plan.id);
    await admin.from("meal_plan").delete().eq("id", plan.id);
  }
}

/** Thursday of next week is the household's own: Pannkakor-like dish put there by the user (source null = the user's). */
async function fixThursday(title: string) {
  const admin = adminClient();
  const plan = await admin.from("meal_plan").insert({ user_id: userId, name: "Vecka", is_current: false, week_start: nextWeek }).select("id").single();
  if (plan.error) throw plan.error;
  const dish = await admin.from("meal_plan_recipe").insert({ user_id: userId, meal_plan_id: (plan.data as { id: string }).id, recipe_id: recipeIds[title], recipe_title: title, servings: 4, position: 0, weekday: 4 });
  if (dish.error) throw dish.error;
}

/** The proposal screen after the card was tapped: the rows, or a skip when the backend of PR 2 is not there yet. */
async function waitForProposal(page: Page) {
  const rows = page.getByTestId("proposal-day");
  const notReady = page.getByText("Veckoagenten är inte klar än", { exact: false });
  await expect(rows.first().or(notReady)).toBeVisible({ timeout: 90_000 });
  test.skip(await notReady.isVisible(), "The backend of Veckoagenten (PR 2) is not merged yet");
  return rows;
}

async function dishesOfNextWeek(): Promise<{ weekday: number | null; recipe_title: string; source: string | null }[]> {
  const { data, error } = await adminClient()
    .from("meal_plan_recipe")
    .select("weekday, recipe_title, source, meal_plan!inner(week_start)")
    .eq("user_id", userId)
    .eq("meal_plan.week_start", nextWeek);
  if (error) throw error;
  return (data ?? []) as { weekday: number | null; recipe_title: string; source: string | null }[];
}

test("without the Tillval nothing of the agent shows in Matsedel", async ({ page }) => {
  await clearNextWeek();
  await page.goto(nextWeekAddress);
  await expect(page.getByRole("heading", { name: "Matsedel" })).toBeVisible();
  await expect(page.getByTestId("week-agent-card")).toHaveCount(0);
  await expect(page.getByTestId("week-agent-menu")).toHaveCount(0);
});

test("an empty week: Föreslå veckan, a proposal with a reason per day, Använd veckan fills Matsedel", async ({ page }) => {
  await clearNextWeek();
  await agentOn(page);
  await page.goto(nextWeekAddress);
  const card = page.getByTestId("week-agent-card");
  await expect(card).toContainText("Föreslå veckan");
  await expect(card).toHaveAttribute("data-state", "empty");
  await page.getByTestId("week-agent-card-link").click();
  await expect(page).toHaveURL(/veckoforslag/);
  const rows = await waitForProposal(page);
  await expect(page.getByTestId("proposal-summary")).toContainText("Inget är sparat förrän du trycker Använd veckan.");
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(3);
  await expect(rows.first()).toContainText("MÅN");
  // Nothing is in Matsedel before the user says yes.
  expect(await dishesOfNextWeek()).toHaveLength(0);
  // Leaving and coming back finds the draft (no new run).
  await page.goto(nextWeekAddress);
  await page.getByTestId("week-agent-card-link").click();
  await expect(rows).toHaveCount(count);
  await page.getByTestId("proposal-use").click();
  await expect(page).toHaveURL(/\/matsedel\?vecka=/);
  await expect(page.getByTestId("toast")).toContainText(`${count} rätter tillagda.`);
  const saved = await dishesOfNextWeek();
  expect(saved).toHaveLength(count);
  expect(saved.every((dish) => dish.source === "week_agent")).toBe(true);
});

test("a partly filled week: the household's Thursday stays, the rest is filled", async ({ page }) => {
  await clearNextWeek();
  await fixThursday("Fiskgratäng");
  await agentOn(page);
  await page.goto(nextWeekAddress);
  const card = page.getByTestId("week-agent-card");
  await expect(card).toContainText("Fyll resten av veckan");
  await expect(card).toContainText("6 lediga dagar. Din rätt (torsdag) ligger kvar som den är.");
  await page.getByTestId("week-agent-card-link").click();
  const rows = await waitForProposal(page);
  const thursday = page.locator('[data-testid="proposal-day"][data-day="4"]');
  await expect(rows.first()).toBeVisible();
  await expect(thursday).toContainText("Fiskgratäng");
  await expect(thursday).toContainText("Din rätt");
  await expect(thursday.getByRole("button", { name: /Byt/ })).toHaveCount(0);
  await page.getByTestId("proposal-use").click();
  await expect(page).toHaveURL(/\/matsedel\?vecka=/);
  const saved = await dishesOfNextWeek();
  const onThursday = saved.filter((dish) => dish.weekday === 4);
  expect(onThursday).toEqual([expect.objectContaining({ recipe_title: "Fiskgratäng", source: null })]);
  expect(saved.length).toBeGreaterThan(3);
});

test("a full week has the ⋯ menu with Gör om (only the days the agent filled), and no card", async ({ page }) => {
  await clearNextWeek();
  const admin = adminClient();
  const plan = await admin.from("meal_plan").insert({ user_id: userId, name: "Vecka", is_current: false, week_start: nextWeek }).select("id").single();
  if (plan.error) throw plan.error;
  const rows = titles.slice(0, 7).map((title, index) => ({
    user_id: userId,
    meal_plan_id: (plan.data as { id: string }).id,
    recipe_id: recipeIds[title],
    recipe_title: title,
    servings: 4,
    position: index,
    weekday: index + 1,
    // The first three are the household's own, the rest came from an earlier "Använd veckan".
    source: index < 3 ? "user" : "week_agent",
  }));
  const inserted = await admin.from("meal_plan_recipe").insert(rows);
  if (inserted.error) throw inserted.error;
  await agentOn(page);
  await page.goto(nextWeekAddress);
  await expect(page.getByTestId("week-agent-card")).toHaveCount(0);
  await page.getByTestId("week-agent-menu").click();
  const redo = page.getByRole("menuitem", { name: /Gör om de olåsta/ });
  await expect(redo).toContainText("Byter 4 rätter. Dina 3 ligger kvar.");
  await expect(redo).toHaveAttribute("href", /veckoforslag\?vecka=.*gor-om=1/);
});

test("Gör om on a full week replaces only the agent's days, the household's days are untouched, and Ångra puts the old dishes back", async ({ page }) => {
  await clearNextWeek();
  const admin = adminClient();
  const plan = await admin.from("meal_plan").insert({ user_id: userId, name: "Vecka", is_current: false, week_start: nextWeek }).select("id").single();
  if (plan.error) throw plan.error;
  const rows = titles.slice(0, 7).map((title, index) => ({
    user_id: userId,
    meal_plan_id: (plan.data as { id: string }).id,
    recipe_id: recipeIds[title],
    recipe_title: title,
    servings: 4,
    position: index,
    weekday: index + 1,
    source: index < 3 ? "user" : "week_agent",
  }));
  const inserted = await admin.from("meal_plan_recipe").insert(rows);
  if (inserted.error) throw inserted.error;
  const key = (dishes: { weekday: number | null; recipe_title: string; source: string | null }[]) => dishes.map((dish) => `${dish.weekday}:${dish.recipe_title}:${dish.source}`).sort();
  const before = await dishesOfNextWeek();
  const ownBefore = key(before.filter((dish) => dish.source === "user"));

  await agentOn(page);
  await page.goto(nextWeekAddress);
  await page.getByTestId("week-agent-menu").click();
  await page.getByRole("menuitem", { name: /Gör om de olåsta/ }).click();
  const proposalRows = await waitForProposal(page);
  await expect(proposalRows).toHaveCount(7);
  await page.getByTestId("proposal-use").click();
  await page.getByRole("button", { name: "Byt ut och använd" }).click();
  await expect(page).toHaveURL(/\/matsedel\?vecka=/);
  await expect(page.getByTestId("toast")).toContainText("rätter tillagda.");
  const replaced = await dishesOfNextWeek();
  expect(replaced).toHaveLength(7);
  expect(key(replaced.filter((dish) => dish.source === "user"))).toEqual(ownBefore);
  expect(replaced.filter((dish) => dish.source === "week_agent").map((dish) => dish.weekday).sort()).toEqual([4, 5, 6, 7]);

  // Ångra within ten seconds: exactly the first state again.
  await page.getByTestId("toast").getByRole("button", { name: "Ångra" }).click();
  await expect(page.getByText("Ångrade. Veckan är som förut.").first()).toBeVisible();
  expect(key(await dishesOfNextWeek())).toEqual(key(before));
});
