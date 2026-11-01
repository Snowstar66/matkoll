import type { ShoppingLine } from "./compute-list";

// Inköpslista's filter (fix after go-live): Egna shows the items Pontus added himself ("Egen"),
// Till rätter the lines counted from the week's dishes. No chip chosen shows every line (Alla,
// Story 19.3). Kept in the address as `?visa=egna` / `?visa=ratter`, so it survives a reload.

export type ListFilter = "own" | "dishes";

/** The address value of each filter. */
export const listFilterParam: Record<ListFilter, string> = { own: "egna", dishes: "ratter" };

/** The chips' labels. */
export const listFilterLabels: Record<ListFilter, string> = { own: "Egna", dishes: "Till rätter" };

export const LIST_FILTERS: readonly ListFilter[] = ["own", "dishes"];

/** `?visa=…` as a filter; anything else (or nothing) is none. */
export function parseListFilter(value: string | string[] | undefined | null): ListFilter | null {
  const first = Array.isArray(value) ? value[0] : value;
  return LIST_FILTERS.find((filter) => listFilterParam[filter] === first) ?? null;
}

/** Whether a line belongs under the filter; every line with none. */
export function matchesListFilter(line: ShoppingLine, filter: ListFilter | null): boolean {
  if (filter === null) return true;
  return filter === "own" ? line.isCustom : !line.isCustom;
}

/**
 * The empty state under a filter with no line left to buy: none of the kind on the list, or all
 * of them already in the basket.
 */
export function filterEmptyText(filter: ListFilter, anyInBasket: boolean): string {
  if (filter === "own") return anyInBasket ? "Alla egna varor ligger i korgen." : "Inga egna varor den här veckan.";
  return anyInBasket ? "Allt till rätterna ligger i korgen." : "Inga varor till rätter den här veckan.";
}
