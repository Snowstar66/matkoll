"use client";

import { useLayoutEffect, useState } from "react";
import { Button } from "@/components/button";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import { itemCountText } from "../domain/places";
import { type PantrySiteWithCount, selectedSiteLabel } from "../domain/site";
import { SitesSheet } from "./sites-sheet";
import { useHydrated } from "./site-switching";

/**
 * "Boenden" under Inställningar (Story 14.7): the user's places as rows with
 * their number of items, and the same sheet Boenden as in Matvaror for adding,
 * renaming and removing (FR-29). A tap on a row, or "Lägg till boende", opens
 * the sheet; it closes when the page is hidden after a navigation (Activity),
 * and a name not saved is dropped, as in Matvaror.
 */
export function HousingSettings({ sites }: { sites: readonly PantrySiteWithCount[] }) {
  const hydrated = useHydrated();
  const [sheet, setSheet] = useState({ open: false, session: 0 });

  useLayoutEffect(() => () => setSheet((current) => (current.open ? { ...current, open: false } : current)), []);

  function openSheet() {
    setSheet((current) => ({ open: true, session: current.session + 1 }));
  }

  return (
    <section aria-label="Boenden" className="flex flex-col gap-4">
      <p className="px-1 desktop:px-0 text-meta text-ink-3">Boendena har var sina matvaror. Välj vilket som gäller i Matvaror.</p>
      <ListGroup label="Boenden">
        {sites.map((site) => {
          const meta = [site.itemCount === null ? null : itemCountText(site.itemCount), site.isSelected ? selectedSiteLabel : null]
            .filter(Boolean)
            .join(" · ");
          // A tap before hydration would do nothing, so the row is plain text until then.
          return hydrated ? (
            <ListRow
              key={site.id}
              data-testid="housing-row"
              title={site.name}
              meta={meta}
              onPress={openSheet}
              pressProps={{ "aria-label": `Hantera ${site.name}` }}
            />
          ) : (
            <ListRow key={site.id} data-testid="housing-row" title={site.name} meta={meta} />
          );
        })}
      </ListGroup>
      <div>
        <Button variant="text" disabled={!hydrated} onClick={openSheet} className="-ml-3">
          Lägg till boende
        </Button>
      </div>
      <SitesSheet
        open={sheet.open}
        session={sheet.session}
        sites={sites}
        onClose={() => setSheet((current) => ({ ...current, open: false }))}
      />
    </section>
  );
}
