import type { Day } from "./dates";
import { foodDayOn } from "./food-days";
import { nameDayLine } from "./name-days";
import { seasonLine, type SeasonRecipe } from "./season";

// What the card says: one food line (a food day, else the season) and, when switched
// on, the name day and the Chinese almanac's advice, each on a line of its own (the
// advice is a sentence: "Almanackan: bra dag att städa hemma. Undvik att storhandla.").

export type LinePart = { text: string; recipeId?: string };
export type TodayLine = readonly LinePart[];

export type TodaySettings = { food: boolean; nameDay: boolean; almanac: boolean };

export function foodLine(day: Day, recipes: readonly SeasonRecipe[]): TodayLine | null {
  const foodDay = foodDayOn(day);
  if (foodDay) return [{ text: foodDay.text }];
  const season = seasonLine(day.month, recipes);
  if (!season) return null;
  if (!season.recipe) return [{ text: `${season.item.definite} är som bäst nu.` }];
  return [
    { text: `${season.item.definite} är som bäst nu – du har ` },
    { text: season.recipe.title, recipeId: season.recipe.id },
    { text: "." },
  ];
}

/** `almanac` is the almanac's line, computed (and loaded) by the caller only when it is switched on. */
export function todayLines(day: Day, settings: TodaySettings, recipes: readonly SeasonRecipe[], almanac: string | null = null): TodayLine[] {
  const main = settings.food ? foodLine(day, recipes) : null;
  const extras = [settings.nameDay ? nameDayLine(day.month, day.day) : null, settings.almanac ? almanac : null].filter(
    (line): line is string => line !== null,
  );
  const lines: TodayLine[] = main ? [main] : [];
  for (const extra of extras) lines.push([{ text: extra }]);
  return lines;
}
