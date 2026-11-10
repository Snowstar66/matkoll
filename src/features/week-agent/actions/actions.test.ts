import { beforeEach, describe, expect, it, vi } from "vitest";
import { addWeeks, currentWeekStart } from "@/features/mealplan";
import { fail, ok } from "@/lib/errors";
import type { PlanWeekInput } from "@/server/ai";
import type { StoredProposal } from "../data/week-agent";
import type { WeekProposal } from "../domain/types";

// The Server Actions of Veckoagenten with every module they read stubbed: an in-memory household (recipes, the week's
// dishes, drafts) and a fake AI port. No network, no database.

const { Boom } = vi.hoisted(() => ({ Boom: class Boom extends Error { detail = "x"; } }));

vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/server", () => ({ requireUser: async () => (world.signedIn ? ok({ id: "u" }) : fail("unauthorized")) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/features/settings/server", () => ({ getAiServiceForUser: async () => ({ planWeek }), listStores: async () => [] }));
vi.mock("@/features/menu-advisor/server", () => ({ getFoodFitPeople: async () => world.people }));
vi.mock("@/features/pantry/server", () => ({ getStapleRules: async () => ({}), listHouseholdExpiringItems: async () => world.expiring }));
vi.mock("@/features/shopping/server", () => ({ getShoppingList: async () => (world.shoppingFails ? Promise.reject(new Error("x")) : ok({ lines: new Array(world.shoppingLines).fill({}) })) }));
vi.mock("@/features/offers/server", () => ({ getActiveOffers: async () => [] }));
vi.mock("@/features/recipes/server", () => ({
  RecipeDataError: Boom,
  listRecipeRows: async () => world.recipes.map((recipe) => ({ id: recipe.id, title: recipe.title, totalMinutes: recipe.minutes, originalServings: 4, lines: recipe.lines.map((text) => ({ originalText: text, ingredientId: world.lineIds[text] ?? null, amount: null, unit: null })) })),
  listRecipeTitles: async () => world.recipes.map((recipe) => ({ id: recipe.id, title: recipe.title })),
}));
vi.mock("@/features/mealplan/server", () => ({
  MealPlanDataError: Boom,
  getWeekDishes: async (week: string) => (world.failDishes ? Promise.reject(new Boom("x")) : world.dishes.filter((dish) => dish.week === week)),
  undoAgentDishes: async (week: string, removeIds: string[], restore: { id: string; recipeId: string; recipeTitle: string; servings: number; weekday: number; source: string | null }[]) => {
    world.undoCalls.push({ week, removeIds, restore });
    world.dishes = world.dishes.filter((dish) => !removeIds.includes(dish.id));
    for (const dish of restore) if (!world.dishes.some((existing) => existing.id === dish.id)) world.dishes.push({ id: dish.id, week, weekday: dish.weekday, recipeId: dish.recipeId, recipeTitle: dish.recipeTitle, servings: dish.servings, source: dish.source, cookedAt: null });
  },
  addAgentDishes: async (week: string, dishes: { id: string; recipeId: string; recipeTitle: string; weekday: number }[], replace: string[] = []) => {
    world.addCalls.push({ week, dishes, replace });
    world.dishes = world.dishes.filter((dish) => !replace.includes(dish.id));
    for (const dish of dishes) if (!world.dishes.some((existing) => existing.id === dish.id)) world.dishes.push({ id: dish.id, week, weekday: dish.weekday, recipeId: dish.recipeId, recipeTitle: dish.recipeTitle, servings: 4, source: "week_agent", cookedAt: null });
  },
}));
vi.mock("../data/week-agent", () => ({
  WeekAgentDataError: Boom,
  readSettingsIn: async () => world.settings,
  saveSettingsIn: async (_db: unknown, settings: unknown) => void (world.savedSettings = settings),
  readDraftIn: async (_db: unknown, week: string) => world.drafts.find((draft) => draft.weekStart === week && draft.status === "draft") ?? null,
  readDraftByIdIn: async (_db: unknown, id: string) => world.drafts.find((draft) => draft.id === id && draft.status === "draft") ?? null,
  saveDraftIn: async (_db: unknown, weekStart: string, proposal: WeekProposal, model: string) => {
    for (const draft of world.drafts) if (draft.weekStart === weekStart && draft.status === "draft") draft.status = "discarded";
    const id = `10000000-0000-4000-8000-${String(world.drafts.length + 1).padStart(12, "0")}`;
    world.drafts.push({ id, weekStart, status: "draft", proposal, model, createdAt: "now" });
    return id;
  },
  updateDraftIn: async (_db: unknown, id: string, proposal: WeekProposal, model: string) => {
    const draft = world.drafts.find((entry) => entry.id === id && entry.status === "draft");
    if (draft) Object.assign(draft, { proposal, model });
    return Boolean(draft);
  },
  finishDraftUsedIn: async (_db: unknown, id: string, _proposal: WeekProposal, applied: Applied) => {
    const draft = world.drafts.find((entry) => entry.id === id && entry.status === "draft");
    if (draft) Object.assign(draft, { status: "used", applied });
    return Boolean(draft);
  },
  readDraftAnyStatusIn: async (_db: unknown, id: string) => {
    const draft = world.drafts.find((entry) => entry.id === id);
    return draft ? { id: draft.id, weekStart: draft.weekStart, status: draft.status, proposal: draft.proposal, applied: draft.applied ?? null } : null;
  },
  reopenUsedDraftIn: async (_db: unknown, id: string) => {
    const draft = world.drafts.find((entry) => entry.id === id && entry.status === "used");
    if (!draft) return null;
    delete draft.applied;
    draft.status = world.drafts.some((other) => other !== draft && other.weekStart === draft.weekStart && other.status === "draft") ? "discarded" : "draft";
    return draft.status;
  },
  finishDraftIn: async (_db: unknown, id: string, status: "used" | "discarded") => {
    const draft = world.drafts.find((entry) => entry.id === id && entry.status === "draft");
    if (draft) draft.status = status;
    return Boolean(draft);
  },
}));

