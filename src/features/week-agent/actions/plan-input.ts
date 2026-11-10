import "server-only";
import { fixedDaysOf, readWeekPool, type WeekPool } from "../context";
import type { StoredProposal } from "../data/week-agent";
import { buildShortlist, type ShortlistResult } from "../domain/shortlist";
import type { WeekAgentSettings } from "../domain/settings";
import type { PlanInput } from "../domain/types";

// One place that builds the planner's input for a week, so proposeWeek and the day actions agree: the household's
// pool with its facts, the days that stay (Matsedel's dishes and the draft's locked days), the shortlist.

export type BuiltInput = { input: PlanInput; shortlist: ShortlistResult; pool: WeekPool };

/**
 * `draft` and `lockedDays` decide which proposed days stay: `lockedDays` are the ones the user locked (always kept),
 * `keepDraftLocks` also keeps every day the draft itself has locked ("Gör om", "Gör noggrannare"). Dishes already
 * on the plan, with or without a day, are never proposed again.
 */
export async function buildPlanInput(weekStart: string, settings: WeekAgentSettings, draft: StoredProposal | null, lockedDays: readonly number[], keepDraftLocks: boolean): Promise<BuiltInput> {
  const pool = await readWeekPool(weekStart, settings);
  const fixedDays = fixedDaysOf(pool, draft, lockedDays, keepDraftLocks);
  const onPlan = new Set(pool.dishes.flatMap((dish) => (dish.recipeId ? [dish.recipeId] : [])));
  const context = { weekStart, settings, fixedDays, people: pool.people, recent: pool.recent };
  const shortlist = buildShortlist(pool.pool.filter((candidate) => !onPlan.has(candidate.id)), context);
  return { input: { ...context, candidates: shortlist.candidates }, shortlist, pool };
}
