import { allergenTerms, ingredientWords, isVegetarian, kindOf, sharedWord, dayWord } from "./facts";
import { fixedFacts, proposedFacts } from "./reasons";
import { quickMinutes } from "./shortlist";
import { cookableDays } from "./settings";
import type { DaySlot, FixedDay, DayPick, PlanInput, PlanResult, ProposalDay, RecipeCandidate, Violation, WeekProposal } from "./types";

// From the shortlist and the days already fixed to a week: which days are open, a deterministic fallback planner, the
// validation of picks (from the model or the fallback) and the proposal built from them. Pure.
// Fixed days are LOCKED: they are never changed, only planned around. Only open days (empty, a cooking day, within
// the number of dinners) get a dish. Hard rules (allergy, duplicates, vegetarian days) are checked in code here, never
// left to a prompt.

const allDays = [1, 2, 3, 4, 5, 6, 7];

type Roles = { fixed: Map<number, FixedDay>; leftover: Set<number>; skip: Set<number>; open: number[]; needed: number };

/** What each weekday is: fixed (wins over everything), leftover, skip, or open for a dish (the first days that are empty, up to the number of dinners). */
export function dayRoles(input: Pick2): Roles {
  const fixed = new Map<number, FixedDay>();
  for (const day of input.fixedDays) if (day.dayIndex >= 1 && day.dayIndex <= 7 && !fixed.has(day.dayIndex)) fixed.set(day.dayIndex, day);
  const past = new Set(input.pastDays ?? []);
  const eligible = cookableDays(input.settings).filter((day) => !fixed.has(day) && !past.has(day));
  const needed = Math.min(eligible.length, Math.max(0, input.settings.dinners - fixed.size));
  return {
    fixed,
    leftover: new Set(input.settings.leftoverDays.filter((day) => !fixed.has(day) && !input.settings.skipDays.includes(day))),
    skip: new Set(input.settings.skipDays.filter((day) => !fixed.has(day))),
    open: eligible.slice(0, needed),
    needed,
  };
}
type Pick2 = Pick<PlanInput, "settings" | "fixedDays" | "pastDays">;

/** The days a dish is still wanted on, in order. */
export const openDays = (input: Pick2): number[] => dayRoles(input).open;

const recipeIdsOf = (input: PlanInput) => new Set(input.fixedDays.flatMap((fixed) => (fixed.recipeId ? [fixed.recipeId] : [])));

function neighbourKinds(dayIndex: number, kinds: ReadonlyMap<number, string>, distance: number): number {
  let near = 0;
  for (let d = 1; d <= distance; d++) near += [kinds.get(dayIndex - d), kinds.get(dayIndex + d)].filter(Boolean).length;
  return near;
}

// ---- Validation ----------------------------------------------------------------------------------------

type Checked = { valid: DayPick[]; violations: Violation[] };

function check(input: PlanInput, picks: readonly DayPick[]): Checked {
  const roles = dayRoles(input);
  const byId = new Map(input.candidates.map((candidate) => [candidate.id, candidate]));
  const fixedIds = recipeIdsOf(input);
  const violations: Violation[] = [];
  const valid: DayPick[] = [];
  const usedDays = new Set<number>();
  const usedRecipes = new Set<string>();
  for (const pick of picks) {
    const { dayIndex, recipeId } = pick;
    const candidate = byId.get(recipeId);
    if (roles.fixed.has(dayIndex)) {
      violations.push({ code: "fixed_day_touched", severity: "hard", dayIndex, recipeId, message: `${dayWord(dayIndex)} har redan en rätt och ändras inte` });
      continue;
    }
    if (!roles.open.includes(dayIndex) || usedDays.has(dayIndex)) {
      violations.push({ code: "day_not_open", severity: "hard", dayIndex, recipeId, message: `${Number.isInteger(dayIndex) ? dayWord(dayIndex) || "Dagen" : "Dagen"} ska inte få en rätt` });
      continue;
    }
    if (!candidate) {
      violations.push({ code: "unknown_recipe", severity: "hard", dayIndex, recipeId, message: "Receptet finns inte i urvalet" });
      continue;
    }
    // Allergy is checked again here, whatever the shortlist said: the hard rule lives in code.
    if (allergenTerms(candidate, input.people)) {
      violations.push({ code: "allergen_dish", severity: "hard", dayIndex, recipeId, message: `${candidate.title} kan innehålla något någon i hushållet är allergisk mot` });
      continue;
    }
    if (usedRecipes.has(recipeId) || fixedIds.has(recipeId)) {
      violations.push({ code: "duplicate_recipe", severity: "hard", dayIndex, recipeId, message: `${candidate.title} finns redan i veckan` });
      continue;
    }
    if (input.settings.vegetarianDays.includes(dayIndex) && !isVegetarian(candidate)) {
      violations.push({ code: "vegetarian_day_meat", severity: "hard", dayIndex, recipeId, message: `${candidate.title} är inte vegetarisk men ${dayWord(dayIndex)} ska vara det` });
      continue;
    }
    usedDays.add(dayIndex);
    usedRecipes.add(recipeId);
    valid.push(pick);
  }
  if (valid.length !== roles.needed) {
    violations.push({ code: "wrong_dinner_count", severity: "hard", message: `${valid.length} av ${roles.needed} middagar har en giltig rätt` });
  }
  violations.push(...softViolations(input, valid, byId));
  return { valid, violations };
}

