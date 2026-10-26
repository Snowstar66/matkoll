import { redirect } from "next/navigation";
import { Notice } from "@/components/notice";
import { requireUserOrRedirect } from "@/features/auth/server";
import { searchIngredients } from "@/features/catalog/server";
import { getShoppingList } from "@/features/shopping/server";
import { ShoppingList } from "@/features/shopping/ui/shopping-list";

const next = "/lista";

/**
 * Inköpslista's data, for a <Suspense> in page.tsx (AD-18). Without a
 * signed-in user, the login page, as on the other pages. When the plan, its
 * recipes or the catalog cannot be read, a notice says so; a pantry that
 * cannot be read shows the list with nothing taken off, and says that. The
 * catalog's search is passed down for the suggestions in Lägg till egen vara
 * (AD-1: a client component never imports another module's actions).
 */
export async function ShoppingListContent() {
  await requireUserOrRedirect(next);
  const result = await getShoppingList();
  if (!result.ok) {
    // The session ended between the two checks: the same redirect as requireUserOrRedirect.
    if (result.error.code === "unauthorized") redirect(`/logga-in?${new URLSearchParams({ next })}`);
    return <Notice role="alert">{result.error.message}</Notice>;
  }
  const { plan, lines, pantryUnavailable, checksUnavailable } = result.data;
  return (
    <ShoppingList
      plan={plan}
      lines={lines}
      pantryUnavailable={pantryUnavailable}
      checksUnavailable={checksUnavailable}
      searchIngredients={searchIngredients}
    />
  );
}
