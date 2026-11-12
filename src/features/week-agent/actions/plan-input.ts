import "server-only";
import { fixedDaysOf, readWeekPool, type WeekPool } from "../context";
import type { StoredProposal } from "../data/week-agent";
import { openDays } from "../domain/plan";
import { buildShortlist, type ShortlistResult } from "../domain/shortlist";
import { maxDinners, type WeekAgentSettings } from "../domain/settings";
import type { PlanInput } from "../domain/types";

// One place that builds the planner's input for a week, so proposeWeek and the day actions agree: the household's
// pool with its facts, the days that stay (Matsedel's dishes and the draft's locked days), the shortlist.

export type BuiltInput = { input: PlanInput; shortlist: ShortlistResult; pool: WeekPool };

/**
 * `draft` and `lockedDays` decide which proposed days stay: `lockedDays` are the ones the user locked (always kept),
 * `keepDraftLocks` also keeps every day the draft itself has locked ("Gör om", "Gör noggrannare"). Dishes already
 * on the plan, with or without a day, are never proposed again (an agent dish that is being replaced too, so a
 * "Gör om" gives other dishes). `replaceAgentDays`: see fixedDaysOf.
 */
export async function buildPlanInput(weekStart: string, settings: WeekAgentSettings, draft: StoredProposal | null, lockedDays: readonly number[], keepDraftLocks: boolean, replaceAgentDays = false): Promise<BuiltInput> {
  const pool = await readWeekPool(weekStart, settings);
  const fixedDays = fixedDaysOf(pool, draft, lockedDays, keepDraftLocks, replaceAgentDays);
  if (replaceAgentDays) {
    // A "Gör om" gives every day it freed a new dish, also when the household's dinners setting is lower than the week was.
    const freed = new Set(pool.dishes.flatMap((dish) => (dish.weekday !== null && dish.source === "week_agent" && !fixedDays.some((day) => day.dayIndex === dish.weekday) ? [dish.weekday] : [])));
    settings = { ...settings, dinners: Math.min(maxDinners, Math.max(settings.dinners, fixedDays.length + freed.size)) };
  }
  const onPlan = new Set(pool.dishes.flatMap((dish) => (dish.recipeId ? [dish.recipeId] : [])));
  const context = { weekStart, settings, fixedDays, people: pool.people, recent: pool.recent, pastDays: pool.pastDays };
  let shortlist = buildShortlist(pool.pool.filter((candidate) => !onPlan.has(candidate.id)), context);
  if (replaceAgentDays && shortlist.candidates.length < openDays(context).length) {
    // A small library: the agent's own earlier dishes may come back rather than leave the redo without enough dishes.
    const kept = new Set(pool.dishes.flatMap((dish) => (dish.recipeId && !(dish.source === "week_agent" && fixedDays.every((day) => day.dayIndex !== dish.weekday)) ? [dish.recipeId] : [])));
    shortlist = buildShortlist(pool.pool.filter((candidate) => !kept.has(candidate.id)), context);
  }
  return { input: { ...context, candidates: shortlist.candidates }, shortlist, pool };
}
