"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/button";
import { cx } from "@/components/cx";
import { EmptyState } from "@/components/empty-state";
import { Notice } from "@/components/notice";
import { SearchField, type SearchFieldHandle } from "@/components/search-field";
import { Skeleton } from "@/components/skeleton";
import { siteLineText, type SelectedSite } from "@/features/pantry";
import { errorMessages, fail, type AppError, type Result } from "@/lib/errors";
import { searchLibrary } from "../actions/search-recipes";
import { recipeCategoryLabels } from "../domain/recipe-category";
import {
  filterByCategory,
  filterRecipes,
  nearlyCookable,
  rankByOffers,
  sortRecipes,
  type RecipeLibrary,
  type RecipeListItem,
} from "../domain/recipe-list";
import { OffersSheetControlContext } from "./offers-sheet-control";
import { useRecipeFilter } from "./recipe-filter-store";
import { RecipeBar } from "./recipe-bar";
import { NearlyCookable } from "./nearly-cookable";
import { RecipeFilterChips } from "./recipe-filter-chips";
import { RecipeCompactList } from "./recipe-compact-list";
import { RecipeList } from "./recipe-list";
import { RecipeSortSheet } from "./recipe-sort-sheet";
import { useRecipeCategory, useRecipeSort, useRecipeView } from "./recipe-view-stores";
import { useFavorites } from "./use-favorites";

// Receptbiblioteket (FR-8, FR-9, FR-22, UX-DR7): the search field, the filter
// pills Alla, Favoriter and Kan lagas nu, and the recipe rows. The first list,
// every recipe newest first, comes from the server; a search asks
// searchLibrary for the matching recipes, and the filter is applied here, so
// switching pills needs no request and a heart that changes shows at once.
// Each row's status ("Kan lagas nu" or "Saknar N varor") comes with it from
// the server; Kan lagas nu shows only the recipes with nothing missing, and a
// collapsed row "Nästan (N)" holds those missing one or two, without a request (the AI ideas are in Matsedel, Story 25.3). With more than
// one place, Kan lagas nu says which place the status is counted against
// ("Boende: Stugan", AD-24), under the pills, so the pill tapped never moves.
// Under them are the category chips (Story 1.17), and the line with the count,
// the sort and the switch between cards and the compact list (Story 1.16); the
// view, sort and category are kept on the device like the pill. They work
// together with the search and the pills: the category narrows the list, the
// sort orders it.

/** Shown over the rows in Kan lagas nu when the pantry could not be read. */
const notRankedMessage = "Det gick inte att läsa matvarorna, så recepten är inte rangordnade.";

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

/**
 * Story 9.3: the filter Erbjudanden. The page reads the offers of the user's stores
 * (the same as Inköpslista's, Story 9.13) and what each recipe uses, and passes the
 * sheet Veckans erbjudanden as an element that reads OffersSheetControlContext
 * (`open` and `onClose`), so the library never imports the offers module (AD-1).
 */
export type LibraryOffers = {
  /** The offers each recipe uses on a main ingredient, by recipe id (suggestions.recipeOfferTags), labels cleaned for a tag. */
  tags: Readonly<Record<string, readonly string[]>>;
  /** "Recept med veckans erbjudanden, vecka 45." with the store when there is one. */
  line: string;
  /** Whether any store has offers this week. */
  hasOffers: boolean;
  /** How many offers have no catalog ingredient yet (Story 9.10); more than 0 makes the filter ask the AI once. */
  unlinked: number;
  /** The sheet Veckans erbjudanden, opened by "Visa erbjudanden". */
  sheet: ReactNode;
  /** suggestions.matchOffersWithAi: links offers to ingredients with the AI (Story 9.10); `linked` more than 0 shows the new tags. */
  match?: () => Promise<Result<{ linked: number; open: number }>>;
};

export type LibraryProps = {
  recipes: RecipeListItem[];
  /** The pantry could not be read for `recipes` (listLibrary): no row has a status. */
  pantryUnavailable: boolean;
  /**
   * The place the status of `recipes` was counted against (listLibrary), for
   * the line "Boende: Stugan" in Kan lagas nu; `null` without a status.
   */
  site: SelectedSite | null;
  /** Story 9.3: the offers for the filter Erbjudanden; without it the filter is not offered. */
  offers?: LibraryOffers;
};