type Dish = { id: string; week: string; weekday: number | null; recipeId: string | null; recipeTitle: string; servings: number; source: string | null; cookedAt: string | null };
type Applied = { writtenDays: number[]; replaced: { id: string; recipeId: string; recipeTitle: string; servings: number; weekday: number; source: string | null }[] };
type Recipe = { id: string; title: string; minutes: number; lines: string[] };
const world = {
  signedIn: true,
  failDishes: false,
  settings: { dinners: 5, budget: "normal", vegetarianDays: [] as number[], skipDays: [] as number[], leftoverDays: [] as number[], quickWeekdays: false, useSoonFirst: true, favourOffers: true, offerStoreIds: [] as string[] },
  people: [] as { name: string; allergies: string[]; dislikes: string[]; likes: string[] }[],
  recipes: [] as Recipe[],
  dishes: [] as Dish[],
  drafts: [] as (StoredProposal & { status: "draft" | "used" | "discarded"; applied?: Applied })[],
  expiring: [] as { ingredientId: string; name: string; expiresOn: string; overdue: boolean }[],
  lineIds: {} as Record<string, string>,
  shoppingLines: 14,
  shoppingFails: false,
  undoCalls: [] as { week: string; removeIds: string[]; restore: unknown[] }[],
  addCalls: [] as { week: string; dishes: { id: string; recipeId: string; recipeTitle: string; weekday: number }[]; replace: string[] }[],
  savedSettings: undefined as unknown,
};
const planWeek = vi.fn();

const { proposeWeek } = await import("./propose-week");
const { alternativesForDay, setDayLock, swapDay } = await import("./day-actions");
const { applyWeek, discardDraft, undoWeek } = await import("./apply-week");
const { saveWeekAgentSettings } = await import("./settings-actions");
const { getWeekAgentContext } = await import("../read-context");

const week = addWeeks(currentWeekStart(), 1);
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const rid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const titles = ["Pasta med köttfärssås", "Kycklinggryta", "Laxfilé med potatis", "Linssoppa", "Grönsakscurry", "Korvstroganoff", "Wok med tofu", "Fiskgratäng", "Tacos med nötfärs", "Chili con carne"];
const lines: Record<string, string[]> = {
  "Pasta med köttfärssås": ["400 g spaghetti", "500 g nötfärs"],
  Kycklinggryta: ["600 g kycklingfilé", "2 dl grädde"],
  "Laxfilé med potatis": ["4 laxfilé", "800 g potatis"],
  Linssoppa: ["3 dl röda linser", "1 gul lök"],
  Grönsakscurry: ["1 blomkål", "2 dl kokosmjölk"],
  Korvstroganoff: ["500 g falukorv", "2 dl grädde"],
  "Wok med tofu": ["200 g tofu", "1 paprika"],
  Fiskgratäng: ["600 g torsk", "3 dl grädde"],
  "Tacos med nötfärs": ["500 g nötfärs", "8 tacoskal"],
  "Chili con carne": ["500 g nötfärs", "2 burkar kidneybönor"],
};
const dish = (weekday: number, recipeNumber: number | null, source: string | null = null): Dish => ({ id: `20000000-0000-4000-8000-${String(weekday).padStart(12, "0")}`, week, weekday, recipeId: recipeNumber === null ? null : rid(recipeNumber), recipeTitle: recipeNumber === null ? "Egen rätt" : titles[recipeNumber - 1], servings: 4, source, cookedAt: null });

/** The AI answers with the first `n` open days of its input, a different dish each, from `first` on in the list. */
const answerWith = (pick: (input: PlanWeekInput) => { dayIndex: number; recipeId: string }[]) => planWeek.mockImplementation(async (input: PlanWeekInput) => ok({ picks: pick(input).map((p) => ({ ...p, reasons: [] })), quality: input.quality ?? "standard" }));
const firstFit = (input: PlanWeekInput) => input.openDays.map((dayIndex, index) => ({ dayIndex, recipeId: input.recipes[index].id }));

