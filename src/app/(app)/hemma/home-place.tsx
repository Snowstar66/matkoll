import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";
import { type PantrySiteWithCount, placeFromSlug, placeSlug, type SelectedSite } from "@/features/pantry";
import { listPantrySitesWithCounts, PantryDataError } from "@/features/pantry/server";
import { AddPantryItemButton, PantrySheetProvider } from "@/features/pantry/ui/pantry-item-sheet";
import { PantrySuggestionsProvider } from "@/features/pantry/ui/pantry-suggestions";
import { SiteSwitch, SiteSwitchProvider } from "@/features/pantry/ui/site-switch";
import { errorMessages } from "@/lib/errors";
import { HomeContent } from "./home-content";

/**
 * Reads the location from the address and the user's places; "+" in the
 * header needs both. The data's <Suspense> is keyed on the place and the
 * location, so choosing another location or place shows the skeleton rows
 * (after 300 ms) instead of the old items while the new ones load. The
 * camera's suggestions are held above it, without a key, so they stay when
 * another location is chosen. Everything under SiteSwitchProvider is keyed
 * on the selected place: the camera's suggestions, the sheet Lagervara and
 * the removals start afresh for each place, so a photo or a removal from one
 * place is never confirmed on another on this device. What must outlive a
 * switch (its transition, the live region and the places a live "Ångra"
 * needs) is in SiteSwitchProvider. When the places cannot be read, Hemma
 * says so, without a switch.
 */
export async function HomePlace({ searchParams }: Pick<PageProps<"/hemma">, "searchParams">) {
  const { plats } = await searchParams;
  const location = placeFromSlug(plats);
  const next = plats === undefined ? "/hemma" : `/hemma?plats=${placeSlug(location)}`;
  await requireUserOrRedirect(next);

  let sites: PantrySiteWithCount[] | null = null;
  try {
    sites = await listPantrySitesWithCounts();
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_unavailable", { reason: error.detail });
  }
  const selected = sites?.find((site) => site.isSelected);
  if (!sites || !selected) {
    // The places could not be read, or the user has none yet (before
    // ensure_pantry_defaults, which every sign-in runs): nothing to show or
    // save to, and no switch.
    if (sites) console.error("pantry_unavailable", { reason: "no_selected_site" });
    return (
      <>
        <PageHeader title="Hemma" />
        <Notice role="alert">{errorMessages.pantry_unavailable}</Notice>
      </>
    );
  }
  const site: SelectedSite = { id: selected.id, name: selected.name, siteCount: sites.length };

  return (
    <SiteSwitchProvider>
      <PantrySuggestionsProvider key={site.id}>
        <PantrySheetProvider location={location} site={site}>
          <PageHeader title="Hemma" action={<AddPantryItemButton variant="icon" />} />
          <SiteSwitch sites={sites} selected={site}>
            <Suspense key={`${site.id}:${location}`} fallback={<Skeleton rows={3} />}>
              <HomeContent site={site} location={location} next={next} />
            </Suspense>
          </SiteSwitch>
        </PantrySheetProvider>
      </PantrySuggestionsProvider>
    </SiteSwitchProvider>
  );
}
