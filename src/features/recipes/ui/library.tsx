"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, use, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, buttonClasses } from "@/components/button";
import { cx } from "@/components/cx";
import { clearSearchText, EmptyState, noMatchText } from "@/components/empty-state";
import { Notice } from "@/components/notice";
import { SearchField, type SearchFieldHandle } from "@/components/search-field";
import { Skeleton } from "@/components/skeleton";
import { siteLineText, type SelectedSite } from "@/features/pantry";
import type { OfferTagData } from "@/lib/offer-tag";
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
import { searchShared, sharedCountText, type SharedListItem } from "../domain/shared-recipe";
import { useOption } from "@/lib/use-option";
import { OffersSheetControlContext } from "./offers-sheet-control";
import { useRecipeFilter } from "./recipe-filter-store";
import { RecipeBar } from "./recipe-bar";
import { NearlyCookable } from "./nearly-cookable";
import { RecipeFilterChips } from "./recipe-filter-chips";
import { RecipeCompactList } from "./recipe-compact-list";
import { RecipeList } from "./recipe-list";
import { RecipeSortSheet } from "./recipe-sort-sheet";
import { SharedRecipeCompactList, SharedRecipeList } from "./shared-recipe-list";
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
  /** The offers each recipe uses on a main ingredient, by recipe id (suggestions.recipeOfferTags), as OfferTag data (short name and price, UX-20). */
  tags: Readonly<Record<string, readonly OfferTagData[]>>;
  /** "Veckans erbjudanden från Maxi ICA, vecka 45" with the store when there is one; "Visa" follows it. */
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
  /** The ids of the recipes on the current meal plan, for the question before a swipe-away delete. */
  onMenuIds?: readonly string[];
  /** The filter to open with, from the address ("?filter=erbjudanden", "Visa alla" in Veckans erbjudanden); chosen once when it arrives. */
  initialFilter?: "offers";
  /**
   * Näring: the ids of the recipes that follow the kostråd (nutrition.assessKostrad, worked out by the
   * page with one nutrition read for the whole library), as a promise that is not waited for, so the
   * library never waits for it; `undefined` inside it when it could not be read. The chip Nyttigt needs
   * it and Tillval "Visa näring" on.
   */
  healthyIds?: Promise<readonly string[] | undefined>;
  /**
   * Delade recept: the recipes other households share (recipes.listSharedRecipes), as a promise
   * that is not waited for, so the own library never waits for it; `undefined` inside it when it
   * could not be read, and then the chip Delade goes. The chip is there with Tillval "Visa delade
   * recept" on; Delade chosen shows skeleton rows until the promise is in.
   */
  shared?: Promise<readonly SharedListItem[] | undefined>;
};

/** Waits for the page's promise of the shared recipes under Suspense; hands them on. */
function SharedLoader({
  promise,
  onLoaded,
}: {
  promise: Promise<readonly SharedListItem[] | undefined>;
  onLoaded: (loaded: { items: readonly SharedListItem[] | undefined }) => void;
}) {
  const items = use(promise);
  useEffect(() => onLoaded({ items }), [items, onLoaded]);
  return null;
}

/** Waits for the page's nutrition promise under Suspense, so only this renders late; hands the ids on. */
function HealthyLoader({ promise, onLoaded }: { promise: Promise<readonly string[] | undefined>; onLoaded: (ids: readonly string[] | undefined) => void }) {
  const ids = use(promise);
  useEffect(() => onLoaded(ids), [ids, onLoaded]);
  return null;
}

