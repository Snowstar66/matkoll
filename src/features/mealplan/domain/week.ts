import { z } from "zod";

// Planera kommande veckor (Story 13.7): the week a meal plan belongs to is
// its Monday as `YYYY-MM-DD` (meal_plan.week_start), counted in Stockholm.
// Plain calendar arithmetic on noon UTC, so a clock change never moves a date.

const planTimeZone = "Europe/Stockholm";

/** How many weeks ahead a plan can be made (add_to_plan refuses more). */
export const maxWeeksAhead = 12;

/** A Monday as `YYYY-MM-DD`, the week a plan belongs to. */
export const weekStartSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** A `YYYY-MM-DD` as noon UTC; `null` when it is not a real date. */
function parseDate(text: string): Date | null {
  if (!weekStartSchema.safeParse(text).success) return null;
  const date = new Date(`${text}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || isoDate(date) !== text ? null : date;
}

function mondayOf(noon: Date): string {
  const monday = new Date(noon);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return isoDate(monday);
}

/** The Monday (`YYYY-MM-DD`) of the week `date`'s Stockholm day falls in. */
export function weekStartOf(date: Date, timeZone: string = planTimeZone): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" })
    .formatToParts(date)
    .reduce<Record<string, number>>((all, part) => ({ ...all, [part.type]: Number(part.value) }), {});
  return mondayOf(new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)));
}

/** This week's Monday, as meal_plan_week_start() counts it. */
export function currentWeekStart(now: Date = new Date()): string {
  return weekStartOf(now);
}

/** The Monday `weeks` weeks after (or before) `weekStart`. */
export function addWeeks(weekStart: string, weeks: number): string {
  const date = parseDate(weekStart) ?? new Date(`${currentWeekStart()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return isoDate(date);
}

/** How many weeks `weekStart` is after `thisWeek` (negative before it). */
export function weeksBetween(thisWeek: string, weekStart: string): number {
  const a = parseDate(thisWeek);
  const b = parseDate(weekStart);
  return a && b ? Math.round((b.getTime() - a.getTime()) / (7 * 86_400_000)) : 0;
}

/** The ISO week number and year of a Monday. */
function isoWeekOfMonday(weekStart: string): { week: number; year: number } {
  const thursday = parseDate(weekStart) ?? new Date();
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  thursday.setUTCHours(0, 0, 0, 0);
  const year = thursday.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  return { week: Math.ceil(((thursday.getTime() - yearStart) / 86_400_000 + 1) / 7), year };
}

/** The URL form of a week: `2026-W45`. */
export function weekParam(weekStart: string): string {
  const { week, year } = isoWeekOfMonday(weekStart);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/**
 * The Monday a `?vecka=` value means: `2026-W45` or any date `2026-11-04`
 * (the Monday of its week). `null` when it is neither.
 */
export function parseWeekParam(value: string | null | undefined): string | null {
  if (!value) return null;
  const iso = /^(\d{4})-W(\d{2})$/.exec(value);
  if (iso) {
    const week = Number(iso[2]);
    if (week < 1 || week > 53) return null;
    // 4 January is always in week 1.
    const monday = new Date(mondayOf(new Date(Date.UTC(Number(iso[1]), 0, 4, 12))) + "T12:00:00Z");
    monday.setUTCDate(monday.getUTCDate() + (week - 1) * 7);
    const result = isoDate(monday);
    return weekParam(result) === value ? result : null;
  }
  const date = parseDate(value);
  return date ? mondayOf(date) : null;
}

/**
 * The week a page shows: the `?vecka=` value when it is this week or one of
 * the next `maxWeeksAhead`; else this week. Going back is Tidigare's job.
 */
export function viewedWeek(value: string | null | undefined, now: Date = new Date()): string {
  const thisWeek = currentWeekStart(now);
  const wanted = parseWeekParam(value);
  if (!wanted) return thisWeek;
  const offset = weeksBetween(thisWeek, wanted);
  return offset >= 0 && offset <= maxWeeksAhead ? wanted : thisWeek;
}

/** "Denna vecka", "Nästa vecka", "Om 2 veckor". */
export function weekOffsetLabel(offset: number): string {
  if (offset <= 0) return "Denna vecka";
  if (offset === 1) return "Nästa vecka";
  return `Om ${offset} veckor`;
}

/** "Vecka 44". */
export function weekName(weekStart: string): string {
  return `Vecka ${isoWeekOfMonday(weekStart).week}`;
}

/** A moment in `weekStart`'s week (its Monday, noon UTC), for weekdayDateText. */
export function weekAnchorDate(weekStart: string): Date {
  return parseDate(weekStart) ?? new Date();
}

/** A week in a picker. */
export type WeekChoice = { weekStart: string; offset: number; name: string; label: string };

/** This week and the next `maxWeeksAhead`, for the pickers. */
export function weekChoices(now: Date = new Date()): WeekChoice[] {
  const thisWeek = currentWeekStart(now);
  return Array.from({ length: maxWeeksAhead + 1 }, (_, offset) => {
    const weekStart = addWeeks(thisWeek, offset);
    return { weekStart, offset, name: weekName(weekStart), label: weekOffsetLabel(offset) };
  });
}

/** The ISO week number of a Monday: 44. */
export function weekNumber(weekStart: string): number {
  return isoWeekOfMonday(weekStart).week;
}

/** How many weeks the overview and "Kopiera till …" offer: this week and the next two. */
export const overviewWeeks = 3;

/** The short label of a week tile: "Denna vecka", "Nästa", "Om 3 v". */
export function weekTileLabel(offset: number): string {
  if (offset <= 0) return "Denna vecka";
  if (offset === 1) return "Nästa";
  return `Om ${offset} v`;
}

/** A tile's accessible name: "Vecka 45, nästa vecka, 3 rätter". */
export function weekTileName(weekStart: string, offset: number, count: number): string {
  const when = weekOffsetLabel(offset).toLocaleLowerCase("sv-SE");
  const dishes = count === 0 ? "inga rätter" : count === 1 ? "1 rätt" : `${count} rätter`;
  return `${weekName(weekStart)}, ${when}, ${dishes}`;
}

/** The weeks "Kopiera till …" offers: this week, next week and the week after. */
export function copyTargets(now: Date = new Date()): WeekChoice[] {
  return weekChoices(now).slice(0, overviewWeeks);
}

/** "Kopierade 5 rätter till vecka 46". */
export function copiedText(count: number, weekStart: string): string {
  return `Kopierade ${count === 1 ? "1 rätt" : `${count} rätter`} till vecka ${weekNumber(weekStart)}`;
}

/** The `?vecka=` query for a week: empty for this week, so the plain address stays. */
export function weekQuery(weekStart: string, now: Date = new Date()): string {
  return weekStart === currentWeekStart(now) ? "" : `?vecka=${weekParam(weekStart)}`;
}
