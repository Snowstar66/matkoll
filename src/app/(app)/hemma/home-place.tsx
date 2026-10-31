import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";
import { type PantrySiteWithCount, placeFromSlug, placeSlug, type SelectedSite } from "@/features/pantry";
import { listPantrySitesWithCounts, PantryDataError } from "@/features/pantry/server";
import { AddPantryItemButton, PantrySheetProvider } from "@/features/pantry/ui/pantry-item-sheet";
import { PantrySuggestionsProvider } from "@/features/pantry/ui/pantry-suggestions";
import { BoendeVal } from "@/features/pantry/ui/boende-val";
import { SiteSwitch } from "@/features/pantry/ui/site-switch";
import { errorMessages } from "@/lib/errors";
import { loadBoendeCounts } from "../boende-counts";
import { HomeContent } from "./home-content";

/**
 * Reads the location from the address and the user's places; "+" in the
 * header needs both. The data's <Suspense> is keyed on the place and the
 * location, so choosing another location or place shows the skeleton rows
 * (after 300 ms) instead of the old items while the new ones load. The
 * camera's suggestions are held above it, without a key, so they stay when
 * another location or place is chosen (Story 8.4): every write from them
 * sends the photo's own place, every removal and "Ångra" its rows' place,
 * and the sheet Lagervara keeps the place it opened for, so nothing from one
 * place is saved on another. What belongs to the switch itself (its
 * transition, the live region and the places a live "Ångra" needs) is in
 * SiteSwitchProvider (in the layout, Story 16.14). When the places cannot be read, Hemma says so, without
 * a switch.
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
        <PageHeader title="Matvaror" />
        <Notice role="alert">{errorMessages.pantry_unavailable}</Notice>
      </>
    );
  }
  const site: SelectedSite = { id: selected.id, name: selected.name, siteCount: sites.length };

  return (
    <PantrySuggestionsProvider>
        <PantrySheetProvider location={location} site={site}>
          <PageHeader title="Matvaror" action={<AddPantryItemButton variant="icon" />} />
          {/* A phone has no side menu: the boende is under the title (Story 16.14). */}
          <div className="-mt-2 mb-3 empty:hidden desktop:hidden">
            <BoendeVal variant="page" sites={sites} loadCounts={loadBoendeCounts} />
          </div>
          <SiteSwitch sites={sites} selected={site}>
            <Suspense key={`${site.id}:${location}`} fallback={<Skeleton rows={3} />}>
              <HomeContent site={site} location={location} next={next} />
            </Suspense>
          </SiteSwitch>
        </PantrySheetProvider>
      </PantrySuggestionsProvider>
  );
}
