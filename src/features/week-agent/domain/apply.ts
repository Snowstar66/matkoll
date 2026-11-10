import type { PlacedBy, ProposalDay, WeekProposal } from "./types";

// "Använd veckan": which of the proposal's days may be written into Matsedel. Only empty days are filled; a day that
// already has a dish is never overwritten unless the user confirmed it. Nothing is written for a day without a dish.

/** The source value Matsedel's row gets for a day the agent filled in (meal_plan_recipe.source). */
export const agentSource: PlacedBy = "week_agent";

export type ApplyPlan = {
  /** The proposed dishes to write, in day order. */
  write: ProposalDay[];
  /** Proposed dishes that were NOT written because the day already has a dish (shown as "3 dagar har redan en rätt"). */
  skippedOccupied: ProposalDay[];
};

/**
 * `occupiedDays` are the weekdays that have a dish in Matsedel now. Fixed days of the proposal are already there and
 * are never written again. With `overwrite` (an explicit confirmation) the occupied days are written over too, except
 * the proposal's own fixed days.
 */
export function applyPlan(proposal: WeekProposal, occupiedDays: readonly number[], overwrite = false): ApplyPlan {
  const occupied = new Set(occupiedDays);
  const proposed = proposal.days.filter((day) => day.source === "proposed" && day.slot === "dinner" && day.recipeId !== null && !day.locked);
  const write = proposed.filter((day) => overwrite || !occupied.has(day.dayIndex));
  return { write, skippedOccupied: proposed.filter((day) => !write.includes(day)) };
}

/** The proposal's days that are still proposed and unlocked, i.e. what "Gör om" may change. */
export const rerollableDays = (proposal: WeekProposal): number[] => proposal.days.filter((day) => day.slot === "dinner" && !day.locked).map((day) => day.dayIndex);

/** What a "Gör om" keeps: every locked day (fixed or locked by the user) as a fixed day for the next plan. */
export function lockedDaysOf(proposal: WeekProposal, ingredientsOf: (recipeId: string | null) => readonly string[]): import("./types").FixedDay[] {
  return proposal.days
    .filter((day) => day.locked && day.slot === "dinner" && day.title !== null)
    .map((day) => ({ dayIndex: day.dayIndex, recipeId: day.recipeId, title: day.title ?? "", ingredients: ingredientsOf(day.recipeId), source: day.source }));
}
