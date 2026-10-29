"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/button";
import { cx } from "@/components/cx";
import { EmptyState } from "@/components/empty-state";
import { FilterPills, type FilterOption } from "@/components/filter-pills";
import type { SearchIngredients } from "@/components/ingredient-picker";
import { Notice } from "@/components/notice";
import { SearchField, type SearchFieldHandle } from "@/components/search-field";
import { Skeleton } from "@/components/skeleton";
import type { PlanningTarget } from "@/features/mealplan";
import { siteLineText, type SelectedSite } from "@/features/pantry";
import { errorMessages, fail, type AppError, type Result } from "@/lib/errors";
import { searchLibrary } from "../actions/search-recipes";
import { filterRecipes, type RecipeFilter, type RecipeLibrary, type RecipeListItem } from "../domain/recipe-list";
import type { AddToPlan } from "./add-to-plan-button";
import { AiSuggestions } from "./ai-suggestions";
import type { OwnRecipesRead } from "./own-recipes";
import { useRecipeFilter } from "./recipe-filter-store";
import { useRecipeDelete } from "./recipe-delete";
import { RecipeList } from "./recipe-list";
import { useDishSuggestions } from "./use-dish-suggestions";
import { useFavorites } from "./use-favorites";

// Receptbiblioteket (FR-8, FR-9, FR-22, UX-DR7): the search field, the filter
// pills Alla, Favoriter and Kan lagas nu, and the recipe rows. The first list,
// every recipe newest first, comes from the server; a search asks
// searchLibrary for the matching recipes, and the filter is applied here, so
// switching pills needs no request and a heart that changes shows at once.
// Each row's status ("Kan lagas nu" or "Saknar N varor") comes with it from
// the server; Kan lagas nu ranks the rows by it (fewest missing first) without
// a request, and has AI-förslag at the bottom (AiSuggestions). Their state is
// held here, so the suggestions stay while the pills change. With more than
// one place, Kan lagas nu says which place the status is counted against
// ("Lager: Stugan", AD-24), under the pills, so the pill tapped never moves.

const filterOptions: readonly FilterOption<RecipeFilter>[] = [
  { value: "all", label: "Alla" },
  { value: "favorites", label: "Favoriter" },
  { value: "cookable", label: "Kan lagas nu" },
];

/** Shown over the rows in Kan lagas nu when the pantry could not be read. */
const notRankedMessage = "Det gick inte att läsa lagret, så recepten är inte rangordnade.";

/** The most characters searchRecipes takes (recipeSearchSchema). */
const maxSearchChars = 100;

type Search =
  | { kind: "none" }
  | {
      kind: "done";
      query: string;
      results: RecipeListItem[];
      pantryUnavailable: boolean;
      /** The place the answer's status was counted against. */
      site: SelectedSite | null;
    }
  | { kind: "failed"; query: string; error: AppError };

export type LibraryProps = {
  recipes: RecipeListItem[];
  /** The pantry could not be read for `recipes` (listLibrary): no row has a status. */
  pantryUnavailable: boolean;
  /**
   * The place the status of `recipes` was counted against (listLibrary), for
   * the line "Lager: Stugan" in Kan lagas nu; `null` without a status.
   */
  site: SelectedSite | null;
  /** The catalog search for the preview of an AI suggestion; the page passes it (AD-1). */
  searchIngredients: SearchIngredients;
  /** The names of Pontus's places by id, for "Förslagen bygger på lagret för Hemma." (Story 12.4). */
  siteNames?: Readonly<Record<string, string>>;
  /** mealplan.addToCurrentPlan from the page (AD-1), for "Lägg på matsedeln" on suggestions from offers (Story 9.5). */
  addToPlan?: AddToPlan;
  /** suggestions.ownRecipesWithOffers (Story 16.3). */
  ownRecipes?: OwnRecipesRead;
  /** The ids of the recipes on the current meal plan, which "Ta bort" says (Story 13.2). */
  onMenuIds?: readonly string[];
  /** Planning mode (Story 13.8): the day recipes are put on. */
  planning?: PlanningTarget;
};

