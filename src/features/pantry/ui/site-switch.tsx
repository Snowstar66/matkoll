"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useLayoutEffect, useOptimistic, useState } from "react";
import { Button } from "@/components/button";
import { FilterPills } from "@/components/filter-pills";
import { Notice } from "@/components/notice";
import { fail, type Result } from "@/lib/errors";
import { selectPantrySite } from "../actions/select-pantry-site";
import { type PantrySiteWithCount, type SelectedSite, selectedSiteText } from "../domain/site";
import { SitesSheet } from "./sites-sheet";
import { SitesSheetContext, useHydrated, useSiteSwitch } from "./site-switching";

export { SiteSwitchProvider, useSiteSwitching } from "./site-switching";

// Ställesväljaren in Hemma (FR-30, FR-31, Story 8.2, EXPERIENCE.md): with two
// or more places, a row of filter pills with the places' names in the order
// they were created, above the location cards, and last the text button
// "Ställen", which opens the sheet Ställen. With one place there is no
// switch; "Lägg till ställe" at the bottom of Hemma opens the sheet instead
// (AddSiteButton). A tap on a pill selects the place at once
// (optimistically), saves the selection on the server (selectPantrySite) and
// shows the place's locations; the chosen location (`?plats=`) stays, since
// the address is not touched. Matkoll never switches place by itself, and
// the selection is never kept in the address, a cookie or localStorage
// (AD-24): the server has it, for every device.

export type SiteSwitchProps = {
  /** Every place of the user's, in the order they were created, with its number of items. */
  sites: readonly PantrySiteWithCount[];
  /** The selected place, as the server read it. */
  selected: SelectedSite;
  /** Hemma's location cards, camera button, list and "Töm kylen" for the selected place. */
  children: ReactNode;
};

/**
 * The switch above Hemma's place (see the comment at the top), and the sheet
 * Ställen it opens. While a selection is on its way, `children` are inert
 * with aria-busy, so no write starts in a view that mixes two places; then
 * the page shows the new place (its <Suspense> is keyed on the place). The
 * live region (SiteSwitchProvider, which this needs above) says "Valt
 * ställe: Stugan." once the selection is saved. When
 * it fails, the pill goes back and a Notice says why; an answer for an
 * earlier tap than the latest is ignored, so the last tap wins. The sheet
 * closes when Hemma is hidden after a navigation (Activity), and a name not
 * saved is dropped.
 */
export function SiteSwitch({ sites, selected, children }: SiteSwitchProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const { switching, startSwitch, markChoice, isLatestChoice, announce } = useSiteSwitch();
  const [shownId, showId] = useOptimistic(selected.id);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState({ open: false, session: 0 });

  // A client navigation hides Hemma (Activity) instead of unmounting it: the
  // sheet closes then, so it is not open when Pontus comes back, and the new
  // session that opens it next drops a name that was not saved.
  useLayoutEffect(() => () => setSheet((current) => (current.open ? { ...current, open: false } : current)), []);

  function openSheet() {
    setSheet((current) => ({ open: true, session: current.session + 1 }));
  }

  function choose(id: string) {
    if (!sites.some((site) => site.id === id)) return;
    setError(null);
    markChoice(id);
    startSwitch(async () => {
      showId(id);
      let result: Result<{ site: { id: string; name: string } }>;
      try {
        result = await selectPantrySite({ id });
      } catch {
        // No answer (e.g. no connection): the pill goes back, and the page is read again.
        result = fail("pantry_site_failed");
      }
      if (!isLatestChoice(id)) return;
      if (result.ok) {
        // The provider's live region outlives the part of the page keyed on the place.
        announce(selectedSiteText(result.data.site.name));
        return;
      }
      if (result.error.code !== "unauthorized") setError(result.error.message);
      // Gone, refused or unknown: what the server has is read again.
      router.refresh();
    });
  }

  return (
    <SitesSheetContext.Provider value={openSheet}>
      <div className="flex flex-col gap-4">
        {sites.length > 1 ? (
          <div className="flex flex-wrap items-center gap-x-2">
            {/* A tap before hydration would do nothing, so the pills wait. */}
            <FilterPills
              label="Ställe"
              options={sites.map((site) => ({ value: site.id, label: site.name }))}
              value={shownId}
              onChange={choose}
              disabled={!hydrated}
              className="min-w-0"
            />
            <Button variant="text" disabled={!hydrated || switching} onClick={openSheet}>
              Ställen
            </Button>
          </div>
        ) : null}
        {error ? <Notice role="alert">{error}</Notice> : null}
        <div inert={switching} aria-busy={switching || undefined} data-testid="site-content">
          {children}
        </div>
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
