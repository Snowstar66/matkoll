import { customLineKey } from "./line-key";
import type { ShoppingLine } from "./compute-list";

// "Ny" på inköpslistan (Pontus 2026-11-04): a line added within the last 48
// hours has a small mint "Ny" label until it is ticked. An own item is new
// from when it was added (shopping_custom_item.created_at); a recipe line from
// when the newest of its dishes was added to the meal plan
// (meal_plan_recipe.created_at). "Now" comes from the server, so the label is
// the same on every render and pinned in tests. Rows are never re-sorted.

/** How long a line counts as new. */
export const newLineMs = 48 * 60 * 60 * 1000;

/** When each line came onto the list, by line key (ISO 8601); a line without a known time is never new. */
export type LineAddedAt = Readonly<Record<string, string>>;

export const noAddedAt: LineAddedAt = {};

/**
 * When the lines came onto the list: an own item's own time, a recipe line's
 * newest dish's. Lines whose times are not known are left out.
 */
export function lineAddedAtOf(
  lines: readonly Pick<ShoppingLine, "key" | "isCustom" | "origins">[],
  dishAddedAt: Readonly<Record<string, string | undefined>>,
  customItems: readonly { id: string; at?: string }[],
): LineAddedAt {
  const custom = new Map(customItems.flatMap((item) => (item.at ? [[customLineKey(item.id), item.at] as const] : [])));
  const added: Record<string, string> = {};
  for (const line of lines) {
    const at = line.isCustom ? custom.get(line.key) : newest(line.origins.map((id) => dishAddedAt[id]));
    if (at) added[line.key] = at;
  }
  return added;
}

function newest(times: readonly (string | undefined)[]): string | undefined {
  let best: string | undefined;
  for (const at of times) {
    if (at && !Number.isNaN(Date.parse(at)) && (best === undefined || Date.parse(at) > Date.parse(best))) best = at;
  }
  return best;
}

/** Whether the row shows "Ny": not ticked, and added less than 48 hours before `now`. */
export function isNewLine(line: Pick<ShoppingLine, "key" | "checked">, addedAt: LineAddedAt, now: string | Date): boolean {
  if (line.checked) return false;
  const at = addedAt[line.key];
  if (!at) return false;
  const age = new Date(now).getTime() - Date.parse(at);
  return !Number.isNaN(age) && age < newLineMs;
}
