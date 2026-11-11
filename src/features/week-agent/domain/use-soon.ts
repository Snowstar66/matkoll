import type { ExpiringPantryItem } from "@/features/pantry";
import type { UseSoonItem } from "./types";

// What at home goes out within the planning week, as facts for the reasons. Pure.

/** The date `days` after `date` (YYYY-MM-DD). */
export const addDays = (date: string, days: number): string => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * What at home goes out within the week, by catalog ingredient, with the weekday of its ESTIMATED last day (the
 * pantry has no best-before dates: added + the days the ingredient keeps), marked `estimated`. Already overdue: no
 * day ("behöver användas snart"). A day before the week starts (but not yet past) is left out: by then it is gone,
 * and the agent does not claim more than it knows.
 */
export function soonFactsOf(items: readonly ExpiringPantryItem[], weekStart: string, today: string): Map<string, UseSoonItem> {
  const out = new Map<string, UseSoonItem>();
  for (const item of items) {
    if (item.overdue) {
      out.set(item.ingredientId, { name: item.name, expiresWeekday: null });
      continue;
    }
    const index = Math.round((Date.parse(`${item.expiresOn}T12:00:00Z`) - Date.parse(`${weekStart}T12:00:00Z`)) / 86_400_000);
    if (index < 0 || index > 6) continue;
    out.set(item.ingredientId, { name: item.name, expiresWeekday: index + 1, estimated: true, ...(item.expiresOn === today ? { today: true } : {}) });
  }
  return out;
}
