import { comparePlanRecipes, weekdayShortName, type PlanDish, type PlanRecipeRow } from "./meal-plan";

// Matsedel as the place to plan the week (Story 25.3): the words of the
// planning view and the small rules behind it. Pure, so they are tested
// without a browser.

/** "vara" / "varor" with the count: "1 vara", "4 varor". */
export function itemsText(count: number): string {
  return `${count} ${count === 1 ? "vara" : "varor"}`;
}

/** The toast after "+": "Korvstroganoff på veckan. 3 varor på listan." */
export function addedToWeekText(title: string, buy: number): string {
  return buy > 0 ? `${title} på veckan. ${itemsText(buy)} på listan.` : `${title} på veckan. Inget att köpa.`;
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

/** The dishes of the week as shown: the server's, without those just removed, and with those just added that the server's plan does not have yet. */
export function shownDishes(server: readonly PlanDish[], hidden: ReadonlySet<string>, added: readonly PlanDish[]): PlanDish[] {
  const known = new Set(server.map((dish) => dish.id));
  return [...server.filter((dish) => !hidden.has(dish.id)), ...added.filter((dish) => !known.has(dish.id) && !hidden.has(dish.id))].sort(
    comparePlanRecipes,
  );
}

/** A dish that was just added, as the list shows it before the plan is read again. */
export function dishFromRow(row: PlanRecipeRow): PlanDish {
  return { ...row, recipe: null };
}
