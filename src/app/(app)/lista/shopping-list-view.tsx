"use client";

import { useCallback, useRef, useState } from "react";
import type { PantrySite } from "@/features/pantry";
import { ListSiteLine } from "@/features/pantry/ui/list-site-line";
import { ShoppingList, type ShoppingListProps } from "@/features/shopping/ui/shopping-list";

export type ShoppingListViewProps = Omit<ShoppingListProps, "isQuietSwitch" | "onBusyChange"> & {
  /** Every place of the user's, or `null` when they could not be read: then no line "Lager". */
  sites: readonly PantrySite[] | null;
};

/**
 * Inköpslista as the page shows it: the line "Lager: Stugan" with "Byt"
 * (pantry/ui) above the list (shopping/ui), which never import each other
 * (AD-24). What they share passes through here: "Byt" waits while the list
 * saves something, and a switch made from the sheet is not announced twice
 * (the list keeps quiet once for the place the sheet is switching to).
 */
export function ShoppingListView({ sites, ...list }: ShoppingListViewProps) {
  const [busy, setBusy] = useState(false);
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
