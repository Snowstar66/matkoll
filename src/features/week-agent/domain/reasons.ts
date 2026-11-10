import { foodFit } from "@/features/menu-advisor";
import { allergyWarningText, capitalize, dayWord, ingredientWords, sharedWord, titleOnDay } from "./facts";
import type { FixedDay, OfferHit, PlanInput, ProposalDay, RecipeCandidate, UseSoonTag } from "./types";

// The short "why" under each day, built from facts in code (offer, expiry, the neighbouring fixed dish, a liked
// ingredient). No model text is needed, so a reason is never invented. At most three per day.

const maxReasons = 3;

export function offerReason(offer: OfferHit): string {
  const what = offer.price ? `${offer.name} (${offer.price})` : offer.name;
  return offer.store ? `Extrapris på ${what} hos ${offer.store}` : `Extrapris på ${what}`;
}

export function useSoonReason(item: UseSoonTag): string {
  const name = capitalize(item.name);
  return item.expiresWeekday ? `${name} går ut ${dayWord(item.expiresWeekday)}` : `${name} behöver användas snart`;
}

/** The facts about the days around a proposed day that are fixed or locked ("Efter Pannkaka torsdag"). */
function neighbourReasons(dayIndex: number, fixedDays: readonly FixedDay[], candidate: RecipeCandidate): string[] {
  const out: string[] = [];
  const before = fixedDays.find((fixed) => fixed.dayIndex === dayIndex - 1);
  const after = fixedDays.find((fixed) => fixed.dayIndex === dayIndex + 1);
  if (before) out.push(`Efter ${titleOnDay(before.title, before.dayIndex)}`);
  else if (after) out.push(`Före ${titleOnDay(after.title, after.dayIndex)}`);
  const words = ingredientWords(candidate.ingredients);
  for (const fixed of fixedDays) {
    const word = sharedWord(words, ingredientWords(fixed.ingredients));
    if (word) {
      out.push(`Använder också ${word} från ${titleOnDay(fixed.title, fixed.dayIndex)}`);
      break;
    }
  }
  return out;
}

/** The offers, expiry tags and reasons of a recipe proposed for `dayIndex`. */
export function proposedFacts(candidate: RecipeCandidate, dayIndex: number, input: PlanInput): Pick<ProposalDay, "reasons" | "offerTags" | "useSoonTags"> {
  const { settings } = input;
  const offerTags = settings.favourOffers ? [...(candidate.offers ?? [])] : [];
  const useSoonTags = settings.useSoonFirst ? (candidate.useSoon ?? []).map((item) => ({ name: item.name, expiresWeekday: item.expiresWeekday })) : [];
  const reasons: string[] = [
    ...offerTags.slice(0, 2).map(offerReason),
    ...useSoonTags.slice(0, 2).map(useSoonReason),
    ...neighbourReasons(dayIndex, input.fixedDays, candidate),
  ];
  const like = foodFit({ name: candidate.title, ingredients: [...candidate.ingredients] }, input.people).find((note) => note.kind === "like");
  if (like) reasons.push(like.text);
  return { reasons: reasons.slice(0, maxReasons), offerTags, useSoonTags };
}

/** A day the household fixed (or locked): its own choice, with the allergy warning when it holds an allergen. */
export function fixedFacts(fixed: FixedDay, input: PlanInput): Pick<ProposalDay, "reasons" | "allergyWarning"> {
  return {
    reasons: [fixed.placedBy === "week_agent" ? "Från ett tidigare förslag" : "Er egen rätt"],
    allergyWarning: fixed.source === "proposed" ? null : allergyWarningText(fixed, input.people),
  };
}