beforeEach(() => {
  planWeek.mockReset();
  world.signedIn = true;
  world.failDishes = false;
  world.settings = { dinners: 5, budget: "normal", vegetarianDays: [], skipDays: [], leftoverDays: [], quickWeekdays: false, useSoonFirst: true, favourOffers: true, offerStoreIds: [] };
  world.people = [];
  world.recipes = titles.map((title, index) => ({ id: rid(index + 1), title, minutes: 30, lines: lines[title] }));
  world.dishes = [];
  world.drafts = [];
  world.addCalls = [];
  world.undoCalls = [];
  world.expiring = [];
  world.shoppingLines = 14;
  world.lineIds = {};
  world.shoppingFails = false;
  world.savedSettings = undefined;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  answerWith(firstFit);
});

const proposed = (proposal: WeekProposal) => proposal.days.filter((day) => day.source === "proposed" && day.recipeId);

describe("proposeWeek", () => {
  it("plans the open days with Haiku, saves a draft and writes nothing to Matsedel", async () => {
    const result = await proposeWeek({ weekStart: week, mode: "plan" });
    expect(result).toMatchObject({ status: "ok", model: "haiku-5.5" });
    if (result.status !== "ok") return;
    expect(proposed(result.proposal).map((day) => day.dayIndex)).toEqual([1, 2, 3, 4, 5]);
    expect(planWeek).toHaveBeenCalledTimes(1);
    expect(planWeek.mock.calls[0][0].quality).toBe("standard");
    expect(world.drafts).toHaveLength(1);
    expect(world.drafts[0].id).toBe(result.draftId);
    expect(world.addCalls).toEqual([]);
    expect(world.dishes).toEqual([]);
  });

  it("reasons with the pantry's estimated last day: 'håller till ca fredag', never a date it does not have", async () => {
    world.lineIds = { "2 dl grädde": "ing-gradde", "500 g nötfärs": "ing-notfars" };
    world.expiring = [
      { ingredientId: "ing-gradde", name: "Grädde", expiresOn: addDays(week, 4), overdue: false },
      { ingredientId: "ing-notfars", name: "Nötfärs", expiresOn: addDays(week, -3), overdue: true },
    ];
    const result = await proposeWeek({ weekStart: week, mode: "plan" });
    if (result.status !== "ok") throw new Error(JSON.stringify(result));
    const reasons = proposed(result.proposal).flatMap((day) => day.reasons);
    expect(reasons).toContain("Grädde håller till ca fredag");
    expect(reasons).toContain("Nötfärs behöver användas snart");
    expect(reasons.join(" ")).not.toMatch(/går ut/);
    const tag = proposed(result.proposal).flatMap((day) => day.useSoonTags).find((t) => t.name === "Grädde");
    expect(tag).toMatchObject({ expiresWeekday: 5, estimated: true });
  });

  it("leaves expiry out when the setting is off", async () => {
    world.lineIds = { "2 dl grädde": "ing-gradde" };
    world.expiring = [{ ingredientId: "ing-gradde", name: "Grädde", expiresOn: addDays(week, 4), overdue: false }];
    world.settings.useSoonFirst = false;
    const result = await proposeWeek({ weekStart: week, mode: "plan" });
    if (result.status !== "ok") throw new Error(JSON.stringify(result));
    expect(proposed(result.proposal).flatMap((day) => day.reasons).join(" ")).not.toMatch(/Grädde/);
  });

  it("keeps every existing Matsedel day as it is and plans around it, and never sends the model a person's name or an allergy", async () => {
    world.dishes = [dish(4, 7)];
    world.people = [{ name: "Anna", allergies: ["laktos"], dislikes: ["svamp"], likes: ["pasta"] }];
    const result = await proposeWeek({ weekStart: week, mode: "plan" });
    if (result.status !== "ok") throw new Error(JSON.stringify(result));
    expect(result.proposal.days[3]).toMatchObject({ dayIndex: 4, source: "fixed", locked: true, title: "Wok med tofu", recipeId: rid(7) });
    expect(proposed(result.proposal).map((day) => day.dayIndex)).toEqual([1, 2, 3, 5]);
    const sent = planWeek.mock.calls[0][0] as PlanWeekInput;
    expect(sent.openDays).toEqual([1, 2, 3, 5]);
    expect(sent.fixedDays).toEqual([{ dayIndex: 4, title: "Wok med tofu" }]);
    const text = JSON.stringify(sent);
    expect(text).not.toContain("Anna");
    expect(text).not.toContain("laktos");
    expect(sent.dislikes).toEqual(["svamp"]);
    // The dish already on the week is not offered again, and a dish with lactose (grädde) is not in the shortlist at all.
    expect(sent.recipes.map((recipe) => recipe.title)).not.toContain("Wok med tofu");
    expect(sent.recipes.map((recipe) => recipe.title)).not.toContain("Kycklinggryta");
    expect(result.excludedForAllergy.map((excluded) => excluded.title)).toContain("Kycklinggryta");
  });

  it("asks Sonnet once when the answer breaks a hard rule, and uses it", async () => {
    answerWith((input) => (input.quality === "careful" ? firstFit(input) : input.openDays.map((dayIndex) => ({ dayIndex, recipeId: input.recipes[0].id }))));
    const result = await proposeWeek({ weekStart: week, mode: "plan" });
    expect(result).toMatchObject({ status: "ok", model: "sonnet-5.5" });
    expect(planWeek.mock.calls.map((call) => call[0].quality)).toEqual(["standard", "careful"]);
  });

  it("falls back to the rules when Sonnet breaks a rule too, and when the model fails", async () => {
    answerWith((input) => input.openDays.map((dayIndex) => ({ dayIndex, recipeId: "00000000-0000-4000-8000-0000000000ff" })));
    expect(await proposeWeek({ weekStart: week, mode: "plan" })).toMatchObject({ status: "ok", model: "rules" });
    expect(planWeek).toHaveBeenCalledTimes(2);

    planWeek.mockReset().mockResolvedValue(fail("ai_unavailable"));
    const down = await proposeWeek({ weekStart: week, mode: "plan" });
    expect(down).toMatchObject({ status: "ok", model: "rules" });
    expect(planWeek).toHaveBeenCalledTimes(1);
    if (down.status === "ok") expect(proposed(down.proposal)).toHaveLength(5);
  });

  it("asks Sonnet again after an unusable answer (ai_invalid)", async () => {
    answerWith(firstFit);
    planWeek.mockResolvedValueOnce(fail("ai_invalid"));
    expect(await proposeWeek({ weekStart: week, mode: "plan" })).toMatchObject({ status: "ok", model: "sonnet-5.5" });
    expect(planWeek.mock.calls.map((call) => call[0].quality)).toEqual(["standard", "careful"]);
  });

  it("is cap_reached when the daily AI cap stops the first call, and saves nothing", async () => {
    planWeek.mockReset().mockResolvedValue(fail("ai_cap_reached"));
    expect(await proposeWeek({ weekStart: week, mode: "plan" })).toEqual({ status: "cap_reached" });
    expect(world.drafts).toEqual([]);
  });

  it("falls back to the rules when the cap stops only the retry", async () => {
    planWeek.mockReset();
    planWeek.mockResolvedValueOnce(ok({ picks: [{ dayIndex: 1, recipeId: rid(1), reasons: [] }], quality: "standard" }));
    planWeek.mockResolvedValueOnce(fail("ai_cap_reached"));
    expect(await proposeWeek({ weekStart: week, mode: "plan" })).toMatchObject({ status: "ok", model: "rules" });
  });

  it("careful asks Sonnet only, and a hard violation there goes straight to the rules", async () => {
    expect(await proposeWeek({ weekStart: week, mode: "careful" })).toMatchObject({ status: "ok", model: "sonnet-5.5" });
    expect(planWeek.mock.calls.map((call) => call[0].quality)).toEqual(["careful"]);
    planWeek.mockReset();
    answerWith(() => []);
    expect(await proposeWeek({ weekStart: week, mode: "careful" })).toMatchObject({ status: "ok", model: "rules" });
    expect(planWeek).toHaveBeenCalledTimes(1);
  });

  it("is too_few_recipes before any paid call when the library cannot fill the days", async () => {
    world.recipes = world.recipes.slice(0, 2);
    expect(await proposeWeek({ weekStart: week, mode: "plan" })).toMatchObject({ status: "too_few_recipes", needed: 5, available: 2 });
    expect(planWeek).not.toHaveBeenCalled();
  });

  it("a re-roll keeps the days the user locked, in the draft and in the request, and replaces the draft", async () => {
    const first = await proposeWeek({ weekStart: week, mode: "plan" });
    if (first.status !== "ok") throw new Error("ok expected");
    const locked = await setDayLock({ draftId: first.draftId, dayIndex: 2, locked: true });
    expect(locked.status).toBe("ok");
    const keptRecipe = first.proposal.days[1].recipeId;
    planWeek.mockClear();
    answerWith((input) => input.openDays.map((dayIndex, index) => ({ dayIndex, recipeId: input.recipes[input.recipes.length - 1 - index].id })));
    const again = await proposeWeek({ weekStart: week, mode: "reroll", lockedDays: [3] });
    if (again.status !== "ok") throw new Error(JSON.stringify(again));
    const sent = planWeek.mock.calls[0][0] as PlanWeekInput;
    expect(sent.openDays).toEqual([1, 4, 5, 6].slice(0, sent.openDays.length));
    expect(sent.openDays).not.toContain(2);
    expect(sent.openDays).not.toContain(3);
    expect(again.proposal.days[1]).toMatchObject({ recipeId: keptRecipe, source: "proposed", locked: true });
    expect(again.proposal.days[2]).toMatchObject({ recipeId: first.proposal.days[2].recipeId, source: "proposed", locked: true });
    expect(again.draftId).not.toBe(first.draftId);
    expect(world.drafts.filter((draft) => draft.status === "draft")).toHaveLength(1);
    // The recipes of the kept days are not proposed again.
    expect(proposed(again.proposal).map((day) => day.recipeId).filter((id) => id === keptRecipe)).toHaveLength(1);
  });

  it("refuses a week that cannot be planned, a full week, a signed-out user and bad input, without throwing", async () => {
    expect(await proposeWeek({ weekStart: addWeeks(currentWeekStart(), -1), mode: "plan" })).toMatchObject({ status: "error" });
    expect(await proposeWeek({ weekStart: "2026-11-18", mode: "plan" })).toMatchObject({ status: "error" });
    expect(await proposeWeek({ weekStart: week, mode: "nonsense" as never })).toMatchObject({ status: "error" });
    world.dishes = [1, 2, 3, 4, 5].map((day) => dish(day, day));
    expect(await proposeWeek({ weekStart: week, mode: "plan" })).toMatchObject({ status: "error", message: "Alla dagar har redan en rätt." });
    world.signedIn = false;
    expect(await proposeWeek({ weekStart: week, mode: "plan" })).toMatchObject({ status: "error" });
    world.signedIn = true;
    world.failDishes = true;
    expect(await proposeWeek({ weekStart: week, mode: "plan" })).toMatchObject({ status: "error" });
  });
});