export function Library({ recipes, pantryUnavailable, site, offers, onMenuIds, initialFilter, healthyIds: healthyPromise, shared: sharedPromise }: LibraryProps) {
  const router = useRouter();
  const [filter, setFilter] = useRecipeFilter();
  // Delade (on by default; on the server and while hydrating the option is its default, so nothing jumps). The chip
  // stands while the shared recipes are on their way, and goes only when they could not be read.
  const [sharedLoaded, setSharedLoaded] = useState<{ items: readonly SharedListItem[] | undefined } | null>(null);
  const shared = sharedLoaded?.items;
  const sharedLoading = sharedPromise !== undefined && sharedLoaded === null;
  const withShared = useOption("showShared") && sharedPromise !== undefined && (sharedLoading || shared !== undefined);
  const onShared = filter === "shared" && withShared;
  /** The text searched for last, which Delade filters by here (its recipes are all in the page). */
  const [query, setQuery] = useState("");
  // Nyttigt is there only with "Visa näring" on (off on the server and while hydrating, so nothing jumps); a saved Nyttigt without it shows everything.
  const [healthyIds, setHealthyIds] = useState<readonly string[] | undefined>(undefined);
  const withHealthy = useOption("showNutrition") && healthyIds !== undefined;
  const healthySet = useMemo(() => new Set(healthyIds ?? []), [healthyIds]);
  const [view, setView] = useRecipeView();
  const [sort, setSort] = useRecipeSort();
  const [category, setCategory] = useRecipeCategory();
  const [sortOpen, setSortOpen] = useState(false);
  const [offersOpen, setOffersOpen] = useState(false);
  // "Visa alla": the filter the address asks for is chosen once, and the sheet it came from closes.
  const appliedFilter = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (initialFilter === undefined || appliedFilter.current === initialFilter) return;
    appliedFilter.current = initialFilter;
    setFilter(initialFilter);
    setOffersOpen(false);
  }, [initialFilter, setFilter]);
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
    setQuery(text);
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
  // Story 14.4: the categories any recipe has, counted over the whole library so the chips stay put while filtering
  // (in Delade, over the shared recipes).
  const availableCategories = useMemo(
    () => new Set((onShared ? (shared ?? []) : recipes).flatMap((recipe) => recipe.categories ?? [])),
    [recipes, shared, onShared],
  );
  // Delade: the shared recipes matching the search and the category, in the chosen order.
  const sharedVisible = useMemo(() => {
    if (!onShared || sort === undefined || category === undefined) return [];
    const found = searchShared(shared ?? [], query);
    const inSharedCategory = category === null ? found : filterByCategory(found, category);
    return sort === "newest" ? inSharedCategory : sortRecipes(inSharedCategory, sort);
  }, [onShared, shared, query, category, sort]);
  // The recipes in the category, before the pills, so an empty list can say which.
  const inCategory = useMemo(() => (category === undefined ? [] : filterByCategory(shown, category)), [shown, category]);
  const visible = useMemo(() => {
    if (filter === null || sort === undefined) return [];
    // The server's list and a search's answer are newest first already.
    const sorted = sort === "newest" ? inCategory : sortRecipes(inCategory, sort);
    // Story 9.3: Erbjudanden has its own order (most offers first, then fewest missing), whatever the sort.
    if (filter === "offers") return rankByOffers(inCategory, offers?.tags ?? {});
    const pill = (filter === "cookable" && statusUnavailable) || (filter === "healthy" && !withHealthy) ? "all" : filter;
    return filterRecipes(sorted, pill, (recipe) => favorites[recipe.id] ?? recipe.isFavorite, (recipe) => healthySet.has(recipe.id));
  }, [inCategory, filter, sort, statusUnavailable, favorites, offers?.tags, withHealthy, healthySet]);

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
  if (onShared) {
    if (sharedLoading) {
      content = <Skeleton rows={4} />;
    } else if (sharedVisible.length > 0) {
      content = compact ? <SharedRecipeCompactList recipes={sharedVisible} /> : <SharedRecipeList recipes={sharedVisible} />;
    } else if (query) {
      content = (
        <EmptyState
          action={
            <Button variant="text" onClick={() => searchField.current?.clear()}>
              {clearSearchText}
            </Button>
          }
        >
          {noMatchText(query)}
        </EmptyState>
      );
    } else if (category !== null && (shared?.length ?? 0) > 0) {
      content = (
        <EmptyState
          action={
            <Button variant="text" onClick={() => setCategory(null)}>
              Visa alla
            </Button>
          }
        >
          Inga delade recept i {recipeCategoryLabels[category]}.
        </EmptyState>
      );
    } else {
      content = <EmptyState>Inga delade recept än.</EmptyState>;
    }
  } else if (search.kind === "failed") {
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
      <RecipeCompactList recipes={visible} favorites={favorites} onFavoriteChange={setFavorite} ranked={ranked} offerTags={onOffers ? offers.tags : undefined} onMenuIds={onMenuIds} />
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
    // UX-16: one sentence and the next step, which lives on Matvaror.
    content = (
      <EmptyState
        action={
          <Link href="/hemma" className={buttonClasses("text")}>
            Vad kan jag laga nu?
          </Link>
        }
      >
        Inget kan lagas helt just nu.
      </EmptyState>
    );
  } else if (filter === "healthy" && withHealthy && search.kind === "none") {
    content = (
      <EmptyState
        action={
          <Button variant="text" onClick={() => (category !== null ? setCategory(null) : setFilter("all"))}>
            Visa alla
          </Button>
        }
      >
        {category !== null ? "Inga recept här följer kostråden än." : "Inga av recepten följer kostråden än."}
      </EmptyState>
    );
  } else if (search.kind === "done") {
    content = (
      <EmptyState
        action={
          <Button variant="text" onClick={() => searchField.current?.clear()}>
            {clearSearchText}
          </Button>
        }
      >
        {noMatchText(search.query)}
      </EmptyState>
    );
  } else {
    content = <EmptyState>Inga favoriter än. Tryck på hjärtat på ett recept.</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-3">
      {healthyPromise ? (
        <Suspense fallback={null}>
          <HealthyLoader promise={healthyPromise} onLoaded={setHealthyIds} />
        </Suspense>
      ) : null}
      {sharedPromise ? (
        <Suspense fallback={null}>
          <SharedLoader promise={sharedPromise} onLoaded={setSharedLoaded} />
        </Suspense>
      ) : null}
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
          withHealthy={withHealthy}
          withShared={withShared}
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
        <p className="text-meta break-words text-ink-2" data-testid="offers-line">
          {offers.line} {"\u00B7"}{" "}
          <button
            type="button"
            aria-label="Visa erbjudanden"
            onClick={() => setOffersOpen(true)}
            className="-my-3 inline-flex min-h-tap items-center align-middle font-medium text-accent underline underline-offset-2"
          >
            Visa
          </button>
        </p>
      ) : null}
      {onOffers ? (
        <div role="status" className="text-meta text-ink-2">
          {matching ? "Kopplar fler erbjudanden till dina varor …" : null}
        </div>
      ) : null}
      {onShared ? (
        <RecipeBar
          count={sharedVisible.length}
          countText={sharedCountText(sharedVisible.length)}
          sort={sort}
          onOpenSort={() => setSortOpen(true)}
          view={view}
          onViewChange={setView}
        />
      ) : search.kind !== "failed" ? (
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
      <RecipeSortSheet open={sortOpen} onClose={() => setSortOpen(false)} value={sort} onChange={setSort} withoutStatus={onShared} />
    </div>
  );
}
