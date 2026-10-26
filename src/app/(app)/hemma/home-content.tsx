import { Notice } from "@/components/notice";
import { requireUserOrRedirect } from "@/features/auth/server";
import type { Location } from "@/features/catalog";
import { CatalogDataError } from "@/features/catalog/server";
import type { PantryItem } from "@/features/pantry";
import { countPantryItems, listPantry, PantryDataError } from "@/features/pantry/server";
import { PantryCamera } from "@/features/pantry/ui/pantry-camera";
import { PantryPlace } from "@/features/pantry/ui/pantry-place";
import { PantrySuggestionList } from "@/features/pantry/ui/pantry-suggestion-list";
import { errorMessages } from "@/lib/errors";

export type HomeContentProps = {
  /** The chosen location. */
  location: Location;
  /** Where the login page sends Pontus back to. */
  next: string;
};

/**
 * Hemma's data, for a <Suspense> in page.tsx (AD-18): the location cards and
 * the chosen location's items. The chosen card's count is the number of
 * items listed (PantryPlace), so card and list never disagree; the other two
 * are counted by the database. When the pantry or the catalog's names cannot be read,
 * a notice says so, with the camera button and the suggestions under it (a
 * photo needs no list); other errors go to the error boundary.
 */
export async function HomeContent({ location, next }: HomeContentProps) {
  await requireUserOrRedirect(next);

  let counts: Record<Location, number>;
  let items: PantryItem[];
  try {
    [counts, items] = await Promise.all([countPantryItems(), listPantry(location)]);
  } catch (error) {
    if (error instanceof PantryDataError) {
      console.error("pantry_unavailable", { reason: error.detail });
    } else if (error instanceof CatalogDataError) {
      console.error("pantry_unavailable", { reason: error.code, detail: error.detail });
    } else {
      throw error;
    }
    return (
      <div className="flex flex-col gap-6">
        <Notice role="alert">{errorMessages.pantry_unavailable}</Notice>
        <PantryCamera location={location} />
        <PantrySuggestionList />
      </div>
    );
  }

  return <PantryPlace location={location} counts={counts} items={items} />;
}
