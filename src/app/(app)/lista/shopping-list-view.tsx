"use client";

import { type ReactNode, useCallback, useRef, useState } from "react";
import { listRefreshMs, useLiveRefresh } from "@/components/use-live-refresh";
import type { BoendeCounts, PantrySite } from "@/features/pantry";
import { ListSiteLine } from "@/features/pantry/ui/list-site-line";
import { ShoppingList, type ShoppingListProps } from "@/features/shopping/ui/shopping-list";

export type ShoppingListViewProps = Omit<ShoppingListProps, "isQuietSwitch" | "onBusyChange" | "onOfflineChange"> & {
  /** Every place of the user's, or `null` when they could not be read: then no line "Boende". */
  sites: readonly PantrySite[] | null;
  /** What each boende holds, read when the boende sheet opens (a Server Action); the page gives it. */
  loadCounts?: () => Promise<Record<string, BoendeCounts> | null>;
  /** The week dropdown ("Denna vecka / Nästa vecka / Om 2 veckor") on the boende row above the list; the route composes it (AD-1). */
  weekNav?: ReactNode;
};

/**
 * Inköpslista as the page shows it: the boende button "📍 Stugan ⌄"
 * (pantry/ui) with the week dropdown (mealplan/ui) on the same row, then the list (shopping/ui), which never import each other
 * (AD-24). What they share passes through here: the button waits while the list
 * saves something, and a switch made from the sheet is not announced twice
 * (the list keeps quiet once for the place the sheet is switching to).
 */
export function ShoppingListView({ sites, loadCounts, weekNav, ...list }: ShoppingListViewProps) {
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  // Story 17.7, polled since 17.12: another phone on the account changes the
  // list, the meal plan or what the list is counted against; this one reads the
  // page again every few seconds. Queued offline checks are laid over whatever
  // is read (mergeQueued), so a read never undoes a tick that waits to be sent.
  useLiveRefresh({ intervalMs: listRefreshMs, busy, paused: offline });
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
      {/* One quiet row: the boende button on the left, the week dropdown on the right. */}
      {sites || weekNav ? (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3">
          {sites ? (
            <ListSiteLine site={list.site ?? null} sites={sites} busy={busy} onSwitching={onSwitching} loadCounts={loadCounts} />
          ) : null}
          {weekNav}
        </div>
      ) : null}
      <ShoppingList {...list} isQuietSwitch={isQuietSwitch} onBusyChange={setBusy} onOfflineChange={setOffline} />
    </>
  );
}
