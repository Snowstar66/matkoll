import { redirect } from "next/navigation";
import { Notice } from "@/components/notice";
import { requireUserOrRedirect } from "@/features/auth/server";
import { searchIngredients } from "@/features/catalog/server";
import type { PantrySite } from "@/features/pantry";
import { listPantrySites, PantryDataError } from "@/features/pantry/server";
import { ListSiteLine } from "@/features/pantry/ui/list-site-line";
import { getShoppingList } from "@/features/shopping/server";
import { ShoppingList } from "@/features/shopping/ui/shopping-list";

const next = "/lista";

/**
 * Inköpslista's data, for a <Suspense> in page.tsx (AD-18). Without a
 * signed-in user, the login page, as on the other pages. When the plan, its
 * recipes or the catalog cannot be read, a notice says so; a pantry that
 * cannot be read shows the list with nothing taken off, and says that. The
 * catalog's search is passed down for the suggestions in Lägg till egen vara
 * (AD-1: a client component never imports another module's actions). The
 * selected store and its product choices (Story 7.2) go beside the list; when
 * they cannot be read, only the detail's section Produktval says so. The place
 * the list is counted against goes to the list too, for "Lägg i lagret" and
 * its texts.
 *
 * With more than one place, "Lager: Stugan" and "Byt" stand directly under
 * the title (pantry/ui ListSiteLine, Story 8.5): the page puts pantry/ui
 * beside shopping/ui, which never imports it (AD-24). The places are read in
 * the same request as the list (listPantrySites is memoised per request, and
 * getShoppingList reads the selected place from it), so the line names the
 * place the list was counted against; when they cannot be read, there is no
 * line, and the list shows all the same.
 */
export async function ShoppingListContent() {
  await requireUserOrRedirect(next);
  const [result, sites] = await Promise.all([getShoppingList(), sitesOrNull()]);
  if (!result.ok) {
    // The session ended between the two checks: the same redirect as requireUserOrRedirect.
    if (result.error.code === "unauthorized") redirect(`/logga-in?${new URLSearchParams({ next })}`);
    return <Notice role="alert">{result.error.message}</Notice>;
  }
  const {
    plan,
    lines,
    hiddenLines,
    pantryUnavailable,
    checksUnavailable,
    pendingClear,
    store,
    storeUnavailable,
    productChoices,
    productChoicesUnavailable,
    unreadableChoices,
    site,
  } = result.data;
  return (
    <>
      {sites ? <ListSiteLine site={site} sites={sites} /> : null}
      <ShoppingList
        plan={plan}
        lines={lines}
        hiddenLines={hiddenLines}
        pantryUnavailable={pantryUnavailable}
        checksUnavailable={checksUnavailable}
        pendingClear={pendingClear}
        searchIngredients={searchIngredients}
        store={store}
        storeUnavailable={storeUnavailable}
        productChoices={productChoices}
        productChoicesUnavailable={productChoicesUnavailable}
        unreadableChoices={unreadableChoices}
        site={site}
      />
    </>
  );
}

/**
 * The user's places for the line "Lager", or `null` when they cannot be read.
 * Not logged here: the same memoised read fails in getShoppingList, which
 * logs it as `pantry_unavailable` and gives `site: null`.
 */
async function sitesOrNull(): Promise<PantrySite[] | null> {
  try {
    return await listPantrySites();
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    return null;
  }
}