async function draftWeek() {
  const result = await proposeWeek({ weekStart: week, mode: "plan" });
  if (result.status !== "ok") throw new Error(JSON.stringify(result));
  return result;
}

describe("alternativesForDay, swapDay and setDayLock", () => {
  it("offers up to three other dishes without an AI call, none already in the week", async () => {
    world.dishes = [dish(7, 10)];
    const { draftId, proposal } = await draftWeek();
    planWeek.mockClear();
    const result = await alternativesForDay({ draftId, dayIndex: 2 });
    if (result.status !== "ok") throw new Error(JSON.stringify(result));
    expect(result.options).toHaveLength(3);
    const inWeek = new Set(proposal.days.map((day) => day.recipeId));
    for (const option of result.options) {
      expect(inWeek.has(option.recipeId)).toBe(false);
      expect(option.allergyWarning).toBeNull();
    }
    expect(planWeek).not.toHaveBeenCalled();
  });

  it("leaves allergen dishes out, and offers them with a warning only when nothing else is left", async () => {
    world.people = [{ name: "Anna", allergies: ["laktos"], dislikes: [], likes: [] }];
    world.recipes = world.recipes.filter((recipe) => ["Pasta med köttfärssås", "Laxfilé med potatis", "Linssoppa", "Grönsakscurry", "Wok med tofu", "Tacos med nötfärs", "Chili con carne", "Kycklinggryta", "Fiskgratäng"].includes(recipe.title));
    const { draftId } = await draftWeek();
    const normal = await alternativesForDay({ draftId, dayIndex: 1 });
    if (normal.status !== "ok") throw new Error("ok expected");
    expect(normal.options.length).toBeGreaterThan(0);
    expect(normal.options.map((option) => option.title)).not.toContain("Kycklinggryta");

    // Now every safe dish is in the week (all 7 safe ones used by the 5 days plus 2 left): shrink the library to the allergen dishes + the week.
    world.recipes = world.recipes.filter((recipe) => ["Kycklinggryta", "Fiskgratäng"].includes(recipe.title) || draftIdsInWeek().includes(recipe.id));
    const last = await alternativesForDay({ draftId, dayIndex: 1 });
    if (last.status !== "ok") throw new Error("ok expected");
    expect(last.options.length).toBeGreaterThan(0);
    expect(last.options.every((option) => option.allergyWarning !== null)).toBe(true);
  });

  function draftIdsInWeek(): string[] {
    return world.drafts[0].proposal.days.flatMap((day) => (day.recipeId ? [day.recipeId] : []));
  }

  it("refuses a day that is not the draft's to change, an unknown draft and a used draft", async () => {
    world.dishes = [dish(4, 7)];
    const { draftId } = await draftWeek();
    expect(await alternativesForDay({ draftId, dayIndex: 4 })).toMatchObject({ status: "error" });
    expect(await alternativesForDay({ draftId: rid(99), dayIndex: 2 })).toMatchObject({ status: "error" });
    expect(await alternativesForDay({ draftId, dayIndex: 9 })).toMatchObject({ status: "error" });
    expect(await swapDay({ draftId, dayIndex: 4, recipeId: rid(1) })).toMatchObject({ status: "error" });
    expect(await setDayLock({ draftId, dayIndex: 4, locked: false })).toMatchObject({ status: "error" });
    world.drafts[0].status = "used";
    expect(await swapDay({ draftId, dayIndex: 2, recipeId: rid(1) })).toMatchObject({ status: "error" });
  });

  it("swaps in the user's own choice as proposed and locked, flags an allergen but allows it, and refuses a dish already in the week", async () => {
    world.people = [{ name: "Anna", allergies: ["laktos"], dislikes: [], likes: [] }];
    const { draftId, proposal } = await draftWeek();
    const taken = proposal.days[2].recipeId ?? "";
    expect(await swapDay({ draftId, dayIndex: 2, recipeId: taken })).toMatchObject({ status: "error", message: "Den rätten finns redan i veckan." });
    expect(await swapDay({ draftId, dayIndex: 2, recipeId: rid(99) })).toMatchObject({ status: "error" });
    const gratin = world.recipes.find((recipe) => recipe.title === "Fiskgratäng")?.id ?? "";
    const swapped = await swapDay({ draftId, dayIndex: 2, recipeId: gratin });
    if (swapped.status !== "ok") throw new Error(JSON.stringify(swapped));
    expect(swapped.proposal.days[1]).toMatchObject({ recipeId: gratin, title: "Fiskgratäng", source: "proposed", locked: true });
    expect(swapped.proposal.days[1].allergyWarning).toContain("Anna");
    expect(world.drafts[0].proposal.days[1].recipeId).toBe(gratin);
  });

  it("locks and unlocks a proposed day and saves it", async () => {
    const { draftId } = await draftWeek();
    const on = await setDayLock({ draftId, dayIndex: 3, locked: true });
    expect(on.status === "ok" && on.proposal.days[2].locked).toBe(true);
    expect(world.drafts[0].proposal.days[2].locked).toBe(true);
    const off = await setDayLock({ draftId, dayIndex: 3, locked: false });
    expect(off.status === "ok" && off.proposal.days[2].locked).toBe(false);
  });
});

