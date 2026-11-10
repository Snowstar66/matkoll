import type { AiService, PlanWeekInput, PlanWeekQuality } from "@/server/ai";
import { cleanModelText } from "@/lib/suggest-input";
import { dayWord, isVegetarian } from "./domain/facts";
import { openDays, planAroundFixed, planDeterministic, validatePicks } from "./domain/plan";
import type { DayPick, OfferHit, PlanInput, PlanResult, UseSoonItem, Violation } from "./domain/types";

// The AI half of the planning, with the port injected (so it is tested with a fake and run by the eval with the real
// one): the shortlist goes to the model, every answer goes through validatePicks, a hard violation gets one more try on
// Sonnet, and whatever happens the week ends in planAroundFixed (the model is never trusted) or, when the model fails,
// planDeterministic. Allergies are checked in code every time. Pure apart from the port call.

export type PlanModel = "haiku-5.5" | "sonnet-5.5" | "rules";
export type PlanMode = "plan" | "reroll" | "careful";

export type AiPlanOutcome =
  | { status: "ok"; result: Extract<PlanResult, { status: "ok" }>; model: PlanModel; retried: boolean; violations: Violation[] }
  | Extract<PlanResult, { status: "too_few_recipes" }>
  | { status: "cap_reached" };

const modelOf = (quality: PlanWeekQuality): PlanModel => (quality === "careful" ? "sonnet-5.5" : "haiku-5.5");

const maxIngredientLines = 8;
const ingredientChars = 50;
const maxFacts = 4;

const clip = (text: string, max: number) => Array.from(cleanModelText(text)).slice(0, max).join("");

/** "Laxfilé 79 kr/kg hos ICA". */
export function offerFact(offer: OfferHit): string {
  return clip([offer.name, offer.price, offer.store ? `hos ${offer.store}` : null].filter(Boolean).join(" "), 90);
}

/** "grädde, går ut fredag" / "grädde, behöver användas snart". */
export function useSoonFact(item: UseSoonItem): string {
  const when = !item.expiresWeekday ? "behöver användas snart" : item.today ? (item.estimated ? "bör ätas idag" : "går ut idag") : `${item.estimated ? "håller till ca" : "går ut"} ${dayWord(item.expiresWeekday)}`;
  return clip(`${item.name}, ${when}`, 90);
}

/** The words the household likes or dislikes, without who, each once. */
function words(lists: readonly (readonly string[])[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of lists.flat().map((text) => clip(text, 40))) {
    const key = word.toLocaleLowerCase("sv-SE");
    if (word !== "" && !seen.has(key)) {
      seen.add(key);
      out.push(word);
    }
  }
  return out.slice(0, 12);
}

/** What the model is given: the shortlist as text with its facts, the rules, tastes as words (no names, no allergies), recent dishes by title. */
export function toPortInput(input: PlanInput, quality: PlanWeekQuality): PlanWeekInput {
  const { settings } = input;
  const titleOf = new Map(input.candidates.map((candidate) => [candidate.id, candidate.title]));
  return {
    weekStart: input.weekStart,
    openDays: openDays(input),
    recipes: input.candidates.map((candidate) => ({
      id: candidate.id,
      title: clip(candidate.title, 100),
      ingredients: candidate.ingredients.slice(0, maxIngredientLines).map((line) => clip(line, ingredientChars)).filter((line) => line !== ""),
      minutes: candidate.totalMinutes,
      vegetarian: isVegetarian(candidate),
      offers: settings.favourOffers ? (candidate.offers ?? []).slice(0, maxFacts).map(offerFact) : [],
      useSoon: settings.useSoonFirst ? (candidate.useSoon ?? []).slice(0, maxFacts).map(useSoonFact) : [],
    })),
    fixedDays: input.fixedDays.map((fixed) => ({ dayIndex: fixed.dayIndex, title: clip(fixed.title, 100) })),
    vegetarianDays: settings.vegetarianDays,
    leftoverDays: settings.leftoverDays,
    skipDays: settings.skipDays,
    budget: settings.budget,
    quickWeekdays: settings.quickWeekdays,
    useSoonFirst: settings.useSoonFirst,
    favourOffers: settings.favourOffers,
    likes: words(input.people.map((person) => person.likes)),
    dislikes: words(input.people.map((person) => person.dislikes)),
    recent: input.recent.flatMap((entry) => {
      const title = titleOf.get(entry.recipeId);
      return title ? [{ title: clip(title, 100), weeksAgo: entry.weeksAgo }] : [];
    }).slice(0, 20),
    quality,
  };
}

type Port = Pick<AiService, "planWeek">;
type Asked = { kind: "picks"; picks: DayPick[] } | { kind: "cap" } | { kind: "failed"; code: string };

async function ask(ai: Port, input: PlanInput, quality: PlanWeekQuality, signal: AbortSignal, deadline: number | undefined): Promise<Asked> {
  const answer = await ai.planWeek(toPortInput(input, quality), signal, deadline === undefined ? undefined : { deadline });
  if (answer.ok) return { kind: "picks", picks: answer.data.picks.map(({ dayIndex, recipeId }) => ({ dayIndex, recipeId })) };
  return answer.error.code === "ai_cap_reached" ? { kind: "cap" } : { kind: "failed", code: answer.error.code };
}

const hard = (violations: readonly Violation[]) => violations.some((violation) => violation.severity === "hard");

/**
 * The week for `input` (the shortlist already made): plan and reroll ask Haiku 5.5 at low effort, careful asks Sonnet
 * 5.5 at medium. A pick set with a hard violation, or an answer that is not valid, is asked once more on Sonnet
 * (careful has nothing above it); if that fails too, or the call fails, the rules plan the week (`model: "rules"`).
 * The daily cap of the first call is `cap_reached`; a cap reached on the retry falls back to the rules.
 */
export async function planWithAi(ai: Port, input: PlanInput, excluded: PlanInputExcluded, mode: PlanMode, signal: AbortSignal, deadline?: number): Promise<AiPlanOutcome> {
  const rules = (retried: boolean): AiPlanOutcome => {
    const result = planDeterministic(input, excluded);
    return result.status === "ok" ? { status: "ok", result, model: "rules", retried, violations: result.violations } : result;
  };
  if (openDays(input).length === 0) return rules(false);

  const first: PlanWeekQuality = mode === "careful" ? "careful" : "standard";
  const one = await ask(ai, input, first, signal, deadline);
  if (one.kind === "cap") return { status: "cap_reached" };
  // A failed call is not worth another paid try unless the answer was unusable (ai_invalid): then Sonnet may do better.
  if (one.kind === "failed" && one.code !== "ai_invalid") return rules(false);
  if (one.kind === "picks" && !hard(validatePicks(input, one.picks))) return accept(input, one.picks, excluded, modelOf(first), false);
  if (first === "careful") return rules(false);

  const two = await ask(ai, input, "careful", signal, deadline);
  if (two.kind === "picks" && !hard(validatePicks(input, two.picks))) return accept(input, two.picks, excluded, "sonnet-5.5", true);
  return rules(true);
}

type PlanInputExcluded = Extract<PlanResult, { status: "too_few_recipes" }>["excludedForAllergy"];

function accept(input: PlanInput, picks: readonly DayPick[], excluded: PlanInputExcluded, model: PlanModel, retried: boolean): AiPlanOutcome {
  // Always through planAroundFixed: the picks were valid, and this builds the week with the facts from the code.
  const result = planAroundFixed(input, picks, excluded);
  return result.status === "ok" ? { status: "ok", result, model, retried, violations: result.violations } : result;
}
