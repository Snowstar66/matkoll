"use client";

import { type ReactNode, useLayoutEffect, useState } from "react";
import type { PantrySiteWithCount, SelectedSite } from "../domain/site";
import { SitesSheet } from "./sites-sheet";
import { SitesSheetContext, useSiteSwitch } from "./site-switching";

export { SiteSwitchProvider, useSiteSwitching } from "./site-switching";

// Boendets plats i sidor (Story 8.2, changed by Story 16.14): the selection is
// made in the boende menu (BoendeVal: the side menu on a desktop, under the
// page title on a phone), so the pages no longer have a row of pills. What is
// left here is the part of Matvaror and Förråd that waits while a selection
// is on its way, and the sheet Boenden that "Lägg till boende" opens when
// there is only one boende (AddSiteButton). Matkoll never switches place by
// itself, and the selection is never kept in the address, a cookie or
// localStorage (AD-24): the server has it, for every device.

export type SiteSwitchProps = {
  /** Every place of the user's, in the order they were created, with its number of items. */
  sites: readonly PantrySiteWithCount[];
  /** The selected place, as the server read it. */
  selected: SelectedSite;
  /** Hemma's location cards, camera button, list and "Töm kylen" for the selected place. */
  children: ReactNode;
};

/**
 * Wraps the page's content for the selected place. While a selection is on its
 * way (SiteSwitchProvider, which this needs above), `children` are inert with
 * aria-busy, so no write starts in a view that mixes two places; then the page
 * shows the new place (its <Suspense> is keyed on the place). The sheet closes
 * when the page is hidden after a navigation (Activity), and a name not saved
 * is dropped.
 */
export function SiteSwitch({ sites, children }: SiteSwitchProps) {
  const { switching } = useSiteSwitch();
  const [sheet, setSheet] = useState({ open: false, session: 0 });

  // A client navigation hides the page (Activity) instead of unmounting it: the
  // sheet closes then, so it is not open when Pontus comes back, and the new
  // session that opens it next drops a name that was not saved.
  useLayoutEffect(() => () => setSheet((current) => (current.open ? { ...current, open: false } : current)), []);

  function openSheet() {
    setSheet((current) => ({ open: true, session: current.session + 1 }));
  }

  return (
    <SitesSheetContext.Provider value={openSheet}>
      <div inert={switching} aria-busy={switching || undefined} data-testid="site-content">
        {children}
      </div>
      <SitesSheet
        open={sheet.open}
        session={sheet.session}
        sites={sites}
        onClose={() => setSheet((current) => ({ ...current, open: false }))}
      />
    </SitesSheetContext.Provider>
  );
}
