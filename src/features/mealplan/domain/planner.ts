import { comparePlanRecipes, weekdayShortName, weekdayWord, type PlanDish, type PlanRecipeRow } from "./meal-plan";

// Matsedel as the place to plan the week (Story 25.3): the words of the
// planning view and the small rules behind it. Pure, so they are tested
// without a browser.

/** "vara" / "varor" with the count: "1 vara", "4 varor". */
export function itemsText(count: number): string {
  return `${count} ${count === 1 ? "vara" : "varor"}`;
}

/**
 * The toast after "+", naming what went on the list (like the recipe page's):
 * "Korvstroganoff på torsdag. Falukorv, grädde och ris står på inköpslistan.", or,
 * when the week is full, "Korvstroganoff på veckan. Alla dagar har en rätt. …".
 */
export function addedToWeekText(title: string, buyNames: readonly string[], weekday: number | null = null): string {
  const where = weekday ? `${title} på ${weekdayWord(weekday)}.` : `${title} på veckan. Alla dagar har en rätt.`;
  return buyNames.length > 0 ? `${where} ${buyNamesText(buyNames)} står på inköpslistan.` : `${where} Inget att köpa.`;
}

/** "Falukorv, grädde och ris", or "Falukorv, grädde, ris och 2 till": what an added dish put on the list. */
export function buyNamesText(names: readonly string[]): string {
  const shown = names.slice(0, 3).map((name, index) => (index === 0 ? name.charAt(0).toUpperCase() + name.slice(1) : name));
  if (names.length > 3) return `${shown.join(", ")} och ${names.length - 3} till`;
  if (shown.length <= 1) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} och ${shown.at(-1)}`;
}

/** The action of the toast after an add: "Byt dag" when it got a day, else "Välj dag". */
export function changeDayLabel(weekday: number | null | undefined): string {
  return weekday ? "Byt dag" : "Välj dag";
}

/** What the option row says for a dish already on the week: its day ("Tor"), or "På veckan" when it has none. */
export function onWeekLabel(weekday: number | null | undefined): string {
  return weekday ? weekdayShortName(weekday) : "På veckan";
}

/** Veckans rätter in order: Mån to Sön, dishes with no day last; the plan's order (when added) within a day. */
export function compareByWeekday(
  a: Pick<PlanDish, "weekday" | "id" | "position">,
  b: Pick<PlanDish, "weekday" | "id" | "position">,
): number {
  return (a.weekday || 8) - (b.weekday || 8) || comparePlanRecipes(a, b);
}

/** The day chip of a dish in Veckans rätter: "Mån", or "Ingen dag". */
export function dayChipText(weekday: number | null | undefined): string {
  return weekday ? weekdayShortName(weekday) : "Ingen dag";
}

/** The fixed bar's first line: "2 rätter · 6 varor att köpa". */
export function weekBarText(dishCount: number, toBuy: number | null): string {
  const dishes = `${dishCount} ${dishCount === 1 ? "rätt" : "rätter"}`;
  return toBuy === null ? dishes : `${dishes} · ${toBuy} ${toBuy === 1 ? "vara" : "varor"} att köpa`;
}

/** The second line of a dish in Veckans rätter: the offer line, else what is left to buy for it. */
export function dishNoteText(option: { buy: number; deal: { text: string } | null } | undefined): string {
  if (!option) return "";
  if (option.deal) return option.deal.text;
  return option.buy > 0 ? `${itemsText(option.buy)} att köpa` : "Allt finns hemma";
}

/**
 * The dishes of the week as shown: the server's, without those just removed, and
 * with those just added that the server's plan does not have yet; days just
 * chosen on top; ordered by weekday.
 */
export function shownDishes(
  server: readonly PlanDish[],
  hidden: ReadonlySet<string>,
  added: readonly PlanDish[],
  days: Readonly<Record<string, number | null>> = {},
): PlanDish[] {
  const known = new Set(server.map((dish) => dish.id));
  return [...server.filter((dish) => !hidden.has(dish.id)), ...added.filter((dish) => !known.has(dish.id) && !hidden.has(dish.id))]
    .map((dish) => (dish.id in days ? { ...dish, weekday: days[dish.id] } : dish))
    .sort(compareByWeekday);
}

/** A dish that was just added, as the list shows it before the plan is read again. */
export function dishFromRow(row: PlanRecipeRow): PlanDish {
  return { ...row, recipe: null };
}

/** One row of the week as a calendar: a dish (the day shown on the first of its day), a free day, or the label over dishes with no day. */
export type CalendarRow =
  | { kind: "dish"; dish: PlanDish; weekday: number | null; showDay: boolean }
  | { kind: "free"; weekday: number }
  | { kind: "no-day-label" };

/**
 * Veckans rätter as a calendar: Mån to Sön, each day's dishes (the day on the
 * first only), a "free" row for a day with no dish from `firstOpen` on (the
 * days the server's first free day looks at), then "Ingen dag" and the
 * dishes without a day.
 */
export function calendarRows(dishes: readonly PlanDish[], firstOpen: number): CalendarRow[] {
  const rows: CalendarRow[] = [];
  for (let day = 1; day <= 7; day += 1) {
    const ofDay = dishes.filter((dish) => dish.weekday === day);
    if (ofDay.length === 0) {
      if (day >= firstOpen) rows.push({ kind: "free", weekday: day });
      continue;
    }
    ofDay.forEach((dish, index) => rows.push({ kind: "dish", dish, weekday: day, showDay: index === 0 }));
  }
  const without = dishes.filter((dish) => !dish.weekday);
  if (without.length > 0) {
    rows.push({ kind: "no-day-label" });
    for (const dish of without) rows.push({ kind: "dish", dish, weekday: null, showDay: false });
  }
  return rows;
}

/** The hint over the library once a free day is chosen: "Läggs på tisdag". */
export function targetDayText(weekday: number): string {
  return `Läggs på ${weekdayWord(weekday)}`;
}
