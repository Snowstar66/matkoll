"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { updateDraftIn } from "../data/week-agent";
import { allergyWarningText, isVegetarian, kindOf } from "../domain/facts";
import { proposedFacts } from "../domain/reasons";
import { buildShortlist } from "../domain/shortlist";
import type { PlanInput, ProposalDay, RecipeCandidate, WeekProposal } from "../domain/types";
import { readWeekPool } from "../context";
import type { AlternativeOption, AlternativesInput, AlternativesResult, DraftResult, SetDayLockInput, SwapDayInput } from "./contract";
import { draftById, guarded, messages, settingsOfHousehold, signedIn } from "./support";

const dayIndexSchema = z.number().int().min(1).max(7);
const uuid = z.uuid();
const alternativesSchema = z.object({ draftId: uuid, dayIndex: dayIndexSchema });
const swapSchema = z.object({ draftId: uuid, dayIndex: dayIndexSchema, recipeId: uuid });
const lockSchema = z.object({ draftId: uuid, dayIndex: dayIndexSchema, locked: z.boolean() });

const maxAlternatives = 3;

const dayOf = (proposal: WeekProposal, dayIndex: number): ProposalDay | undefined => proposal.days.find((day) => day.dayIndex === dayIndex);

/** The draft's own dishes as fixed days (except `exceptDay`), so the shortlist leaves them out and a new dish fits around them. */
const asFixed = (proposal: WeekProposal, exceptDay: number, ingredientsOf: (id: string | null) => string[]): PlanInput["fixedDays"] =>
  proposal.days.flatMap((day) => (day.dayIndex !== exceptDay && day.slot === "dinner" && day.title !== null ? [{ dayIndex: day.dayIndex, recipeId: day.recipeId, title: day.title, ingredients: ingredientsOf(day.recipeId), source: day.source }] : []));

/**
 * "Byt en middag": up to three other dishes for one day of the draft, from the same ranked shortlist, without an AI
 * call. Dishes that may hold an allergen are left out unless nothing else is left (then they come with
 * `allergyWarning`); a dish already in the week is never offered; a vegetarian day gets vegetarian dishes first.
 */
export async function alternativesForDay(input: AlternativesInput): Promise<AlternativesResult> {
  const user = await signedIn();
  if (!user.ok) return { status: "error", message: user.message };
  const parsed = alternativesSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: messages.invalid };
  const { draftId, dayIndex } = parsed.data;

  return guarded(async (): Promise<AlternativesResult> => {
    const draft = await draftById(draftId);
    if (!draft) return { status: "error", message: messages.noDraft };
    const day = dayOf(draft.proposal, dayIndex);
    if (!day || day.slot !== "dinner" || day.source === "fixed") return { status: "error", message: messages.invalid };

    const settings = await settingsOfHousehold();
    const pool = await readWeekPool(draft.weekStart, settings);
    // The week as it stands, except the day: every other dish is "fixed" so none is offered twice.
    const others = asFixed(draft.proposal, dayIndex, pool.linesOf);
    const context = { weekStart: draft.weekStart, settings, fixedDays: others, people: pool.people, recent: pool.recent };
    const onPlan = new Set(pool.dishes.flatMap((dish) => (dish.recipeId ? [dish.recipeId] : [])));
    const candidates = pool.pool.filter((candidate) => !onPlan.has(candidate.id) && candidate.id !== day.recipeId);
    const shortlist = buildShortlist(candidates, context);
    const input2: PlanInput = { ...context, candidates: shortlist.candidates };

    const neighbours = [dayOf(draft.proposal, dayIndex - 1), dayOf(draft.proposal, dayIndex + 1)].flatMap((other) => (other?.title ? [kindOf({ title: other.title, ingredients: pool.linesOf(other.recipeId) })] : []));
    const wantsVegetarian = settings.vegetarianDays.includes(dayIndex);
    const ranked = [...shortlist.candidates].sort((a, b) => Number(wantsVegetarian && !isVegetarian(a)) - Number(wantsVegetarian && !isVegetarian(b)) || Number(neighbours.includes(kindOf(a))) - Number(neighbours.includes(kindOf(b))));
    let picked: RecipeCandidate[] = ranked.slice(0, maxAlternatives);
    let warned = false;
    if (picked.length === 0) {
      // Nothing safe is left: the dishes held back for an allergy come with their warning, the household decides.
      const held = new Set(shortlist.excludedForAllergy.map((excluded) => excluded.recipeId));
      picked = candidates.filter((candidate) => held.has(candidate.id)).slice(0, maxAlternatives);
      warned = true;
    }
    const options: AlternativeOption[] = picked.map((candidate) => ({
      recipeId: candidate.id,
      title: candidate.title,
      reasons: proposedFacts(candidate, dayIndex, input2).reasons,
      allergyWarning: warned ? allergyWarningText(candidate, pool.people) : null,
    }));
    return { status: "ok", options };
  });
}