export function Library({ recipes, pantryUnavailable, site, offers }: LibraryProps) {
  const router = useRouter();
  const [filter, setFilter] = useRecipeFilter();
  const [view, setView] = useRecipeView();
  const [sort, setSort] = useRecipeSort();
  const [category, setCategory] = useRecipeCategory();
  const [sortOpen, setSortOpen] = useState(false);
  const [offersOpen, setOffersOpen] = useState(false);
  // Story 9.10: the first time Erbjudanden is shown with offers that have no ingredient, the AI links them (once per visit).
  const [matching, setMatching] = useState(false);
  const matchAsked = useRef(false);
  const matchOffers = offers?.match;
  const unlinked = offers?.unlinked ?? 0;
  useEffect(() => {
    if (filter !== "offers" || !matchOffers || unlinked === 0 || matchAsked.current) return;
    matchAsked.current = true;
    void (async () => {
      setMatching(true);
      try {
        const result = await matchOffers();
        if (result.ok && result.data.linked > 0) router.refresh();
      } catch {
        // The filter works without the AI: the offers stay as they were.
      }
      setMatching(false);
    })();
  }, [filter, matchOffers, unlinked, router]);
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
  // The statuses are missing only when neither the server list nor the search
  // answer read the pantry (Story 2.4); Kan lagas nu then shows every recipe
  // in the usual order, and a notice says why.
  const statusUnavailable = pantryUnavailable && (search.kind !== "done" || search.pantryUnavailable);
  // Story 14.4: the categories any recipe has, counted over the whole library so the chips stay put while filtering.
  const availableCategories = useMemo(() => new Set(recipes.flatMap((recipe) => recipe.categories ?? [])), [recipes]);
  // The recipes in the category, before the pills, so an empty list can say which.
  const inCategory = useMemo(() => (category === undefined ? [] : filterByCategory(shown, category)), [shown, category]);
  const visible = useMemo(() => {
    if (filter === null || sort === undefined) return [];
    // The server's list and a search's answer are newest first already.
    const sorted = sort === "newest" ? inCategory : sortRecipes(inCategory, sort);
    // Story 9.3: Erbjudanden has its own order (most offers first, then fewest missing), whatever the sort.
    if (filter === "offers") return rankByOffers(inCategory, offers?.tags ?? {});
    const pill = filter === "cookable" && statusUnavailable ? "all" : filter;
    return filterRecipes(sorted, pill, (recipe) => favorites[recipe.id] ?? recipe.isFavorite);
  }, [inCategory, filter, sort, statusUnavailable, favorites, offers?.tags]);

  // Until the client has read the saved choices (hydration), skeleton rows
  // rather than a list that may be the wrong one.
  if (filter === null || view === undefined || sort === undefined || category === undefined) return <Skeleton rows={4} />;

  const cookable = filter === "cookable";
  const onOffers = filter === "offers" && offers !== undefined;
  const compact = view === "compact";
  const notRanked = cookable && statusUnavailable && search.kind !== "failed" && visible.length > 0;
  // Missing one or two items, under "Nästan (N)"; only with a status.
  const nearly = cookable && !statusUnavailable && search.kind !== "failed" ? nearlyCookable(inCategory) : [];
  // "Boende: Stugan", only in Kan lagas nu and with more than one place: the
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
    const ranked = false;
    content = compact ? (
      <RecipeCompactList recipes={visible} favorites={favorites} onFavoriteChange={setFavorite} ranked={ranked} offerTags={onOffers ? offers.tags : undefined} />
    ) : (
      <RecipeList
        recipes={visible}
        favorites={favorites}
        onFavoriteChange={setFavorite}
        ranked={ranked}
        offerTags={onOffers ? offers.tags : undefined}
      />
    );
  } else if (onOffers && search.kind === "none" && category === null) {
    // Story 9.3: no offers fetched, or none that a recipe uses on a main ingredient.
    content = (
      <EmptyState
        action={
          <Button variant="text" onClick={() => setOffersOpen(true)}>
            Visa erbjudanden
          </Button>
        }
      >
        {offers.hasOffers ? "Inga av dina recept använder veckans erbjudanden." : "Inga erbjudanden hämtade än. Hämta dem i arket."}
      </EmptyState>
    );
  } else if (category !== null && inCategory.length === 0 && shown.length > 0) {
    content = (
      <EmptyState
        action={
          <Button variant="text" onClick={() => setCategory(null)}>
            Visa alla
          </Button>
        }
      >
        Inga recept i {recipeCategoryLabels[category]}.
      </EmptyState>
    );
  } else if (cookable && !statusUnavailable && inCategory.length > 0) {
    content = <EmptyState>Inget kan lagas helt just nu.</EmptyState>;
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
      {/* Story 19.6: on a desktop the search (360 px) and the filter chips share a row. */}
      <div className="flex flex-col gap-3 desktop:flex-row desktop:items-center desktop:gap-4">
        <div className="desktop:w-[360px] desktop:shrink-0">
        <SearchField
          ref={searchField}
          label="Sök recept"
          placeholder="Sök på titel eller ingrediens"
          maxLength={maxSearchChars}
          onSearch={runSearch}
        />
        </div>
        <div className="min-w-0 desktop:flex-1 desktop:[&>div]:mx-0 desktop:[&>div]:px-0 desktop:[&>div]:[mask-image:linear-gradient(90deg,#000_92%,transparent)]">
        <RecipeFilterChips
          filter={filter}
          onFilterChange={setFilter}
          category={category}
          onCategoryChange={setCategory}
          available={availableCategories}
          withOffers={offers !== undefined}
        />
        </div>
      </div>
      {/* Metadata, never announced: the badges are what changes. */}
      {siteLine ? (
        <p className="text-meta break-words text-ink-2" data-testid="site-line">
          {siteLine}
        </p>
      ) : null}
      {onOffers ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3" data-testid="offers-line">
          <p className="min-w-0 text-meta break-words text-ink-2">{offers.line}</p>
          <Button variant="text" onClick={() => setOffersOpen(true)}>
            Visa erbjudanden
          </Button>
        </div>
      ) : null}
      {onOffers ? (
        <div role="status" className="text-meta text-ink-2">
          {matching ? "Kopplar fler erbjudanden till dina varor …" : null}
        </div>
      ) : null}
      {search.kind !== "failed" ? (
        <RecipeBar
          count={visible.length}
          sort={sort}
          onOpenSort={() => setSortOpen(true)}
          view={view}
          onViewChange={setView}
        />
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
        {nearly.length > 0 ? <NearlyCookable recipes={nearly} /> : null}
      </div>
      {offers ? (
        <OffersSheetControlContext.Provider value={{ open: offersOpen, onClose: () => setOffersOpen(false) }}>{offers.sheet}</OffersSheetControlContext.Provider>
      ) : null}
      <RecipeSortSheet open={sortOpen} onClose={() => setSortOpen(false)} value={sort} onChange={setSort} />
    </div>
  );
}
