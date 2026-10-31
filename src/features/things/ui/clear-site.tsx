"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import { useToast } from "@/components/toast";
import { clearThingSite } from "../actions/clear-things";
import { clearCountsText, clearedText, clearSiteDetailText, clearSiteText, clearSiteWord, type ClearCounts } from "../domain/thing-clear";
import { ClearSheet } from "./clear-sheet";

// Inställningar → Boenden (Story 18.15): a row "Rensa förrådet i Hemma" for each
// boende that has something in Förråd, with what is in it. The sheet asks for
// "RENSA" before everything in Förråd of that boende goes; Matvaror is not touched.

export type SiteThings = { id: string; name: string; counts: ClearCounts };

export function ClearSiteThings({ sites }: { sites: readonly SiteThings[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [asking, setAsking] = useState<SiteThings | null>(null);
  // Kept while the sheet closes, so its text does not blank during the animation.
  const [last, setLast] = useState<SiteThings | null>(null);
  const shown = asking ?? last;
  const withThings = sites.filter((site) => site.counts.things + site.counts.cards + site.counts.boxes > 0);
  if (withThings.length === 0 && !shown) return null;

  return (
    <section aria-label="Förrådet" className="flex flex-col gap-1.5" data-testid="clear-sites">
      <h2 className="px-1 desktop:px-0 text-section-label text-ink-2">Förrådet</h2>
      <ListGroup label="Förrådet">
        {withThings.map((site) => (
          <ListRow
            key={site.id}
            data-testid="clear-site-row"
            title={clearSiteText(site.name)}
            meta={clearCountsText(site.counts)}
            onPress={() => {
              setLast(site);
              setAsking(site);
            }}
            pressProps={{ "aria-haspopup": "dialog" }}
          />
        ))}
      </ListGroup>
      {shown ? (
        <ClearSheet
          open={asking !== null}
          onClose={() => setAsking(null)}
          title={clearSiteText(shown.name)}
          counts={shown.counts}
          detail={clearSiteDetailText(shown.name)}
          word={clearSiteWord}
          onClear={(confirm) => clearThingSite({ siteId: shown.id, confirm })}
          onCleared={(removed) => {
            setAsking(null);
            router.refresh();
            showToast(clearedText(removed));
          }}
          onStale={() => router.refresh()}
        />
      ) : null}
    </section>
  );
}