function softViolations(input: PlanInput, valid: readonly DayPick[], byId: ReadonlyMap<string, RecipeCandidate>): Violation[] {
  const out: Violation[] = [];
  const kinds = new Map<number, string>();
  for (const fixed of input.fixedDays) kinds.set(fixed.dayIndex, kindOf(fixed));
  for (const pick of valid) {
    const candidate = byId.get(pick.recipeId);
    if (candidate) kinds.set(pick.dayIndex, kindOf(candidate));
  }
  const recent = new Map(input.recent.map((entry) => [entry.recipeId, entry.weeksAgo]));
  for (const pick of [...valid].sort((a, b) => a.dayIndex - b.dayIndex)) {
    const candidate = byId.get(pick.recipeId);
    if (!candidate) continue;
    const kind = kinds.get(pick.dayIndex);
    if (kind && kinds.get(pick.dayIndex - 1) === kind) {
      out.push({ code: "same_kind_adjacent", severity: "soft", dayIndex: pick.dayIndex, recipeId: pick.recipeId, message: `${candidate.title} är samma sorts rätt som dagen före` });
    }
    if (input.settings.quickWeekdays && pick.dayIndex <= 5 && candidate.totalMinutes !== null && candidate.totalMinutes > quickMinutes) {
      out.push({ code: "slow_weekday", severity: "soft", dayIndex: pick.dayIndex, recipeId: pick.recipeId, message: `${candidate.title} tar ${candidate.totalMinutes} minuter en vardag` });
    }
    const weeksAgo = recent.get(pick.recipeId);
    if (weeksAgo !== undefined && weeksAgo <= 1) {
      out.push({ code: "recent_repeat", severity: "soft", dayIndex: pick.dayIndex, recipeId: pick.recipeId, message: `${candidate.title} lagades nyligen` });
    }
  }
  return out;
}

/** What is wrong with a set of picks for the open days, hard ones first. Nothing is dropped: the caller decides (retry with Sonnet, or planAroundFixed which drops the invalid ones). */
export function validatePicks(input: PlanInput, picks: readonly DayPick[]): Violation[] {
  return sorted(check(input, picks).violations);
}

const sorted = (violations: Violation[]) => [...violations].sort((a, b) => Number(b.severity === "hard") - Number(a.severity === "hard") || (a.dayIndex ?? 0) - (b.dayIndex ?? 0));

/**
 * What is wrong with a whole proposal (also one the user edited): the fixed days must be there unchanged, and the
 * proposed days are held to the same rules as picks. `candidates` must hold every proposed recipe.
 */
export function validatePlan(input: PlanInput, proposal: WeekProposal): Violation[] {
  const violations: Violation[] = [];
  for (const fixed of input.fixedDays) {
    const day = proposal.days.find((entry) => entry.dayIndex === fixed.dayIndex);
    if (!day || day.recipeId !== fixed.recipeId || day.title !== fixed.title) {
      violations.push({ code: "fixed_day_touched", severity: "hard", dayIndex: fixed.dayIndex, message: `${dayWord(fixed.dayIndex)} ska vara oförändrad` });
    }
  }
  const picks = proposal.days.flatMap((day) => (day.recipeId && !input.fixedDays.some((fixed) => fixed.dayIndex === day.dayIndex) ? [{ dayIndex: day.dayIndex, recipeId: day.recipeId }] : []));
  return sorted([...violations, ...check(input, picks).violations]);
}

// ---- The proposal --------------------------------------------------------------------------------------

function buildProposal(input: PlanInput, picks: readonly DayPick[]): WeekProposal {
  const roles = dayRoles(input);
  const byId = new Map(input.candidates.map((candidate) => [candidate.id, candidate]));
  const pickOf = new Map(picks.map((pick) => [pick.dayIndex, pick.recipeId]));
  const days: ProposalDay[] = allDays.map((dayIndex): ProposalDay => {
    const fixed = roles.fixed.get(dayIndex);
    if (fixed) {
      const proposedLock = fixed.source === "proposed";
      return { dayIndex, slot: "dinner", recipeId: fixed.recipeId, title: fixed.title, source: proposedLock ? "proposed" : "fixed", locked: true, offerTags: [], useSoonTags: [], ...fixedFacts(fixed, input) };
    }
    const slot: DaySlot = roles.leftover.has(dayIndex) ? "leftover" : roles.open.includes(dayIndex) ? "dinner" : "skip";
    const empty = { dayIndex, slot, recipeId: null, title: null, source: "proposed" as const, locked: false, reasons: [], offerTags: [], useSoonTags: [], allergyWarning: null };
    if (slot === "leftover") return { ...empty, reasons: ["Rester eller matlåda"] };
    const candidate = byId.get(pickOf.get(dayIndex) ?? "");
    return candidate ? { ...empty, recipeId: candidate.id, title: candidate.title, ...proposedFacts(candidate, dayIndex, input) } : empty;
  });
  return { weekStart: input.weekStart, days };
}

