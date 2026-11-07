import { redirect } from "next/navigation";
import { Notice } from "@/components/notice";
import { requireUserOrRedirect } from "@/features/auth/server";
import Link from "next/link";
import { buttonClasses } from "@/components/button";
import { addWeeks, currentWeekStart, overviewWeeks, weekQueryAlways, weeksBetween } from "@/features/mealplan";
import { resolveViewedWeek } from "@/features/mealplan/server";
import { WeekNav } from "@/features/mealplan/ui/week-nav";
import { matchIngredientNames, searchIngredients } from "@/features/catalog/server";
import type { PantrySite } from "@/features/pantry";
import { listPantrySites, PantryDataError } from "@/features/pantry/server";
import { getShoppingList } from "@/features/shopping/server";
import { noDishesText, parseListFilter, planWeekText } from "@/features/shopping";
import { loadBoendeCounts } from "../boende-counts";
import { ShoppingListView } from "./shopping-list-view";

const next = "/lista";
/** Story 17.9: the address that opens "Lägg till vara" at once (home-screen shortcut). */
const quickAddNext = "/lista/lagg-till";

/**
 * Inköpslista's data, for a <Suspense> in page.tsx (AD-18). Without a
 * signed-in user, the login page, as on the other pages. When the plan, its
 * recipes or the catalog cannot be read, a notice says so; a pantry that
 * cannot be read shows the list with nothing taken off, and says that. The
 * catalog's search is passed down for the suggestions in Lägg till vara
 * (AD-1: a client component never imports another module's actions). The
 * selected store and its product choices (Story 7.2) go beside the list; when
 * they cannot be read, only the detail's section Produktval says so. The place
 * the list is counted against goes to the list too, for "Lägg till i Matvaror" and
 * its texts.
 *
 * With more than one place, the boende button "📍 Stugan ⌄" stands directly under
 * the title (pantry/ui ListSiteLine, Story 8.5, Story 19.2), beside the list
 * (ShoppingListView, AD-24). The places are read in the same request as the
 * list (listPantrySites is memoised per request, and getShoppingList reads
 * the selected place from it), so the line names the place the list was
 * counted against. The places never stop the list: when they cannot be read,
 * for whatever reason, there is no line.
 */
export async function ShoppingListContent({
  searchParams,
  quickAdd = false,
}: { searchParams?: Promise<{ vecka?: string | string[]; visa?: string | string[] }>; quickAdd?: boolean } = {}) {
  const user = await requireUserOrRedirect(quickAdd ? quickAddNext : next);
  const params = await searchParams;
  const vecka = params?.vecka;
  const now = new Date();
  const weekStart = await resolveViewedWeek(Array.isArray(vecka) ? vecka[0] : vecka, now);
  const thisWeek = currentWeekStart(now);
  const weeks = Array.from({ length: overviewWeeks }, (_, offset) => addWeeks(thisWeek, offset));
  if (!weeks.includes(weekStart)) weeks.push(weekStart);
  // UX-04: the segment says how many items each week has to buy; the viewed week's list is read below,
  // the others here (a week that cannot be read says "Tom").
  const otherCounts = Promise.all(
    weeks.filter((week) => week !== weekStart).map(async (week) => {
      const other = await getShoppingList(week).catch(() => null);
      return [week, other?.ok ? other.data.lines.filter((line) => !line.isCustom).length : 0] as const;
    }),
  );
  const [listRead, sitesRead] = await Promise.allSettled([getShoppingList(weekStart), listPantrySites()]);
  // getShoppingList handles every expected error: what it throws is a bug.
  if (listRead.status === "rejected") throw listRead.reason;
  const result = listRead.value;
  if (!result.ok) {
    // The session ended between the two checks: the same redirect as requireUserOrRedirect.
    if (result.error.code === "unauthorized") redirect(`/logga-in?${new URLSearchParams({ next })}`);
    return <Notice role="alert">{result.error.message}</Notice>;
  }
  const sites = sitesOf(sitesRead);
  const {
    plan,
    lines,
    hiddenLines,
    pantryUnavailable,
    staplesSkipped,
    checksUnavailable,
    pendingClear,
    store,
    storeUnavailable,
    productChoices,
    productChoicesUnavailable,
    unreadableChoices,
    site,
    marks,
    addedAt,
  } = result.data;
  const counts: Record<string, number> = {
    ...Object.fromEntries(await otherCounts),
    [weekStart]: lines.filter((line) => !line.isCustom).length,
  };
  const filterParam = Array.isArray(params?.visa) ? params.visa[0] : params?.visa;
  // A week without dishes: say so, and offer to plan that week in Matsedel.
  const empty = {
    text: noDishesText(weeksBetween(thisWeek, weekStart)),
    action: (
      <Link href={`/matsedel${weekQueryAlways(weekStart)}`} className={buttonClasses("secondary")}>
        {planWeekText}
      </Link>
    ),
  };
  return (
    <>
      <ShoppingListView
        // The week's own state: a new key starts the list afresh, so no check, sheet or
        // pending change of another week's plan is carried over (Story 13.7).
        key={weekStart}
        sites={sites}
        loadCounts={loadBoendeCounts}
        weekNav={
          <WeekNav
            weekStart={weekStart}
            counts={counts}
            now={now}
            basePath="/lista"
            showHistory={false}
            unit="items"
            keepParams={filterParam ? { visa: filterParam } : undefined}
          />
        }
        userId={user.id}
        plan={plan}
        lines={lines}
        hiddenLines={hiddenLines}
        pantryUnavailable={pantryUnavailable}
        staplesSkipped={staplesSkipped}
        checksUnavailable={checksUnavailable}
        pendingClear={pendingClear}
        searchIngredients={searchIngredients}
        matchNames={matchIngredientNames}
        store={store}
        storeUnavailable={storeUnavailable}
        productChoices={productChoices}
        productChoicesUnavailable={productChoicesUnavailable}
        unreadableChoices={unreadableChoices}
        site={site}
        marks={marks}
        addedAt={addedAt}
        // "Ny" is counted against the server's now, so every render agrees.
        now={now.toISOString()}
        empty={empty}
        openAddOnStart={quickAdd}
        filter={parseListFilter(params?.visa)}
      />
    </>
  );
}

/**
 * The user's places for the line "Boende", or `null` when they could not be
 * read. A PantryDataError is not logged here: the same memoised read fails
 * in getShoppingList, which logs it as `pantry_unavailable`. Anything else is
 * logged, with its name only, and still gives no line rather than no list.
 */
function sitesOf(read: PromiseSettledResult<PantrySite[]>): PantrySite[] | null {
  if (read.status === "fulfilled") return read.value;
  if (!(read.reason instanceof PantryDataError)) {
    console.error("pantry_sites_unavailable", {
      reason: read.reason instanceof Error ? read.reason.name : "unknown",
    });
  }
  return null;
}
