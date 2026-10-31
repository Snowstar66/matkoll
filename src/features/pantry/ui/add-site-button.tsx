"use client";

import { Button } from "@/components/button";
import { useHydrated, useOpenSitesSheet } from "./site-switching";

/**
 * "Lägg till boende" (Story 8.2, EXPERIENCE.md): the text button at the
 * bottom of Hemma, under "Töm kylen", while Pontus has only one place, so
 * there is no site switch. It opens the sheet Boenden; needs a SiteSwitch
 * above. Waits for hydration, since it only works through React.
 */
export function AddSiteButton() {
  const open = useOpenSitesSheet();
  const hydrated = useHydrated();
  return (
    <Button variant="text" disabled={!hydrated} onClick={open} className="-ml-3 self-start">
      Lägg till boende
    </Button>
  );
}
