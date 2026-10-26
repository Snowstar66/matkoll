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
import { searchRecipes } from "../actions/search-recipes";
import { filterRecipes, type RecipeFilter, type RecipeListItem } from "../domain/recipe-list";
import { useRecipeFilter } from "./recipe-filter-store";
import { RecipeList } from "./recipe-list";
import { useFavorites } from "./use-favorites";

// Receptbiblioteket (FR-8, FR-9, UX-DR7): the search field, the filter pills
// Alla and Favoriter, and the recipe rows. The first list, every recipe newest
// first, comes from the server; a search asks searchRecipes for the matching
// recipes, and the filter is applied here, so switching pills needs no request
// and a heart that changes shows at once. Each row's status ("Kan lagas nu"
// or "Saknar N varor") comes with it from the server; the filter Kan lagas nu
// arrives in Epic 5.

const filterOptions: readonly FilterOption<RecipeFilter>[] = [
  { value: "all", label: "Alla" },
  { value: "favorites", label: "Favoriter" },
];

/** The most characters searchRecipes takes (recipeSearchSchema). */
const maxSearchChars = 100;

type Search =
  | { kind: "none" }
  | { kind: "done"; query: string; results: RecipeListItem[] }
  | { kind: "failed"; query: string; error: AppError };

export function Library({ recipes }: { recipes: RecipeListItem[] }) {
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
    let result: Result<RecipeListItem[]>;
    try {
      result = await searchRecipes(text);
    } catch {
      result = fail("recipe_search_failed");
    }
    if (request !== latestSearch.current) return;
    setBusy(false);
    if (result.ok) {
      setSearch({ kind: "done", query: text, results: result.data });
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

  // Until the client has read the saved filter (hydration), skeleton rows
  // rather than a list that may be the wrong one.
  if (filter === null) return <Skeleton rows={4} />;

  const visible = filterRecipes(shown, filter, (recipe) => favorites[recipe.id] ?? recipe.isFavorite);

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
    content = <RecipeList recipes={visible} favorites={favorites} onFavoriteChange={setFavorite} />;
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
        {content}
      </div>
    </div>
  );
}