describe("applyWeek", () => {
  it("writes only the proposed days into the plan as week_agent, marks the draft used and writes nothing else", async () => {
    world.dishes = [dish(4, 7, "user")];
    const { draftId } = await draftWeek();
    const result = await applyWeek({ draftId, weekStart: week });
    expect(result).toEqual({ status: "ok", written: [1, 2, 3, 5], skippedOccupied: [], toBuy: 14 });
    expect(world.addCalls).toHaveLength(1);
    expect(world.addCalls[0].dishes.map((entry) => entry.weekday)).toEqual([1, 2, 3, 5]);
    expect(world.addCalls[0].replace).toEqual([]);
    expect(world.drafts[0].status).toBe("used");
    // The household's own Thursday is untouched.
    expect(world.dishes.find((entry) => entry.weekday === 4)).toMatchObject({ recipeId: rid(7), source: "user" });
  });

  it("tells how many lines the week's shopping list has, and nothing when the list cannot be read", async () => {
    const { draftId } = await draftWeek();
    world.shoppingFails = true;
    expect(await applyWeek({ draftId, weekStart: week })).toMatchObject({ status: "ok", toBuy: null });
  });

  it("never overwrites a day that got a dish after the draft was made, unless overwrite is true", async () => {
    const { draftId } = await draftWeek();
    world.dishes = [dish(2, 9, "user")];
    const result = await applyWeek({ draftId, weekStart: week });
    expect(result).toMatchObject({ status: "ok", written: [1, 3, 4, 5], skippedOccupied: [2] });
    expect(world.dishes.find((entry) => entry.weekday === 2)).toMatchObject({ recipeId: rid(9), source: "user" });
  });

  it("with overwrite replaces the occupied day's dish", async () => {
    const { draftId } = await draftWeek();
    world.dishes = [dish(2, 9, "user")];
    const result = await applyWeek({ draftId, weekStart: week, overwrite: true });
    expect(result).toMatchObject({ status: "ok", written: [1, 2, 3, 4, 5], skippedOccupied: [] });
    expect(world.addCalls[0].replace).toEqual([dish(2, 9).id]);
    expect(world.dishes.filter((entry) => entry.weekday === 2)).toHaveLength(1);
    expect(world.dishes.find((entry) => entry.weekday === 2)?.source).toBe("week_agent");
  });

  it("keeps the draft when every proposed day is taken, so the household can confirm overwrite", async () => {
    const { draftId } = await draftWeek();
    world.dishes = [1, 2, 3, 4, 5].map((day) => dish(day, day + 5 > 10 ? 10 : day + 5, "user"));
    expect(await applyWeek({ draftId, weekStart: week })).toEqual({ status: "ok", written: [], skippedOccupied: [1, 2, 3, 4, 5] });
    expect(world.addCalls).toEqual([]);
    expect(world.drafts[0].status).toBe("draft");
  });

  it("is idempotent: a used draft is never applied twice", async () => {
    const { draftId } = await draftWeek();
    expect((await applyWeek({ draftId, weekStart: week })).status).toBe("ok");
    const before = world.dishes.length;
    expect(await applyWeek({ draftId, weekStart: week })).toMatchObject({ status: "error", message: expect.stringContaining("redan använt") });
    expect(world.dishes).toHaveLength(before);
    expect(world.addCalls).toHaveLength(1);
  });

  it("gives every dish the same id on a retry, so the same draft and day can never add a dish twice", async () => {
    const { draftId } = await draftWeek();
    await applyWeek({ draftId, weekStart: week });
    world.drafts[0].status = "draft";
    world.dishes = [];
    await applyWeek({ draftId, weekStart: week });
    expect(world.addCalls[1].dishes.map((entry) => entry.id)).toEqual(world.addCalls[0].dishes.map((entry) => entry.id));
    expect(new Set(world.addCalls[0].dishes.map((entry) => entry.id)).size).toBe(5);
  });

  it("writes a day the user locked in the draft like the others", async () => {
    const { draftId } = await draftWeek();
    await setDayLock({ draftId, dayIndex: 2, locked: true });
    expect(await applyWeek({ draftId, weekStart: week })).toMatchObject({ status: "ok", written: [1, 2, 3, 4, 5] });
  });

  it("refuses another week than the draft's, a recipe that is gone, and a draft that does not exist", async () => {
    const { draftId } = await draftWeek();
    expect(await applyWeek({ draftId, weekStart: addWeeks(week, 1) })).toMatchObject({ status: "error" });
    expect(await applyWeek({ draftId: rid(98), weekStart: week })).toMatchObject({ status: "error" });
    expect(await applyWeek({ draftId: "nope", weekStart: week })).toMatchObject({ status: "error" });
    world.recipes = [];
    expect(await applyWeek({ draftId, weekStart: week })).toMatchObject({ status: "error", message: expect.stringContaining("finns inte längre") });
    expect(world.drafts[0].status).toBe("draft");
  });
});

