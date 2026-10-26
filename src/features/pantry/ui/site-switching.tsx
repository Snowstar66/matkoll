"use client";

import {
  createContext,
  type ReactNode,
  type TransitionStartFunction,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";

// What Hemma's parts share about the place switch (Story 8.2), kept apart
// from the switch itself (site-switch.tsx), so the sheet Lagervara, the
// removals and "Lägg till ställe" need neither the switch nor its actions.
//
// SiteSwitchProvider sits above the part of Hemma that is keyed on the
// selected place (page: the suggestions, the sheet Lagervara and the
// removals start afresh for each place), so what must outlive a switch
// lives here: the switch's transition, the live region that says which
// place is selected, the latest tap, and the places that a live "Ångra"
// still needs.

const noSubscription = () => () => {};

/** False during server rendering and before hydration, true once React runs in the browser. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

export type SiteSwitchApi = {
  /** A switch is on its way (the pill shows the new place, the page still the old one). */
  switching: boolean;
  startSwitch: TransitionStartFunction;
  /** Notes the place of the latest tap; an answer for an earlier one changes nothing. */
  markChoice: (siteId: string) => void;
  /** Whether `siteId` is the place of the latest tap. */
  isLatestChoice: (siteId: string) => boolean;
  /** Says `text` in the live region, which stays through a switch. */
  announce: (text: string) => void;
  /** The places a confirmation with "Ångra" still shows rows of. */
  liveUndoSites: ReadonlySet<string>;
  /** Marks `siteIds` as needed by an "Ångra"; the function returned releases them, once. */
  holdUndo: (siteIds: readonly string[]) => () => void;
};

const SiteSwitchContext = createContext<SiteSwitchApi | null>(null);

/**
 * Holds the place switch for Hemma, above the header (so "+" waits too, see
 * useSiteSwitching) and above the part keyed on the place. Renders the live
 * region for "Valt ställe: Stugan.".
 */
export function SiteSwitchProvider({ children }: { children: ReactNode }) {
  const [switching, startSwitch] = useTransition();
  const latestChoice = useRef<string | null>(null);
  const markChoice = useCallback((siteId: string) => {
    latestChoice.current = siteId;
  }, []);
  const isLatestChoice = useCallback((siteId: string) => latestChoice.current === siteId, []);
  const [announcement, setAnnouncement] = useState<{ text: string; id: number } | null>(null);
  const [holds, setHolds] = useState<ReadonlyMap<number, readonly string[]>>(() => new Map());
  const nextId = useRef(0);

  const announce = useCallback((text: string) => {
    nextId.current += 1;
    setAnnouncement({ text, id: nextId.current });
  }, []);

  const holdUndo = useCallback((siteIds: readonly string[]) => {
    nextId.current += 1;
    const token = nextId.current;
    setHolds((current) => new Map(current).set(token, siteIds));
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setHolds((current) => {
        const next = new Map(current);
        next.delete(token);
        return next;
      });
    };
  }, []);

  const liveUndoSites = useMemo(() => new Set([...holds.values()].flat()), [holds]);
  const api = useMemo(
    () => ({ switching, startSwitch, markChoice, isLatestChoice, announce, liveUndoSites, holdUndo }),
    [switching, startSwitch, markChoice, isLatestChoice, announce, liveUndoSites, holdUndo],
  );
  return (
    <SiteSwitchContext.Provider value={api}>
      {children}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="site-announcement">
        {announcement ? <span key={announcement.id}>{announcement.text}</span> : null}
      </p>
    </SiteSwitchContext.Provider>
  );
}

/** The switch's shared state; needs a SiteSwitchProvider above. */
export function useSiteSwitch(): SiteSwitchApi {
  const api = useContext(SiteSwitchContext);
  if (!api) throw new Error("useSiteSwitch needs a SiteSwitchProvider");
  return api;
}

/**
 * True while Hemma switches place: the pill shows the new place, but the list
 * still the old one, so nothing may start a write until the new place shows.
 * False without a SiteSwitchProvider above.
 */
export function useSiteSwitching(): boolean {
  return useContext(SiteSwitchContext)?.switching ?? false;
}

const noHold = () => () => {};
const noSites: ReadonlySet<string> = new Set();

/**
 * The places a live "Ångra" needs, and how to mark them; without a
 * SiteSwitchProvider above, nothing is marked.
 */
export function useLiveUndo(): Pick<SiteSwitchApi, "liveUndoSites" | "holdUndo"> {
  const api = useContext(SiteSwitchContext);
  return api ?? { liveUndoSites: noSites, holdUndo: noHold };
}

export const SitesSheetContext = createContext<(() => void) | null>(null);

/** Opens the sheet Ställen; needs a SiteSwitch above. */
export function useOpenSitesSheet(): () => void {
  const open = useContext(SitesSheetContext);
  if (!open) throw new Error("useOpenSitesSheet needs a SiteSwitch");
  return open;
}
