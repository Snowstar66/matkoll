"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, type MouseEvent, type ReactNode, useContext, useId, useRef, useState } from "react";
import { StatusBadge } from "@/components/badges";
import { Button, buttonClasses } from "@/components/button";
import { FieldLabel, inputClasses } from "@/components/field";
import { cx } from "@/components/cx";
import { EmptyState } from "@/components/empty-state";
import { PlusIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { RecipeImage } from "@/components/recipe-image";
import { SearchField } from "@/components/search-field";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { recipeStatusText } from "@/features/pantry";
import { recipeMetaText, type RecipeListItem } from "@/features/recipes";
import { errorMessages, fail, type AppError, type Result } from "@/lib/errors";
import { addToCurrentPlan } from "../actions/add-to-current-plan";
import { defaultWeekday, todayWeekday, weekdayNames, weekdays, addedOnDayText } from "../domain/meal-plan";
import { planningHref } from "../domain/planning";
import { currentWeekStart } from "../domain/week";

// Lägg till rätt (FR-13, Flöde 2): the sheet with the favourites first and a
// search of the library under them. A tap on a recipe adds it to the current
// meal plan with its own servings and closes the sheet, so a favourite is on
// the plan after two taps (SM-4). "+" in Matsedel's header and "Lägg till
// rätt" in the empty plan open the same sheet (AddDishProvider).

/** recipes.searchRecipes, passed down by the page (AD-1). */
export type SearchRecipes = (query: string) => Promise<Result<RecipeListItem[]>>;

/** The most characters searchRecipes takes (recipeSearchSchema). */
const maxSearchChars = 100;

type Search =
  | { kind: "none" }
  | { kind: "done"; query: string; results: RecipeListItem[] }
  | { kind: "failed"; query: string; error: AppError };

type AddDishContentProps = {
  /** `null` when the library could not be read. */
  recipes: readonly RecipeListItem[] | null;
  searchRecipes: SearchRecipes;
  /** The day the sheet starts on: a day tapped in the week view, else the first free day from today, or `null`. */
  startDay: number | null;
  /** The Monday of the week the dish goes to (Story 13.7); left out, this week. */
  weekStart?: string;
  /** The dish is on the plan, on `weekday` (`null`: no day). */
  onAdded: (weekday: number | null) => void;
  /** Whether a dish is being added; the sheet does not close meanwhile. */
  onBusyChange: (busy: boolean) => void;
};

function AddDishContent({ recipes, searchRecipes, startDay, weekStart, onAdded, onBusyChange }: AddDishContentProps) {
  const dayId = useId();
  const [day, setDay] = useState<number | null>(startDay);
  const router = useRouter();
  const [search, setSearch] = useState<Search>({ kind: "none" });
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Counts searches, so only the answer to the latest one is shown. */
  const latestSearch = useRef(0);
  /**
   * The dish id for the recipe being added, made once per tap on a recipe
   * and kept until it is added, so trying again after a lost answer never
   * adds the dish twice.
   */
  const intent = useRef<{ recipeId: string; id: string } | null>(null);

  async function runSearch(query: string) {
    const text = query.trim();
    const request = ++latestSearch.current;
    if (!text) {
      setSearching(false);
      setSearch({ kind: "none" });
      return;
    }
    setSearching(true);
    let result: Result<RecipeListItem[]>;
    try {
      result = await searchRecipes(text);
    } catch {
      result = fail("recipe_search_failed");
    }
    if (request !== latestSearch.current) return;
    setSearching(false);
    if (result.ok) {
      setSearch({ kind: "done", query: text, results: result.data });
      return;
    }
    if (result.error.code === "unauthorized") router.refresh();
    setSearch({ kind: "failed", query: text, error: result.error });
  }

  async function add(recipe: RecipeListItem) {
    if (adding) return;
    setAdding(true);
    onBusyChange(true);
    setError(null);
    if (intent.current?.recipeId !== recipe.id) intent.current = { recipeId: recipe.id, id: crypto.randomUUID() };
    let result: Result<unknown>;
    try {
      result = await addToCurrentPlan({ recipeId: recipe.id, id: intent.current.id, weekday: day, ...(weekStart ? { weekStart } : {}) });
    } catch {
      // No answer (e.g. no connection): nothing is known to be added.
      result = fail("mealplan_add_failed");
    }
    setAdding(false);
    onBusyChange(false);
    if (result.ok) {
      intent.current = null;
      onAdded(day);
      return;
    }
    if (result.error.code === "unauthorized") router.refresh();
    setError(result.error.message);
  }

  if (recipes === null) {
    return <Notice role="alert">{errorMessages.mealplan_recipes_unavailable}</Notice>;
  }
  if (recipes.length === 0) {
    return <EmptyState>Inga recept än. Importera ett recept under Recept först.</EmptyState>;
  }

  const favorites = recipes.filter((recipe) => recipe.isFavorite);
  let results: ReactNode;
  if (search.kind === "failed") {
    const retry = search.error.code === "recipe_search_failed";
    results = (
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
  } else if (search.kind === "done") {
    results =
      search.results.length > 0 ? (
        <DishChoices label="Sökresultat" recipes={search.results} onChoose={add} />
      ) : (
        <p className="py-4 text-center text-body text-ink-2">Inga recept matchar.</p>
      );
  } else {
    const others = recipes.filter((recipe) => !recipe.isFavorite);
    results = others.length > 0 ? <DishChoices label="Övriga recept" recipes={others} onChoose={add} /> : null;
  }

  return (
    <div
      aria-busy={adding}
      inert={adding}
      className={cx("flex flex-col gap-5 motion-safe:transition-opacity", adding && "opacity-60")}
    >
      {error ? <Notice role="alert">{error}</Notice> : null}
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={dayId}>Dag</FieldLabel>
        <select
          id={dayId}
          value={day === null ? "none" : String(day)}
          onChange={(event) => setDay(event.target.value === "none" ? null : Number(event.target.value))}
          className={inputClasses}
        >
          {weekdays.map((weekday) => (
            <option key={weekday} value={weekday}>
              {weekdayNames[weekday - 1]}
            </option>
          ))}
          <option value="none">Ingen dag</option>
        </select>
        {/* Story 13.8: pick the recipe in Recept instead, which then adds it to this day. */}
        {day !== null ? (
          <Link
            href={planningHref(weekStart ?? currentWeekStart(), day)}
            data-testid="pick-recipe"
            className={buttonClasses("secondary", true)}
          >
            Välj recept
          </Link>
        ) : null}
      </div>
      {favorites.length > 0 ? <DishChoices label="Favoriter" recipes={favorites} onChoose={add} /> : null}
      <div className="flex flex-col gap-3">
        <SearchField
          label="Sök recept"
          placeholder="Sök på titel eller ingrediens"
          maxLength={maxSearchChars}
          onSearch={runSearch}
          className="bg-bg"
        />
        <div
          data-testid="dish-search-results"
          aria-busy={searching}
          className={cx("motion-safe:transition-opacity", searching && "opacity-60")}
        >
          {results}
        </div>
      </div>
    </div>
  );
}

/** A titled list of recipes, each a button that adds it to the plan. */
function DishChoices({
  label,
  recipes,
  onChoose,
}: {
  label: string;
  recipes: readonly RecipeListItem[];
  onChoose: (recipe: RecipeListItem) => void;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <h3 id={headingId} className="text-section-label text-ink-2">
        {label}
      </h3>
      <ul className="flex flex-col">
        {recipes.map((recipe) => (
          <li key={recipe.id} className="border-t border-hairline first:border-t-0">
            <button
              type="button"
              data-testid="dish-choice"
              onClick={() => onChoose(recipe)}
              className="flex w-full items-center gap-[14px] rounded-md py-2 text-left"
            >
              <RecipeImage src={recipe.imageUrl} iconSize={28} className="size-thumb shrink-0 rounded-md" />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="line-clamp-2 text-row-title break-words text-ink">{recipe.title}</span>
                <span className="text-meta text-ink-3">
                  {recipeMetaText(recipe.totalMinutes, recipe.originalServings)}
                </span>
                {recipe.missingCount !== null ? (
                  <StatusBadge status={recipe.missingCount === 0 ? "ok" : "missing"}>
                    {recipeStatusText(recipe.missingCount)}
                  </StatusBadge>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

type AddDishApi = {
  /** Opens the sheet Lägg till rätt, on `weekday` when given (a tapped empty day). */
  open: (weekday?: number) => void;
};

const AddDishContext = createContext<AddDishApi | null>(null);

/** Opens the sheet Lägg till rätt; needs an AddDishProvider above. */
export function useAddDish(): AddDishApi {
  const api = useContext(AddDishContext);
  if (!api) throw new Error("useAddDish needs an AddDishProvider");
  return api;
}

export type AddDishProviderProps = {
  /**
   * The whole library, newest first, with each recipe's status
   * (recipes.listRecipes), or `null` when it could not be read: the sheet
   * says so, and the plan is shown all the same.
   */
  recipes: readonly RecipeListItem[] | null;
  searchRecipes: SearchRecipes;
  /** The days (1–7, `null` for none) the plan's dishes lie on, for the sheet's first choice of day (Story 13.5). */
  plannedDays?: readonly (number | null)[];
  /** The Monday of the week shown (Story 13.7): dishes are added to it. Left out, this week. */
  weekStart?: string;
  children: ReactNode;
};

/**
 * Holds the sheet Lägg till rätt for Matsedel, so "+" in the header and "Lägg
 * till rätt" in the empty plan open the same sheet. After a dish is added
 * the sheet closes and a short confirmation says "Lagt på matsedeln."; the
 * action revalidated Matsedel, so the dish is on the plan behind it. Needs a
 * ToastProvider above.
 */
export function AddDishProvider({ recipes, searchRecipes, plannedDays = [], weekStart, children }: AddDishProviderProps) {
  /** The day the sheet starts on, set when it opens. */
  const [startDay, setStartDay] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  /** Counts openings: the sheet starts afresh each time, without the last search or error. */
  const [session, setSession] = useState(0);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();
  const api: AddDishApi = {
    open: (weekday) => {
      // A coming week starts on its first free day from Monday; this week from today.
      const from = weekStart && weekStart !== currentWeekStart() ? 1 : todayWeekday(new Date());
      setStartDay(weekday ?? defaultWeekday(plannedDays.map((day) => ({ weekday: day })), from));
      setSession((current) => current + 1);
      setOpen(true);
    },
  };
  return (
    <AddDishContext.Provider value={api}>
      {children}
      <Sheet open={open} onClose={() => setOpen(false)} title="Lägg till rätt" closeLabel="Klar" preventClose={busy}>
        <AddDishContent
          key={session}
          recipes={recipes}
          searchRecipes={searchRecipes}
          onBusyChange={setBusy}
          startDay={startDay}
          weekStart={weekStart}
          onAdded={(weekday) => {
            setOpen(false);
            showToast(addedOnDayText(weekday));
          }}
        />
      </Sheet>
    </AddDishContext.Provider>
  );
}

/**
 * Opens Lägg till rätt: the round "+" for the page header, or a primary
 * button (`fullWidth` under the dishes). The button takes focus first, since
 * Safari does not focus a tapped button: the sheet gives focus back to what
 * had it when it opened, so it returns to the button that opened it.
 */
export function AddDishButton({ variant, fullWidth = false }: { variant: "icon" | "primary"; fullWidth?: boolean }) {
  const { open: openSheet } = useAddDish();
  const open = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.focus();
    openSheet(undefined);
  };
  if (variant === "icon") {
    return (
      <button
        type="button"
        aria-label="Lägg till rätt"
        onClick={open}
        className="flex size-tap items-center justify-center rounded-full text-accent"
      >
        <PlusIcon size={26} />
      </button>
    );
  }
  return (
    <Button onClick={open} fullWidth={fullWidth}>
      Lägg till rätt
    </Button>
  );
}
