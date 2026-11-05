import { todayWeekday, weekdayDateText, weekdayNames, weekdayWord } from "./meal-plan";
import { addWeeks, currentWeekStart, maxWeeksAhead, parseWeekParam, weekAnchorDate, weekQuery, weeksBetween } from "./week";

// Välj dag och sedan recept (Story 13.8): Recept in a planning mode for one
// day, `/recept?planera=2026-11-04`. The mode is the address alone, so it
// survives moving between the library and a recipe and ends when it is left.

/** The day being planned: its week's Monday and its weekday (1 måndag to 7 söndag). */
export type PlanningTarget = { date: string; weekStart: string; weekday: number };

/** The planning address's query value for a day of a week: its date. */
export function planningDate(weekStart: string, weekday: number): string {
  return addDays(weekStart, weekday - 1);
}

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

/**
 * The day a `?planera=` value means; `null` when it is no date, or a day
 * of a week that has passed or is more than `maxWeeksAhead` weeks ahead.
 */
export function planningTarget(value: string | null | undefined, now?: Date): PlanningTarget | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const weekStart = parseWeekParam(value);
  if (!weekStart) return null;
  // The clock is read only for a real value, so a page without ?planera= stays free of it.
  const offset = weeksBetween(currentWeekStart(now ?? new Date()), weekStart);
  if (offset < 0 || offset > maxWeeksAhead) return null;
  const weekday = Math.round((new Date(`${value}T12:00:00Z`).getTime() - weekAnchorDate(weekStart).getTime()) / 86_400_000) + 1;
  return weekday >= 1 && weekday <= 7 ? { date: value, weekStart, weekday } : null;
}

/** "onsdag 4 nov". */
export function planningDayText(target: PlanningTarget): string {
  return `${weekdayWord(target.weekday)} ${weekdayDateText(weekAnchorDate(target.weekStart), target.weekday)}`;
}

/** "Lägg på onsdag", the button's name while planning. */
export function planningButtonText(target: PlanningTarget): string {
  return `Lägg på ${weekdayWord(target.weekday)}`;
}

/** "Lägger på onsdag 4 nov", the bar's text. */
export function planningBarText(target: PlanningTarget): string {
  return `Lägger på ${planningDayText(target)}`;
}

/** Recept in planning mode for a day. */
export function planningHref(weekStart: string, weekday: number, path = "/recept"): string {
  return `${path}?planera=${planningDate(weekStart, weekday)}`;
}

/** Where a planned dish leads: the day's week in Matsedel, with the day highlighted (`?dag=3`). */
export function planningDoneHref(target: PlanningTarget, now: Date = new Date()): string {
  const week = weekQuery(target.weekStart, now);
  return `/matsedel${week}${week ? "&" : "?"}dag=${target.weekday}`;
}

/** The weekday `?dag=` names, or `null`. */
export function highlightDay(value: string | null | undefined): number | null {
  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 7 ? day : null;
}

/** One day Pontus can put a suggested dish on (Story 9.6). */
export type DayOption = { weekStart: string; weekday: number; group: "Denna vecka" | "Nästa vecka"; label: string };

/**
 * The days offered by "Lägg på en dag": today and the rest of this week, then
 * all of next week. Today and tomorrow say so ("Idag, torsdag"), the rest are
 * weekday names ("Fredag").
 */
export function dayOptions(now: Date = new Date()): DayOption[] {
  const thisWeek = currentWeekStart(now);
  const today = todayWeekday(now);
  const options: DayOption[] = [];
  for (const [offset, group] of [[0, "Denna vecka"], [1, "Nästa vecka"]] as const) {
    const weekStart = addWeeks(thisWeek, offset);
    for (let weekday = offset === 0 ? today : 1; weekday <= 7; weekday++) {
      const name = weekdayNames[weekday - 1] as string;
      const prefix = offset === 0 && weekday === today ? "Idag, " : offset === 0 && weekday === today + 1 ? "Imorgon, " : "";
      options.push({ weekStart, weekday, group, label: prefix ? `${prefix}${name.toLowerCase()}` : name });
    }
  }
  return options;
}
