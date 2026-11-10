import { z } from "zod";
import type { ExcludedDish, WeekProposal } from "../domain/types";
import type { StoredProposal } from "../data/week-agent";
import type { WeekAgentSettings } from "../domain/settings";

// The contract of the Veckoagent server actions (PR 2). Types only (plus input schemas), safe to import from the
// client. Every action returns a discriminated union and never throws for an expected case.

export type WeekAgentModel = "haiku-5.5" | "sonnet-5.5" | "rules";
export type ProposeMode = "plan" | "reroll" | "careful";

export const proposeWeekInputSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(["plan", "reroll", "careful"]),
  lockedDays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  /** Full-week "Gör om": the days whose dish an earlier "Använd veckan" put there (source 'week_agent') are planned again; the household's own days stay fixed. */
  replaceAgentDays: z.boolean().optional(),
});
export type ProposeWeekInput = z.infer<typeof proposeWeekInputSchema>;

export type ProposeWeekResult =
  | { status: "ok"; draftId: string; proposal: WeekProposal; excludedForAllergy: ExcludedDish[]; model: WeekAgentModel }
  | { status: "too_few_recipes"; needed: number; available: number; excludedForAllergy: ExcludedDish[] }
  | { status: "cap_reached" }
  | { status: "error"; message: string };

export type AlternativeOption = { recipeId: string; title: string; reasons: string[]; allergyWarning: string | null };
export type AlternativesInput = { draftId: string; dayIndex: number };
export type AlternativesResult = { status: "ok"; options: AlternativeOption[] } | { status: "error"; message: string };

export type SwapDayInput = { draftId: string; dayIndex: number; recipeId: string };
export type SetDayLockInput = { draftId: string; dayIndex: number; locked: boolean };
export type DraftResult = { status: "ok"; proposal: WeekProposal } | { status: "error"; message: string };

export type ApplyWeekInput = {
  draftId: string;
  weekStart: string;
  /** Write over days that have the household's own dish (explicit confirmation). Only a dish that can be put back by "Ångra" is replaced; the others are skipped. */
  overwrite?: boolean;
  /** Full-week "Gör om": days whose dish the agent put there are replaced; the household's own days are never touched (unless `overwrite`). */
  replaceAgentDays?: boolean;
};
export type ApplyWeekResult =
  /** `toBuy`: the number of lines on the week's shopping list after the write (derived from the plan, minus the pantry); null when the list could not be read. */
  { status: "ok"; written: number[]; skippedOccupied: number[]; toBuy?: number | null } | { status: "error"; message: string };

export type UndoWeekInput = { draftId: string };
/** `removed`: the weekdays whose dish was taken off again (restored days included in `restored`). */
export type UndoWeekResult = { status: "ok"; removed: number[]; restored: number[] } | { status: "error"; message: string };

export type DiscardDraftInput = { draftId: string };
export type OkOrError = { status: "ok" } | { status: "error"; message: string };

export type WeekAgentContext = {
  settings: WeekAgentSettings;
  draft: StoredProposal | null;
  /** Weekdays (1-7) that have a dish in Matsedel. */
  filledDays: number[];
  emptyDays: number[];
  recipeCount: number;
};

export type { WeekAgentSettings };
