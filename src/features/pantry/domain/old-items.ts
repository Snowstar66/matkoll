import type { PantryItem } from "./pantry-item";
import { daysSinceAdded, oldLimitDays } from "./pantry-meta";

// "Ät det här först" (Story 16.13): the items that have lain longer than the
// limit of their location (Story 14.6: 7 days Kyl, 60 days Frys, none for
// Skafferi), one entry per catalog ingredient, the oldest first. Pure, so it
// is tested with a fixed `now`. The suggestions and the row in Matvaror both
// read it.

/** An ingredient that has lain long: its catalog name and the days since the oldest row of it was added. */
export type OldPantryItem = { ingredientId: string; name: string; days: number };

/** At most this many old items go to the model: the payload stays small. */
export const maxOldItems = 8;

/**
 * The old items among `items`: those past their location's limit, merged per
 * ingredient (the oldest row counts), sorted oldest first and then by name.
 */
export function oldPantryItems(items: readonly Pick<PantryItem, "ingredientId" | "name" | "location" | "createdAt">[], now: Date): OldPantryItem[] {
  const byIngredient = new Map<string, OldPantryItem>();
  for (const item of items) {
    const limit = oldLimitDays(item.location);
    if (limit === null || !item.createdAt) continue;
    const days = daysSinceAdded(item.createdAt, now);
    if (days === null || days <= limit) continue;
    const known = byIngredient.get(item.ingredientId);
    if (!known || days > known.days) byIngredient.set(item.ingredientId, { ingredientId: item.ingredientId, name: item.name, days });
  }
  return [...byIngredient.values()].sort((a, b) => b.days - a.days || a.name.localeCompare(b.name, "sv"));
}

/** "1 vara har legat länge – föreslå rätter med den", "3 varor har legat länge – föreslå rätter med dem". */
export function eatFirstRowText(count: number): string {
  return count === 1
    ? "1 vara har legat länge – föreslå rätter med den"
    : `${count} varor har legat länge – föreslå rätter med dem`;
}

/** How long, as the reason line says it: "en vecka", "3 veckor", "2 månader". */
export function lainText(days: number): string {
  if (days < 14) return "en vecka";
  if (days < 60) return `${Math.floor(days / 7)} veckor`;
  return `${Math.floor(days / 30)} månader`;
}

/** "lime", "lime och koriander", "lime, koriander och gurka". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} och ${names[names.length - 1]}`;
}

/**
 * The reason line of a dish that uses old items: "Använder lime och koriander
 * som legat en vecka" (the longest wait names the time). Empty for none.
 */
export function usesOldText(used: readonly { name: string; days: number }[]): string | null {
  if (used.length === 0) return null;
  const longest = Math.max(...used.map((item) => item.days));
  return `Använder ${joinNames(used.map((item) => item.name.trim().toLocaleLowerCase("sv-SE")))} som legat ${lainText(longest)}`;
}