describe("full-week Gör om (replaceAgentDays) and undoWeek", () => {
  /** 3 days of the household's own (2, 4, 6) and 4 days the agent filled (1, 3, 5, 7). */
  const fullWeek = () => {
    world.settings.dinners = 7;
    world.dishes = [dish(2, 8, "user"), dish(4, 9, null), dish(6, 10, "user"), dish(1, 1, "week_agent"), dish(3, 2, "week_agent"), dish(5, 3, "week_agent"), dish(7, 4, "week_agent")];
  };
  const own = () => JSON.stringify(world.dishes.filter((entry) => entry.source !== "week_agent"));

  it("re-proposes only the days the agent filled; the household's own days stay fixed", async () => {
    fullWeek();
    const result = await proposeWeek({ weekStart: week, mode: "plan", replaceAgentDays: true });
    if (result.status !== "ok") throw new Error(JSON.stringify(result));
    expect(proposed(result.proposal).map((day) => day.dayIndex)).toEqual([1, 3, 5, 7]);
    expect(result.proposal.days.filter((day) => day.source === "fixed").map((day) => day.dayIndex)).toEqual([2, 4, 6]);
    expect((planWeek.mock.calls[0][0] as PlanWeekInput).openDays).toEqual([1, 3, 5, 7]);
    // Only 3 dishes are left after the household's own 3 and the agent's 4, so the agent's own come back for the 4th day.
    expect(proposed(result.proposal)).toHaveLength(4);
  });

  it("without replaceAgentDays a full week has nothing open", async () => {
    fullWeek();
    expect(await proposeWeek({ weekStart: week, mode: "plan" })).toMatchObject({ status: "error", message: "Alla dagar har redan en rätt." });
  });

  it("replaces exactly the agent's days on apply and leaves the household's days byte-identical, then Ångra puts the old agent dishes back", async () => {
    fullWeek();
    const before = own();
    const agentBefore = world.dishes.filter((entry) => entry.source === "week_agent").map((entry) => entry.id).sort();
    const result = await proposeWeek({ weekStart: week, mode: "plan", replaceAgentDays: true });
    if (result.status !== "ok") throw new Error("ok expected");
    const applied = await applyWeek({ draftId: result.draftId, weekStart: week, replaceAgentDays: true });
    expect(applied).toMatchObject({ status: "ok", written: [1, 3, 5, 7], skippedOccupied: [] });
    expect(own()).toBe(before);
    expect(world.addCalls[0].replace.sort()).toEqual(agentBefore);
    expect(world.dishes.filter((entry) => entry.source === "week_agent").map((entry) => entry.weekday).sort()).toEqual([1, 3, 5, 7]);

    const undone = await undoWeek({ draftId: result.draftId });
    expect(undone).toEqual({ status: "ok", removed: [1, 3, 5, 7], restored: [1, 3, 5, 7] });
    expect(own()).toBe(before);
    expect(world.dishes.filter((entry) => entry.source === "week_agent").map((entry) => entry.id).sort()).toEqual(agentBefore);
    expect(world.drafts.find((entry) => entry.id === result.draftId)?.status).toBe("draft");
  });

  it("never touches a household day with replaceAgentDays alone, even when the draft proposed a day that became the household's", async () => {
    const { draftId } = await draftWeek();
    world.dishes = [dish(2, 9, "user")];
    const before = JSON.stringify(world.dishes);
    expect(await applyWeek({ draftId, weekStart: week, replaceAgentDays: true })).toMatchObject({ status: "ok", written: [1, 3, 4, 5], skippedOccupied: [2] });
    expect(JSON.stringify(world.dishes.filter((entry) => entry.weekday === 2))).toBe(JSON.stringify(JSON.parse(before)));
  });

  it("does not replace a dish Ångra could not put back (cooked, or without a recipe): the day counts as occupied", async () => {
    const { draftId } = await draftWeek();
    world.dishes = [{ ...dish(2, 9, "week_agent"), cookedAt: "2026-11-01T10:00:00Z" }, dish(3, null, "week_agent")];
    expect(await applyWeek({ draftId, weekStart: week, replaceAgentDays: true, overwrite: true })).toMatchObject({ status: "ok", written: [1, 4, 5], skippedOccupied: [2, 3] });
  });

  describe("undoWeek", () => {
    it("removes exactly the dishes apply wrote and puts an overwritten household day back", async () => {
      const { draftId } = await draftWeek();
      world.dishes = [dish(2, 9, "user"), dish(6, 10, "user")];
      await applyWeek({ draftId, weekStart: week, overwrite: true });
      expect(world.dishes.find((entry) => entry.weekday === 2)?.source).toBe("week_agent");
      const result = await undoWeek({ draftId });
      expect(result).toEqual({ status: "ok", removed: [1, 2, 3, 4, 5], restored: [2] });
      expect(world.dishes.map((entry) => [entry.weekday, entry.recipeId, entry.source]).sort()).toEqual([[2, rid(9), "user"], [6, rid(10), "user"]]);
      expect(world.drafts[0].status).toBe("draft");
      expect(world.drafts[0].applied).toBeUndefined();
    });

    it("is idempotent, and ok with nothing removed for a draft that was never applied", async () => {
      const { draftId } = await draftWeek();
      expect(await undoWeek({ draftId })).toEqual({ status: "ok", removed: [], restored: [] });
      await applyWeek({ draftId, weekStart: week });
      expect(await undoWeek({ draftId })).toMatchObject({ status: "ok", removed: [1, 2, 3, 4, 5] });
      expect(await undoWeek({ draftId })).toEqual({ status: "ok", removed: [], restored: [] });
      expect(world.dishes).toEqual([]);
      expect(world.undoCalls).toHaveLength(1);
    });

    it("ends as discarded when the week got another draft meanwhile, and refuses unknown ids, bad input and a signed-out user", async () => {
      const { draftId } = await draftWeek();
      await applyWeek({ draftId, weekStart: week });
      world.drafts.push({ ...world.drafts[0], id: rid(96), status: "draft" });
      delete world.drafts[1].applied;
      expect(await undoWeek({ draftId })).toMatchObject({ status: "ok" });
      expect(world.drafts.find((entry) => entry.id === draftId)?.status).toBe("discarded");
      expect(await undoWeek({ draftId: rid(97) })).toMatchObject({ status: "error" });
      expect(await undoWeek({ draftId: "nope" })).toMatchObject({ status: "error" });
      world.signedIn = false;
      expect(await undoWeek({ draftId })).toMatchObject({ status: "error", message: expect.stringContaining("logga in") });
    });
  });
});

