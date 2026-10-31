"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState } from "react";
import { fail, type Result } from "@/lib/errors";
import { selectPantrySite } from "../actions/select-pantry-site";
import { type PantrySite, selectedSiteText } from "../domain/site";
import { useSiteSwitch } from "./site-switching";

/**
 * The selection of a boende (FR-30, FR-31, AD-24), for the boende menu and the
 * cards in Inställningar. `choose` shows the boende at once (optimistically),
 * saves it on the server (selectPantrySite) and says "Valt boende: Stugan." in
 * the live region; the page's content is inert meanwhile (SiteSwitchProvider
 * above). The selection is never kept in the address, a cookie or localStorage:
 * the server has it, for every device. An answer for an earlier tap than the
 * latest is ignored, so the last tap wins; a failure puts the choice back and
 * `error` says why. `choose` gives back whether it was saved.
 */
export function useChooseSite(sites: readonly PantrySite[]) {
  const router = useRouter();
  const { switching, startSwitch, markChoice, isLatestChoice, announce } = useSiteSwitch();
  const selectedId = sites.find((site) => site.isSelected)?.id ?? sites[0]?.id ?? "";
  const [shownId, showId] = useOptimistic(selectedId);
  const [error, setError] = useState<string | null>(null);

  function choose(id: string): Promise<boolean> {
    if (!sites.some((site) => site.id === id)) return Promise.resolve(false);
    setError(null);
    markChoice(id);
    return new Promise((resolve) => {
      startSwitch(async () => {
        showId(id);
        let result: Result<{ site: { id: string; name: string } }>;
        try {
          result = await selectPantrySite({ id });
        } catch {
          // No answer (e.g. no connection): the choice goes back, and the page is read again.
          result = fail("pantry_site_failed");
        }
        if (!isLatestChoice(id)) return resolve(false);
        if (result.ok) {
          // The provider's live region outlives the part of the page keyed on the place.
          announce(selectedSiteText(result.data.site.name));
          return resolve(true);
        }
        if (result.error.code !== "unauthorized") setError(result.error.message);
        // Gone, refused or unknown: what the server has is read again.
        router.refresh();
        resolve(false);
      });
    });
  }

  return { shownId, choose, error, switching };
}
