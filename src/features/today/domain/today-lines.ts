import type { Day } from "./dates";
import { foodDayOn } from "./food-days";
import { nameDayLine } from "./name-days";
import { seasonLine } from "./season";

// What the card says, one text per line: a food day (when switched on), the season's
// produce (when switched on; after the food day on a food day), and, when switched on,
// the name day and the Chinese almanac's advice. The advice has its 宜 part and its 忌
// part on lines of their own, so "· 忌" never wraps mid-line.

export type TodayLine = string;

export type TodaySettings = { foodDays: boolean; season: boolean; nameDay: boolean; almanac: boolean };

/** The food day's line, else null. */
export function foodDayLine(day: Day): string | null {
  return foodDayOn(day)?.text ?? null;
}

/** `almanac` is the almanac's line, computed (and loaded) by the caller only when it is switched on. */
export function todayLines(day: Day, settings: TodaySettings, almanac: string | null = null): TodayLine[] {
  const lines: TodayLine[] = [];
  if (settings.foodDays) {
    const foodDay = foodDayLine(day);
    if (foodDay) lines.push(foodDay);
  }
  if (settings.season) {
    const season = seasonLine(day.month, day.day);
    if (season) lines.push(season);
  }
  if (settings.nameDay) {
    const nameDay = nameDayLine(day.month, day.day);
    if (nameDay) lines.push(nameDay);
  }
  if (settings.almanac && almanac) lines.push(...almanac.split(" · "));
  return lines;
}
