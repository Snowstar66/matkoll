"use client";

import { useCallback, useRef, useState } from "react";
import { useLiveRefresh } from "@/components/use-live-refresh";
import type { PantrySite } from "@/features/pantry";
import { ListSiteLine } from "@/features/pantry/ui/list-site-line";
import { ShoppingList, type ShoppingListProps } from "@/features/shopping/ui/shopping-list";

export type ShoppingListViewProps = Omit<ShoppingListProps, "isQuietSwitch" | "onBusyChange"> & {
  /** Every place of the user's, or `null` when they could not be read: then no line "Boende". */
  sites: readonly PantrySite[] | null;
};

/** What the list is counted from, and what a family member can change on it. */
const liveTables = [
  "shopping_check",
  "shopping_custom_item",
  "shopping_line_override",
  "meal_plan",
  "meal_plan_recipe",
  "pantry_item",
  "product_choice",
] as const;

/**
 * Inköpslista as the page shows it: the line "Boende: Stugan" with "Byt"
 * (pantry/ui) above the list (shopping/ui), which never import each other
 * (AD-24). What they share passes through here: "Byt" waits while the list
 * saves something, and a switch made from the sheet is not announced twice
 * (the list keeps quiet once for the place the sheet is switching to).
 */
export function ShoppingListView({ sites, ...list }: ShoppingListViewProps) {
  const [busy, setBusy] = useState(false);
  // Story 17.7: another phone on the account changes the list, the meal plan or
  // what the list is counted against; this one reads the page again.
  useLiveRefresh({ tables: liveTables, busy });
  /** The place a switch from the sheet is on its way to, until the list has shown it. */
  const quiet = useRef<string | null>(null);
  const onSwitching = useCallback((siteId: string | null) => {
    quiet.current = siteId;
  }, []);
  const isQuietSwitch = useCallback((siteId: string | null) => {
    if (siteId === null || quiet.current !== siteId) return false;
    quiet.current = null;
    return true;
  }, []);

  return (
    <>
      {sites ? <ListSiteLine site={list.site ?? null} sites={sites} busy={busy} onSwitching={onSwitching} /> : null}
      <ShoppingList {...list} isQuietSwitch={isQuietSwitch} onBusyChange={setBusy} />
    </>
  );
}
