import { formatQuantity, SECTIONS, type Section } from "@/features/catalog";
import { dishCountText } from "@/features/mealplan";
import type { ShoppingLine } from "./compute-list";

// What Inköpslista says (EXPERIENCE.md, UX-DR9). Pure, so it is tested
// without React.

/** The empty list without a meal plan, or with a plan without dishes. */
export const emptyPlanText = "Lägg rätter på matsedeln så räknas listan fram.";

/** The empty list with dishes on the plan: everything is at home. */
export const allAtHomeText = "Allt finns hemma.";

/** A vague line's ingredient is not at home: buy it, or check first. */
export const askAtHomeText = "Finns hemma?";

/** Above the list when the pantry could not be read, so nothing is taken off. */
export const pantryUnreadText = "Det gick inte att läsa lagret, så inget är avdraget från listan.";

/** Dishes whose recipe is deleted (or could not be read), which the list leaves out. */
export function skippedDishesText(count: number): string {
  return count === 1
    ? "1 rätt med borttaget recept räknas inte."
    : `${count} rätter med borttagna recept räknas inte.`;
}

/** "1 vara kvar", "12 varor kvar": the lines not checked off. */
export function itemsLeftText(count: number): string {
  return `${count} ${count === 1 ? "vara" : "varor"} kvar`;
}

/** The number of lines not checked off. */
export function itemsLeft(lines: readonly Pick<ShoppingLine, "checked">[]): number {
  return lines.filter((line) => !line.checked).length;
}

/** The line under the title: "Vecka 44 · 3 rätter · 12 varor kvar". */
export function listSummaryText(planName: string, dishCount: number, left: number): string {
  return `${planName} · ${dishCountText(dishCount)} · ${itemsLeftText(left)}`;
}

/** Announced when the list is counted again while it is open: "Inköpslistan är omräknad. 12 varor kvar." */
export function recountedText(left: number): string {
  return `Inköpslistan är omräknad. ${itemsLeftText(left)}.`;
}

/**
 * "från Krämig kycklinggryta, Linssoppa": the dishes a line comes from, each
 * title once (the same recipe can be on the plan twice), in plan order.
 * `null` when no title is known.
 */
export function originsText(origins: readonly string[], dishTitles: Readonly<Record<string, string>>): string | null {
  const titles = [...new Set(origins.flatMap((id) => (dishTitles[id] ? [dishTitles[id]] : [])))];
  return titles.length > 0 ? `från ${titles.join(", ")}` : null;
}

/**
 * What a line shows to the right: "3 dl", "2 dl (hemma: 1 kg)" or "Finns
 * hemma?". A line without a catalog ingredient, whose text says how much,
 * shows its multiplier when it is not 1 ("×2", "×1,5"), else nothing.
 */
export function lineAmountText(
  line: Pick<ShoppingLine, "amount" | "unit" | "isVague" | "pantryNote" | "multiplier">,
): string {
  if (line.isVague) return askAtHomeText;
  if (line.multiplier !== undefined && line.multiplier !== 1) return `×${formatQuantity(line.multiplier, null)}`;
  const amount = formatQuantity(line.amount, line.unit);
  return line.pantryNote && amount ? `${amount} (${line.pantryNote})` : amount;
}

/**
 * The lines per section, in the order of SECTIONS; sections without lines are
 * left out. Keeps the lines' order. A line in a section outside SECTIONS is
 * shown under Övrigt, so no line is ever dropped.
 */
export function groupBySection(lines: readonly ShoppingLine[]): { section: Section; lines: ShoppingLine[] }[] {
  const known: ReadonlySet<string> = new Set(SECTIONS);
  const bySection = new Map<Section, ShoppingLine[]>();
  for (const line of lines) {
    const section: Section = known.has(line.section) ? line.section : "Övrigt";
    const group = bySection.get(section);
    if (group) group.push(line);
    else bySection.set(section, [line]);
  }
  return SECTIONS.flatMap((section) => {
    const group = bySection.get(section);
    return group ? [{ section, lines: group }] : [];
  });
}