describe("discardDraft, saveWeekAgentSettings and getWeekAgentContext", () => {
  it("discards a draft once, then says it is gone", async () => {
    const { draftId } = await draftWeek();
    expect(await discardDraft({ draftId })).toEqual({ status: "ok" });
    expect(await discardDraft({ draftId })).toMatchObject({ status: "error" });
    expect(await discardDraft({ draftId: "x" as never })).toMatchObject({ status: "error" });
  });

  it("saves valid settings with the day roles resolved and refuses invalid ones", async () => {
    const settings = { dinners: 4, budget: "low" as const, vegetarianDays: [2, 3], skipDays: [3], leftoverDays: [], quickWeekdays: true, useSoonFirst: false, favourOffers: true, offerStoreIds: [] };
    expect(await saveWeekAgentSettings(settings)).toEqual({ status: "ok" });
    expect(world.savedSettings).toMatchObject({ dinners: 4, skipDays: [3], vegetarianDays: [2] });
    expect(await saveWeekAgentSettings({ ...settings, dinners: 9 })).toMatchObject({ status: "error" });
    expect(await saveWeekAgentSettings({ ...settings, extra: 1 } as never)).toMatchObject({ status: "error" });
    world.signedIn = false;
    expect(await saveWeekAgentSettings(settings)).toMatchObject({ status: "error" });
  });

  it("reads the context of a week: settings, draft, filled and empty days, recipe count", async () => {
    world.dishes = [dish(2, 1), dish(2, 2), dish(5, 3), { ...dish(6, 4), weekday: null }];
    const { draftId } = await draftWeek();
    const context = await getWeekAgentContext(week);
    expect(context.filledDays).toEqual([2, 5]);
    expect(context.emptyDays).toEqual([1, 3, 4, 6, 7]);
    expect(context.recipeCount).toBe(10);
    expect(context.draft?.id).toBe(draftId);
    expect(context.settings.dinners).toBe(5);
  });
});
