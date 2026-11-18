import { currentWeekStart, weekNumber, weeksBetween } from "./week";

// "Hur ofta på menyn": what the planned weeks say about one dish, in facts ("Senast för 9 veckor sedan", "På menyn
// 4 av de senaste 12 veckorna", "Oftast torsdagar"), never a vague "ofta" or "sällan". Counted on what was PLANNED
// (meal_plan_recipe over the weeks), not on "lagad", which is a button that is seldom pressed. Pure, so it is tested
// without a database. Shown only with the Tillval "Visa hur ofta", and only once the household has planned for a while.

/** One dish on one planned week. */
export type MenuHistoryRow = { recipeId: string; weekStart: string; weekday: number | null };

export type MenuStats = {
  /** The Monday of the latest week up to this one on which the dish was planned; `null` for none (never, or only ahead). */
  lastWeekStart: string | null;
  /** On how many of the last `statsWindowWeeks` weeks (this one included) the dish was planned. */
  weeksOn: number;
  /** The weekday (1-7) it mostly lands on, when one clearly stands out; else `null`. */
  usualWeekday: number | null;
  /** Planned on some week at all: in the past, this week or ahead. */
  plannedEver: boolean;
  /** How many weeks the household has planned for, from its first planned dish to this week (0 for none). */
  historyWeeks: number;
};

/** The weeks the count "på menyn N av …" looks back over. */
export const statsWindowWeeks = 12;
/** Less planning history than this shows nothing, so nobody gets numbers that mislead. */
export const minHistoryWeeks = 6;
/** The weeks the usual weekday is read from. */
const weekdayWindowWeeks = 26;

const weekdayPlural = ["måndagar", "tisdagar", "onsdagar", "torsdagar", "fredagar", "lördagar", "söndagar"] as const;

/**
 * The stats of each of `recipeIds` from the planned rows (any weeks, past or ahead), counted from `thisWeek`
 * (the Monday of this week). A dish with no row has `plannedEver` false.
 */
export function menuStatsOf(rows: readonly MenuHistoryRow[], recipeIds: readonly string[], thisWeek: string = currentWeekStart()): Map<string, MenuStats> {
  const pastWeeks = rows.map((row) => row.weekStart).filter((week) => weeksBetween(thisWeek, week) <= 0);
  const first = pastWeeks.length > 0 ? pastWeeks.reduce((a, b) => (a < b ? a : b)) : null;
  const historyWeeks = first === null ? 0 : -weeksBetween(thisWeek, first) + 1;
  const byRecipe = new Map<string, MenuHistoryRow[]>();
  for (const row of rows) {
    const list = byRecipe.get(row.recipeId);
    if (list) list.push(row);
    else byRecipe.set(row.recipeId, [row]);
  }
  const out = new Map<string, MenuStats>();
  for (const id of recipeIds) {
    const own = byRecipe.get(id) ?? [];
    const upToNow = own.filter((row) => weeksBetween(thisWeek, row.weekStart) <= 0);
    const last = upToNow.length > 0 ? upToNow.map((row) => row.weekStart).reduce((a, b) => (a > b ? a : b)) : null;
    const inWindow = new Set(upToNow.filter((row) => -weeksBetween(thisWeek, row.weekStart) < statsWindowWeeks).map((row) => row.weekStart));
    const days = upToNow.filter((row) => row.weekday !== null && -weeksBetween(thisWeek, row.weekStart) < weekdayWindowWeeks).map((row) => row.weekday as number);
    const counts = new Map<number, number>();
    for (const day of days) counts.set(day, (counts.get(day) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    // One weekday "stands out" with at least two plannings and at least half of the dated ones.
    const usualWeekday = top && top[1] >= 2 && top[1] / days.length >= 0.5 ? top[0] : null;
    out.set(id, { lastWeekStart: last, weeksOn: inWindow.size, usualWeekday, plannedEver: own.length > 0, historyWeeks });
  }
  return out;
}

/** Weeks from the dish's last planned week to this one: 0 this week, 1 last week; `null` when it has none. */
export function weeksSinceLast(stats: MenuStats, thisWeek: string = currentWeekStart()): number | null {
  return stats.lastWeekStart === null ? null : -weeksBetween(thisWeek, stats.lastWeekStart);
}

/** "Senast denna vecka", "Senast förra veckan", "Senast för 9 veckor sedan (v. 38)". */
export function lastPlannedText(weeksAgo: number, lastWeekStart: string): string {
  if (weeksAgo <= 0) return "Senast denna vecka";
  if (weeksAgo === 1) return "Senast förra veckan";
  return `Senast för ${weeksAgo} veckor sedan (v. ${weekNumber(lastWeekStart)})`;
}

/** "På menyn 4 av de senaste 12 veckorna". */
export const weeksOnText = (weeksOn: number): string => `På menyn ${weeksOn} av de senaste ${statsWindowWeeks} veckorna`;

/** "Oftast torsdagar". */
export const usualDayText = (weekday: number): string => `Oftast ${weekdayPlural[weekday - 1] ?? "vissa dagar"}`;

/** The lines of "På menyn" in the sheet; `null` (nothing shown) with too little history. */
export function menuFacts(stats: MenuStats, thisWeek: string = currentWeekStart()): string[] | null {
  if (stats.historyWeeks < minHistoryWeeks) return null;
  if (!stats.plannedEver) return ["Aldrig planerad"];
  const lines: string[] = [];
  const ago = weeksSinceLast(stats, thisWeek);
  if (ago !== null && stats.lastWeekStart) lines.push(lastPlannedText(ago, stats.lastWeekStart));
  else lines.push("Bara planerad framåt");
  lines.push(weeksOnText(stats.weeksOn));
  if (stats.usualWeekday) lines.push(usualDayText(stats.usualWeekday));
  return lines;
}

/**
 * The quiet chip of a row, only where it changes a decision: "Aldrig planerad" for a dish never on any week, and
 * "Inte på menyn 9 veckor" once `longAgoWeeks` have passed. Nothing with too little history, and a recipe added
 * lately (`isNew`) is not "aldrig planerad" yet.
 */
export function menuChip(stats: MenuStats, options: { longAgoWeeks: number; isNew?: boolean; thisWeek?: string }): string | null {
  if (stats.historyWeeks < minHistoryWeeks) return null;
  if (!stats.plannedEver) return options.isNew ? null : "Aldrig planerad";
  const ago = weeksSinceLast(stats, options.thisWeek);
  return ago !== null && ago >= options.longAgoWeeks ? `Inte på menyn ${ago} veckor` : null;
}
