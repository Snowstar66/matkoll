import type { PantryItem } from "./pantry-item";
import { daysSinceAdded, oldLimitDays, stockholmDayKey } from "./pantry-meta";

// "Ät det här först" (Story 16.13) and "Ät snart": the items that have reached
// their limit (oldLimitDays: the ingredient's own days in Kyl, else 7; 60 days
// Frys; none for Skafferi), one entry per catalog ingredient, the oldest first. Pure, so it
// is tested with a fixed `now`. The suggestions and the row in Matvaror both
// read it.

/** An ingredient that has lain long: its catalog name and the days since the oldest row of it was added. */
/** `limit` is the days it keeps: `days` equal to it is "idag", above it overdue. */
export type OldPantryItem = { ingredientId: string; name: string; days: number; limit: number };

/** At most this many old items go to the model: the payload stays small. */
export const maxOldItems = 8;

/**
 * The old items among `items`: those that have reached their limit (due today or overdue), merged per
 * ingredient (the oldest row counts), sorted oldest first and then by name.
 */
export function oldPantryItems(items: readonly Pick<PantryItem, "ingredientId" | "name" | "location" | "createdAt" | "keepsDays">[], now: Date): OldPantryItem[] {
  const byIngredient = new Map<string, OldPantryItem>();
  for (const item of items) {
    const limit = oldLimitDays(item.location, item.keepsDays);
    if (limit === null || !item.createdAt) continue;
    const days = daysSinceAdded(item.createdAt, now);
    if (days === null || days < limit) continue;
    const known = byIngredient.get(item.ingredientId);
    if (!known || days > known.days) byIngredient.set(item.ingredientId, { ingredientId: item.ingredientId, name: item.name, days, limit });
  }
  return [...byIngredient.values()].sort((a, b) => b.days - a.days || a.name.localeCompare(b.name, "sv"));
}

/** The old items furthest past their limit first, then by name: what is due today is not hidden behind items that lie far over a long limit. */
export function byOvershoot(old: readonly OldPantryItem[]): OldPantryItem[] {
  return [...old].sort((a, b) => b.days - b.limit - (a.days - a.limit) || a.name.localeCompare(b.name, "sv"));
}

/** The sheet "Kan lagas nu" (Story 25.2): "Grädde har legat i 6 dagar. Rätterna med den står först." */
export function eatFirstTipText(name: string, days: number): string {
  return `${name.trim()} har legat i ${days} ${days === 1 ? "dag" : "dagar"}. Rätterna med den står först.`;
}

/** How long, as the reason line says it: "en vecka", "3 veckor", "2 månader". */
export function lainText(days: number): string {
  if (days < 7) return days <= 1 ? "en dag" : `${days} dagar`;
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

/**
 * An item with an ESTIMATED last day: the day it was added plus its limit (oldLimitDays). The app has no best-before
 * date, so `expiresOn` (YYYY-MM-DD) is never a date from a package. `overdue` is set when the day has passed.
 */
export type ExpiringPantryItem = { ingredientId: string; name: string; expiresOn: string; overdue: boolean };

const addDaysKey = (key: string, days: number): string => new Date(Date.parse(`${key}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * The items whose estimated last day is on or before `until` (YYYY-MM-DD): overdue ones, the ones due today and the
 * ones due later up to `until`. One per ingredient, the earliest day counting; the earliest first, then by name.
 */
export function expiringPantryItems(
  items: readonly Pick<PantryItem, "ingredientId" | "name" | "location" | "createdAt" | "keepsDays">[],
  now: Date,
  until: string,
): ExpiringPantryItem[] {
  const today = stockholmDayKey(now);
  const byIngredient = new Map<string, ExpiringPantryItem>();
  for (const item of items) {
    const limit = oldLimitDays(item.location, item.keepsDays);
    if (limit === null || !item.createdAt || !Number.isFinite(new Date(item.createdAt).getTime())) continue;
    const expiresOn = addDaysKey(stockholmDayKey(new Date(item.createdAt)), limit);
    if (expiresOn > until) continue;
    const known = byIngredient.get(item.ingredientId);
    if (!known || expiresOn < known.expiresOn) byIngredient.set(item.ingredientId, { ingredientId: item.ingredientId, name: item.name, expiresOn, overdue: expiresOn < today });
  }
  return [...byIngredient.values()].sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.name.localeCompare(b.name, "sv"));
}
