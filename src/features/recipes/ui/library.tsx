"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/button";
import { cx } from "@/components/cx";
import { EmptyState } from "@/components/empty-state";
import { FilterPills, type FilterOption } from "@/components/filter-pills";
import { Notice } from "@/components/notice";
import { SearchField, type SearchFieldHandle } from "@/components/search-field";
import { Skeleton } from "@/components/skeleton";
import { errorMessages, fail, type AppError, type Result } from "@/lib/errors";
import { searchLibrary } from "../actions/search-recipes";
import { filterRecipes, type RecipeFilter, type RecipeLibrary, type RecipeListItem } from "../domain/recipe-list";
import { AiSuggestions } from "./ai-suggestions";
import { useRecipeFilter } from "./recipe-filter-store";
import { RecipeList } from "./recipe-list";
import { useFavorites } from "./use-favorites";

// Receptbiblioteket (FR-8, FR-9, FR-22, UX-DR7): the search field, the filter
// pills Alla, Favoriter and Kan lagas nu, and the recipe rows. The first list,
// every recipe newest first, comes from the server; a search asks
// searchLibrary for the matching recipes, and the filter is applied here, so
// switching pills needs no request and a heart that changes shows at once.
// Each row's status ("Kan lagas nu" or "Saknar N varor") comes with it from
// the server; Kan lagas nu ranks the rows by it (fewest missing first) without
// a request, and has "Föreslå rätter med AI" at the bottom (AiSuggestions).

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
  | { kind: "done"; query: string; results: RecipeListItem[]; pantryUnavailable: boolean }
  | { kind: "failed"; query: string; error: AppError };

export type LibraryProps = {
  recipes: RecipeListItem[];
  /** The pantry could not be read for `recipes` (listLibrary): no row has a status. */
  pantryUnavailable: boolean;
  /** Asks the AI for dishes (Story 5.2); until then "Föreslå rätter med AI" is not shown. */
  onSuggestDishes?: () => void;
};

export function Library({ recipes, pantryUnavailable, onSuggestDishes }: LibraryProps) {
  const router = useRouter();
  const [filter, setFilter] = useRecipeFilter();
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
  const visible = useMemo(
    () => (filter === null ? [] : filterRecipes(shown, filter, (recipe) => favorites[recipe.id] ?? recipe.isFavorite)),
    [shown, filter, favorites],
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
        ranked={cookable && !statusUnavailable}
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
      {/* Not after a failed search: the notice there is the way forward. */}
      {cookable && search.kind !== "failed" ? <AiSuggestions onSuggest={onSuggestDishes} /> : null}
    </div>
  );
}
