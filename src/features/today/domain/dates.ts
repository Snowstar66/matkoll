// Dates for Dagens: always the calendar day in Sweden, wherever the page is shown.
// Pure, so every rule is tested with a fixed date.

export type Day = { year: number; month: number; day: number };

/** The calendar day of `date` in Stockholm. */
export function stockholmDay(date: Date): Day {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  })
    .formatToParts(date)
    .reduce<Record<string, number>>((all, part) => ({ ...all, [part.type]: Number(part.value) }), {});
  return { year: parts.year, month: parts.month, day: parts.day };
}

/** "2026-11-08". */
export function dayKey({ year, month, day }: Day): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday({ year, month, day }: Day): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** The day `days` after (or before, when negative) `from`. */
export function addDays({ year, month, day }: Day, days: number): Day {
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** Easter Sunday of `year` (the Gregorian computus). */
export function easterSunday(year: number): Day {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

/** The day of the nth `weekdayIndex` (0 = Sunday) of a month, such as the third Thursday of August. */
export function nthWeekday(year: number, month: number, weekdayIndex: number, nth: number): Day {
  const first = weekday({ year, month, day: 1 });
  return { year, month, day: 1 + ((weekdayIndex - first + 7) % 7) + (nth - 1) * 7 };
}

export function sameDay(a: Day, b: Day): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

const weekdays = ["sön", "mån", "tis", "ons", "tors", "fre", "lör"];
const months = ["jan", "feb", "mars", "apr", "maj", "juni", "juli", "aug", "sep", "okt", "nov", "dec"];

/** "sön 8 nov", the card's date (the card writes it in capitals). */
export function shortDateText(day: Day): string {
  return `${weekdays[weekday(day)]} ${day.day} ${months[day.month - 1]}`;
}
