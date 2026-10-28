// Weeks for the weekly offers (AD-25): Monday to Sunday in Swedish time,
// stored as the Monday's date ("2026-10-26"). The only code that counts
// weeks; it never reads the clock, `now` is always an argument. Dates are
// YYYY-MM-DD strings, counted as UTC days, so summer time never moves a day.

const dayMs = 86_400_000;

const monthNames = ["jan", "feb", "mars", "apr", "maj", "juni", "juli", "aug", "sep", "okt", "nov", "dec"] as const;

const swedishDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Stockholm",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The day `now` is in Swedish time, as YYYY-MM-DD. */
export function swedishToday(now: Date): string {
  const parts = swedishDay.formatToParts(now);
  const part = (type: string) => parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Whether the text is a date as YYYY-MM-DD that exists. */
export function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const time = Date.parse(`${text}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === text;
}

const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const toDate = (time: number) => new Date(time).toISOString().slice(0, 10);

/** The date `days` days after `date` (before, for a negative number). */
export function addDays(date: string, days: number): string {
  return toDate(toTime(date) + days * dayMs);
}

/** The Monday of the week a date is in. */
export function mondayOf(date: string): string {
  const weekday = new Date(toTime(date)).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

/** The Monday of the week `now` is in, in Swedish time. */
export function weekStartOf(now: Date): string {
  return mondayOf(swedishToday(now));
}

/** The week's Sunday, its last day. */
export function weekEnd(weekStart: string): string {
  return addDays(weekStart, 6);
}

/** Whether the week has ended: its Sunday is before today in Swedish time. */
export function isWeekOver(weekStart: string, now: Date): boolean {
  return weekEnd(weekStart) < swedishToday(now);
}

/** Whether offers can be saved for the week: this week or next (AD-25). */
export function isSavableWeek(weekStart: string, now: Date): boolean {
  const thisWeek = weekStartOf(now);
  return weekStart === thisWeek || weekStart === addDays(thisWeek, 7);
}

/** The ISO 8601 week number of the week that starts on `weekStart`. */
export function isoWeekNumber(weekStart: string): number {
  // The week's Thursday decides its year; week 1 holds the year's first Thursday.
  const thursday = toTime(addDays(mondayOf(weekStart), 3));
  const yearStart = Date.UTC(new Date(thursday).getUTCFullYear(), 0, 1);
  return Math.floor((thursday - yearStart) / dayMs / 7) + 1;
}

/**
 * The week of a store's offer page (AD-25): the week of the most common last
 * day among `dates` (YYYY-MM-DD), since the page has no first day and a few
 * offers last longer. A tie goes to the earliest week. `null` without dates.
 */
export function weekOfValidTo(dates: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const date of dates) {
    if (!isIsoDate(date)) continue;
    const week = mondayOf(date);
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [week, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && week < best)) {
      best = week;
      bestCount = count;
    }
  }
  return best;
}

/** "1 nov": a day and its month, as texts write it. */
export function dayText(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${day} ${monthNames[month - 1]}`;
}

/** "vecka 45, 4–10 nov", or across months "vecka 44, 26 okt–1 nov". */
export function weekLabel(weekStart: string): string {
  const end = weekEnd(weekStart);
  const sameMonth = weekStart.slice(0, 7) === end.slice(0, 7);
  const from = sameMonth ? String(Number(weekStart.slice(8, 10))) : dayText(weekStart);
  return `vecka ${isoWeekNumber(weekStart)}, ${from}–${dayText(end)}`;
}

/** "Vecka 45", for a week pill. */
export function weekPillLabel(weekStart: string): string {
  return `Vecka ${isoWeekNumber(weekStart)}`;
}

/** "vecka 45", where there is no room for the dates. */
export function weekShortLabel(weekStart: string): string {
  return `vecka ${isoWeekNumber(weekStart)}`;
}