/**
 * The week from picks (the model's or the fallback's): invalid picks are dropped and reported, fixed days stay as they
 * are, only open days get a dish. `excludedForAllergy` is what the shortlist left out (pass buildShortlist's list
 * on); `too_few_recipes` when the shortlist cannot cover the open days at all.
 */
export function planAroundFixed(input: PlanInput, picks: readonly DayPick[], excludedForAllergy: PlanResultExcluded = []): PlanResult {
  const roles = dayRoles(input);
  const usable = input.candidates.filter((candidate) => !allergenTerms(candidate, input.people) && !recipeIdsOf(input).has(candidate.id));
  if (usable.length < roles.needed) return { status: "too_few_recipes", needed: roles.needed, available: usable.length, excludedForAllergy };
  const { valid, violations } = check(input, picks);
  return { status: "ok", proposal: buildProposal(input, valid), excludedForAllergy, violations: sorted(violations) };
}
type PlanResultExcluded = Extract<PlanResult, { status: "too_few_recipes" }>["excludedForAllergy"];

// ---- The deterministic fallback -------------------------------------------------------------------------

function dayScore(candidate: RecipeCandidate, rank: number, total: number, dayIndex: number, input: PlanInput, kinds: ReadonlyMap<number, string>): number {
  let score = (total - rank) * 0.2;
  const kind = kindOf(candidate);
  const adjacent = [kinds.get(dayIndex - 1), kinds.get(dayIndex + 1)].filter((k) => k === kind).length;
  score -= adjacent * 6 + (neighbourKinds(dayIndex, kinds, 2) > 0 && [kinds.get(dayIndex - 2), kinds.get(dayIndex + 2)].includes(kind) ? 2 : 0);
  if (input.settings.useSoonFirst) {
    const soon = candidate.useSoon ?? [];
    for (const item of soon) {
      if (item.expiresWeekday === null) score += 2;
      else score += item.expiresWeekday >= dayIndex ? 4 + (7 - item.expiresWeekday) * 0.1 - (item.expiresWeekday - dayIndex) * 0.3 : -6;
    }
  }
  if (input.settings.quickWeekdays && dayIndex <= 5 && candidate.totalMinutes !== null && candidate.totalMinutes > quickMinutes) score -= 6;
  const words = ingredientWords(candidate.ingredients);
  if (input.fixedDays.some((fixed) => sharedWord(words, ingredientWords(fixed.ingredients)))) score += 1.5;
  return score;
}

/**
 * The picks when there is no model: for each open day, in order, the best remaining candidate by the shortlist's rank
 * with the day's own fit (vegetarian days only get vegetarian dishes; no same kind of dish two days in a row; things
 * that go out soon early; quick dishes on weekdays when asked). May return fewer picks than open days.
 */
export function fallbackPicks(input: PlanInput): DayPick[] {
  const roles = dayRoles(input);
  const used = new Set(recipeIdsOf(input));
  const kinds = new Map<number, string>(input.fixedDays.map((fixed) => [fixed.dayIndex, kindOf(fixed)]));
  const total = input.candidates.length;
  const picks: DayPick[] = [];
  // The most constrained days choose first (vegetarian days, then the weekend when weekdays are quick), so a
  // scarce fitting dish is not used up on a day where anything would do.
  const rankOfDay = (day: number) => (input.settings.vegetarianDays.includes(day) ? 0 : input.settings.quickWeekdays && day > 5 ? 1 : 2);
  const order = [...roles.open].sort((a, b) => rankOfDay(a) - rankOfDay(b) || a - b);
  for (const dayIndex of order) {
    const vegOnly = input.settings.vegetarianDays.includes(dayIndex);
    let best: { candidate: RecipeCandidate; score: number } | null = null;
    input.candidates.forEach((candidate, rank) => {
      if (used.has(candidate.id) || allergenTerms(candidate, input.people)) return;
      if (vegOnly && !isVegetarian(candidate)) return;
      const score = dayScore(candidate, rank, total, dayIndex, input, kinds);
      if (!best || score > best.score) best = { candidate, score };
    });
    const chosen = best as { candidate: RecipeCandidate; score: number } | null;
    if (!chosen) continue;
    used.add(chosen.candidate.id);
    kinds.set(dayIndex, kindOf(chosen.candidate));
    picks.push({ dayIndex, recipeId: chosen.candidate.id });
  }
  return picks.sort((a, b) => a.dayIndex - b.dayIndex);
}

/** The whole plan without a model (used when the AI fails, and in tests): fallbackPicks, validated and assembled. */
export function planDeterministic(input: PlanInput, excludedForAllergy: PlanResultExcluded = []): PlanResult {
  const picks = fallbackPicks(input);
  const needed = dayRoles(input).needed;
  if (picks.length < needed) return { status: "too_few_recipes", needed, available: picks.length, excludedForAllergy };
  return planAroundFixed(input, picks, excludedForAllergy);
}