/** Saves the changed proposal; `false` when the draft has been used or discarded meanwhile. */
async function saveProposal(draftId: string, proposal: WeekProposal, model: string | null): Promise<boolean> {
  return updateDraftIn(await createClient(), draftId, proposal, model ?? "rules");
}

/**
 * The user's own choice for a day of the draft: any recipe of the library that is not already in the week. It is
 * flagged when it may hold an allergen (`allergyWarning`) but allowed, and the day becomes proposed and locked, so
 * "Gör om" leaves it.
 */
export async function swapDay(input: SwapDayInput): Promise<DraftResult> {
  const user = await signedIn();
  if (!user.ok) return { status: "error", message: user.message };
  const parsed = swapSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: messages.invalid };
  const { draftId, dayIndex, recipeId } = parsed.data;

  return guarded(async (): Promise<DraftResult> => {
    const draft = await draftById(draftId);
    if (!draft) return { status: "error", message: messages.noDraft };
    const day = dayOf(draft.proposal, dayIndex);
    if (!day || day.slot !== "dinner" || day.source === "fixed") return { status: "error", message: messages.invalid };

    const settings = await settingsOfHousehold();
    const pool = await readWeekPool(draft.weekStart, settings);
    const candidate = pool.pool.find((item) => item.id === recipeId);
    if (!candidate) return { status: "error", message: "Receptet finns inte i ert bibliotek." };
    const taken = draft.proposal.days.some((other) => other.dayIndex !== dayIndex && other.recipeId === recipeId) || pool.dishes.some((dish) => dish.recipeId === recipeId);
    if (taken) return { status: "error", message: "Den rätten finns redan i veckan." };

    const context = { weekStart: draft.weekStart, settings, fixedDays: asFixed(draft.proposal, dayIndex, pool.linesOf), people: pool.people, recent: pool.recent };
    const facts = proposedFacts(candidate, dayIndex, { ...context, candidates: [candidate] });
    const swapped: ProposalDay = {
      ...day,
      recipeId: candidate.id,
      title: candidate.title,
      source: "proposed",
      locked: true,
      reasons: ["Ditt val", ...facts.reasons].slice(0, 5),
      offerTags: facts.offerTags,
      useSoonTags: facts.useSoonTags,
      allergyWarning: allergyWarningText(candidate, pool.people),
    };
    const proposal: WeekProposal = { ...draft.proposal, days: draft.proposal.days.map((other) => (other.dayIndex === dayIndex ? swapped : other)) };
    if (!(await saveProposal(draftId, proposal, draft.model))) return { status: "error", message: messages.noDraft };
    return { status: "ok", proposal };
  });
}

/** Locks or unlocks a proposed day of the draft ("Gör om" leaves a locked one). A day that is the household's own cannot be changed. */
export async function setDayLock(input: SetDayLockInput): Promise<DraftResult> {
  const user = await signedIn();
  if (!user.ok) return { status: "error", message: user.message };
  const parsed = lockSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: messages.invalid };
  const { draftId, dayIndex, locked } = parsed.data;

  return guarded(async (): Promise<DraftResult> => {
    const draft = await draftById(draftId);
    if (!draft) return { status: "error", message: messages.noDraft };
    const day = dayOf(draft.proposal, dayIndex);
    if (!day || day.slot !== "dinner" || day.source === "fixed" || day.recipeId === null) return { status: "error", message: messages.invalid };
    const proposal: WeekProposal = { ...draft.proposal, days: draft.proposal.days.map((other) => (other.dayIndex === dayIndex ? { ...other, locked } : other)) };
    if (!(await saveProposal(draftId, proposal, draft.model))) return { status: "error", message: messages.noDraft };
    return { status: "ok", proposal };
  });
}