export function Library({ recipes, pantryUnavailable, site, searchIngredients, siteNames, addToPlan, ownRecipes, onMenuIds = [], planning }: LibraryProps) {
  const router = useRouter();
  const [filter, setFilter] = useRecipeFilter();
  // AI-förslag are of the place the server's list is counted against. They are in
  // Kan lagas nu, and a finished job is shown there and nowhere else.
  const dishes = useDishSuggestions(site?.id ?? null, { visible: filter === "cookable", siteNames });
  // A finished AI job that has not been shown is revealed (Story 12.4): when the
  // library opens with one, and when Pontus taps "Visa" in the confirmation for
  // it, the filter is set to Kan lagas nu, where the suggestions are.
  const handledReveals = useRef<number | null>(null);
  useEffect(() => {
    if (filter === null || !dishes.jobsLoaded) return;
    const first = handledReveals.current === null;
    const asked = !first && handledReveals.current !== dishes.reveals;
    handledReveals.current = dishes.reveals;
    if ((first || asked) && dishes.unseenResult && filter !== "cookable") setFilter("cookable");
  }, [filter, dishes.jobsLoaded, dishes.reveals, dishes.unseenResult, setFilter]);
  const [search, setSearch] = useState<Search>({ kind: "none" });
  const [busy, setBusy] = useState(false);
  const searchField = useRef<SearchFieldHandle>(null);
  /** Counts searches, so only the answer to the latest one is shown. */
  const latestSearch = useRef(0);

  async function runSearch(query: string) {
    const text = query.trim();
    const request = ++latestSearch.current;
    if (!text) {
      setBusy(false);
      setSearch({ kind: "none" });
      return;
    }
    setBusy(true);
    let result: Result<RecipeLibrary>;
    try {
      result = await searchLibrary(text);
    } catch {
      result = fail("recipe_search_failed");
    }
    if (request !== latestSearch.current) return;
    setBusy(false);
    if (result.ok) {
      setSearch({
        kind: "done",
        query: text,
        results: result.data.recipes,
        pantryUnavailable: result.data.pantryUnavailable,
        site: result.data.site,
      });
      return;
    }
    // An expired session: the page sends Pontus to sign in.
    if (result.error.code === "unauthorized") router.refresh();
    setSearch({ kind: "failed", query: text, error: result.error });
  }

  // The server's list is the latest word on every recipe it has (it is
  // rendered again after a heart is saved); a search answer fills in the rest.
  const byId = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);
  const shown = useMemo(
    () => (search.kind === "done" ? search.results.map((recipe) => byId.get(recipe.id) ?? recipe) : recipes),
    [search, byId, recipes],
  );
  const current = useMemo(() => Object.fromEntries(shown.map((recipe) => [recipe.id, recipe.isFavorite])), [shown]);
  const { favorites, setFavorite } = useFavorites(current);
  // A deleted recipe leaves the list at once, before the page's new list arrives.
  const [deleted, setDeleted] = useState<ReadonlySet<string>>(new Set());
  const { ask, dialog } = useRecipeDelete((id) => setDeleted((ids) => new Set(ids).add(id)));
  const visible = useMemo(
    () => (filter === null ? [] : filterRecipes(shown.filter((recipe) => !deleted.has(recipe.id)), filter, (recipe) => favorites[recipe.id] ?? recipe.isFavorite)),
    [shown, filter, favorites, deleted],
  );

  // Until the client has read the saved filter (hydration), skeleton rows
  // rather than a list that may be the wrong one.
  if (filter === null) return <Skeleton rows={4} />;

  const cookable = filter === "cookable";
  // The rows shown take the server list's status where it has the recipe and
  // the search answer's otherwise, so the statuses are missing only when
  // neither read the pantry (Story 2.4). Then Kan lagas nu cannot rank them:
  // they keep the usual order, and the notice says why. A row without a
  // status while the pantry was read is ranked last, without the notice.
  const statusUnavailable = pantryUnavailable && (search.kind !== "done" || search.pantryUnavailable);
  const notRanked = cookable && statusUnavailable && search.kind !== "failed" && visible.length > 0;
  // "Lager: Stugan", only in Kan lagas nu and with more than one place: the
  // search answer's place while its recipes are shown, else the server
  // list's. Never on no hits, a failed search, or without a status.
  let siteLine: string | null = null;
  if (cookable && search.kind === "done") {
    siteLine = search.results.length > 0 && !search.pantryUnavailable ? siteLineText(search.site) : null;
  } else if (cookable && search.kind === "none") {
    siteLine = pantryUnavailable ? null : siteLineText(site);
  }

  let content;
  if (search.kind === "failed") {
    // Only a failed search is worth trying again; invalid text fails every time.
    const retry = search.error.code === "recipe_search_failed";
    content = (
      <Notice
        role="alert"
        action={
          retry ? (
            <Button variant="text" onClick={() => runSearch(search.query)}>
              Försök igen
            </Button>
          ) : undefined
        }
      >
        {retry ? errorMessages.recipe_search_failed : search.error.message}
      </Notice>
    );
  } else if (visible.length > 0) {
    content = (
      <RecipeList
        recipes={visible}
        favorites={favorites}
        onFavoriteChange={setFavorite}
        onDelete={(recipe) => ask({ id: recipe.id, title: recipe.title, onMenu: onMenuIds.includes(recipe.id) })}
        ranked={cookable && !statusUnavailable}
        planning={planning}
        addToPlan={addToPlan}
      />
    );
  } else if (search.kind === "done") {
    content = (
      <EmptyState
        action={
          <Button variant="text" onClick={() => searchField.current?.clear()}>
            Visa alla recept
          </Button>
        }
      >
        Inga recept matchar.
      </EmptyState>
    );
  } else {
    content = <EmptyState>Inga favoriter än. Tryck på hjärtat på ett recept.</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-3">
      <SearchField
        ref={searchField}
        label="Sök recept"
        placeholder="Sök på titel eller ingrediens"
        maxLength={maxSearchChars}
        onSearch={runSearch}
      />
      <FilterPills label="Filter" options={filterOptions} value={filter} onChange={setFilter} />
      {/* Metadata, never announced: the badges are what changes. */}
      {siteLine ? (
        <p className="text-meta break-words text-ink-2" data-testid="site-line">
          {siteLine}
        </p>
      ) : null}
      {/* While a search is on its way, the current rows stay, dimmed. */}
      <div
        data-testid="library-results"
        aria-busy={busy}
        className={cx("motion-safe:transition-opacity", busy && "opacity-60")}
      >
        {/* Always there in Kan lagas nu, so the notice is read out when it appears. */}
        {cookable ? (
          <div role="status">{notRanked ? <Notice className="mb-3">{notRankedMessage}</Notice> : null}</div>
        ) : null}
        {content}
      </div>
      {/* No button after a failed search: the notice there is the way forward; a call on its
          way and the suggestions stay. AI-förslag are offered when the pantry could not be
          read too: the server reads it again. */}
      {cookable ? (
        <AiSuggestions
          dishes={dishes}
          searchIngredients={searchIngredients}
          offerButton={search.kind !== "failed"}
          addToPlan={addToPlan}
          ownRecipes={ownRecipes}
          planning={planning}
        />
      ) : null}
      {dialog}
    </div>
  );
}
