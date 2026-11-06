"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useRef, useState } from "react";
import { Chip } from "@/components/chip";
import { CloseIcon } from "@/components/icons";
import { FixedAction } from "@/components/fixed-action";
import { buttonClasses } from "@/components/button";
import { useToast } from "@/components/toast";
import { errorMessages, fail, type Result } from "@/lib/errors";
import { optionsForTab, onWeekIds, type PlanOption, type PlanTab } from "@/features/suggestions";
import { addToCurrentPlan } from "../actions/add-to-current-plan";
import { removePlanRecipe } from "../actions/remove-plan-recipe";
import { restorePlanRecipe } from "../actions/restore-plan-recipe";
import { setServings } from "../actions/set-servings";
import { setWeekday } from "../actions/set-weekday";
import {
  clampServings,
  movedText,
  removedDishesText,
  type PlanDish,
  type PlanRecipeRow,
  type ServingsChange,
  type WeekdayChange,
} from "../domain/meal-plan";
import { addedToWeekText, changeDayLabel, dayChipText, dishFromRow, dishNoteText, onWeekLabel, shownDishes, weekBarText } from "../domain/planner";
import { weekQuery } from "../domain/week";
import { MoveToDaySheet } from "./move-to-day-sheet";
import { PlanRow } from "./plan-row";

// Matsedel as the place to plan the week (Story 25.3): "Veckans rätter" (what
// is chosen: day chip, ✕, a tap opens the recipe) and "Lägg till rätter" with
// Favoriter, På erbjudande and Alla recept. "+" puts a dish on the first free day
// and says what it adds to the list, with "Byt dag". The pantry never
// ranks the rows; it only lowers what is left to buy, in the bar at the bottom.

const tabs: { value: PlanTab; label: string }[] = [
  { value: "favorites", label: "Favoriter" },
  { value: "offers", label: "På erbjudande" },
  { value: "all", label: "Alla recept" },
];

const emptyText: Record<PlanTab, string> = {
  favorites: "Inga favoriter än. Tryck på hjärtat på ett recept.",
  offers: "Inget av dina recept har en huvudvara på erbjudande just nu.",
  all: "Inga recept än. Lägg till ett i Recept.",
};

export type WeekPlannerProps = {
  /** The Monday of the week shown. */
  weekStart: string;
  /** The week's dishes. */
  dishes: readonly PlanDish[];
  /** The library as rows, or `null` when it could not be read. */
  options: readonly PlanOption[] | null;
  /** How many items the week's dishes still need, or `null` when it could not be counted. */
  toBuy: number | null;
  /** Under the rows of På erbjudande: "Hittar du inget? Få 2 nya idéer med erbjudandena" and the ideas. */
  offersFooter?: ReactNode;
};

export function WeekPlanner({ weekStart, dishes, options, toBuy, offersFooter }: WeekPlannerProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const hasFavorites = options?.some((option) => option.isFavorite) ?? false;
  const [tab, setTab] = useState<PlanTab>(hasFavorites ? "favorites" : "all");
  /** Dishes just removed, until the plan is read again; "Ångra" takes them off. */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  /** Dishes just added, until the plan is read again. */
  const [added, setAdded] = useState<readonly PlanDish[]>([]);
  /** Days just chosen, until the plan is read again. */
  const [days, setDays] = useState<Readonly<Record<string, number | null>>>({});
  /** Portions just chosen, until the plan is read again. */
  const [portions, setPortions] = useState<Readonly<Record<string, number>>>({});
  const [dayFor, setDayFor] = useState<string | null>(null);
  /** The recipes whose "+" is on its way. */
  const [adding, setAdding] = useState<ReadonlySet<string>>(new Set());
  /** The dish id of a tap on its way, kept until it is added, so a retry after a lost answer adds one dish. */
  const dishIds = useRef(new Map<string, string>());

  const shown = shownDishes(dishes, hidden, added, days);
  const byId = new Map((options ?? []).map((option) => [option.id, option]));
  const onWeek = onWeekIds(shown);
  /** The day of each recipe already on the week (the first with one). */
  const onWeekDay = new Map<string, number | null>();
  for (const dish of shown) if (dish.recipeId && !onWeekDay.get(dish.recipeId)) onWeekDay.set(dish.recipeId, dish.weekday ?? null);
  const rows = optionsForTab(options ?? [], tab);

  function failed(error: { code: string; message: string }) {
    if (error.code === "unauthorized") router.refresh();
    else showToast(error.message, { role: "alert" });
  }

  async function add(option: PlanOption) {
    if (adding.has(option.id)) return;
    setAdding((current) => new Set(current).add(option.id));
    const id = dishIds.current.get(option.id) ?? crypto.randomUUID();
    dishIds.current.set(option.id, id);
    let result: Result<PlanRecipeRow>;
    try {
      // No day sent: the server puts the dish on the week's first free day.
      result = await addToCurrentPlan({ recipeId: option.id, servings: clampServings(option.servings), id, weekStart });
    } catch {
      result = fail("mealplan_add_failed");
    }
    setAdding((current) => {
      const next = new Set(current);
      next.delete(option.id);
      return next;
    });
    if (!result.ok) {
      failed(result.error);
      return;
    }
    dishIds.current.delete(option.id);
    const row = result.data;
    setAdded((current) => [...current, dishFromRow(row)]);
    showToast(addedToWeekText(option.title, option.buy, row.weekday ?? null), {
      show: { label: changeDayLabel(row.weekday), onShow: () => setDayFor(row.id) },
    });
    router.refresh();
  }

  async function remove(dish: PlanDish) {
    setHidden((current) => new Set(current).add(dish.id));
    let result: Result<PlanRecipeRow>;
    try {
      result = await removePlanRecipe(dish.id);
    } catch {
      result = fail("mealplan_remove_failed");
    }
    if (!result.ok) {
      setHidden((current) => {
        const next = new Set(current);
        next.delete(dish.id);
        return next;
      });
      failed(result.error);
      return;
    }
    const row = result.data;
    showToast(removedDishesText([dish.recipeTitle]), { onUndo: () => void restore(dish, row) });
    router.refresh();
  }

  async function restore(dish: PlanDish, row: PlanRecipeRow) {
    let result: Result<PlanRecipeRow>;
    try {
      result = await restorePlanRecipe(row);
    } catch {
      result = fail("mealplan_restore_failed");
    }
    if (!result.ok) {
      failed(result.error);
      return;
    }
    setHidden((current) => {
      const next = new Set(current);
      next.delete(dish.id);
      return next;
    });
    // The server's plan may not have the dish yet: it is shown from here until it does.
    setAdded((current) => (current.some((other) => other.id === dish.id) ? current : [...current, dishFromRow(result.data)]));
    router.refresh();
  }

  async function changeServings(dish: PlanDish, value: number) {
    setPortions((current) => ({ ...current, [dish.id]: value }));
    let result: Result<ServingsChange>;
    try {
      // Server Actions of one page run one after the other, so the last tap is the one that stays.
      result = await setServings({ id: dish.id, servings: value });
    } catch {
      result = fail("mealplan_servings_failed");
    }
    if (!result.ok) {
      setPortions((current) => {
        const next = { ...current };
        delete next[dish.id];
        return next;
      });
      failed(result.error);
      return;
    }
    router.refresh();
  }

  async function moveTo(dish: PlanDish, weekday: number | null) {
    setDays((current) => ({ ...current, [dish.id]: weekday }));
    let result: Result<WeekdayChange>;
    try {
      result = await setWeekday({ id: dish.id, weekday });
    } catch {
      result = fail("mealplan_weekday_failed");
    }
    if (!result.ok) {
      setDays((current) => {
        const next = { ...current };
        delete next[dish.id];
        return next;
      });
      failed(result.error);
      return;
    }
    showToast(movedText(dish.recipeTitle, weekday));
    router.refresh();
  }

  const dayDish = shown.find((dish) => dish.id === dayFor) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="week-dishes-heading" className="flex flex-col gap-2">
        <h2 id="week-dishes-heading" className="text-section-title text-ink">
          Veckans rätter
        </h2>
        {shown.length === 0 ? (
          <p data-testid="week-empty" className="rounded-lg bg-surface px-3.5 py-4 text-body text-ink-2">
            Inga rätter än. Välj bland dina recept här under.
          </p>
        ) : (
          <ul aria-label="Veckans rätter" className="overflow-hidden rounded-lg bg-surface">
            {shown.map((dish) => (
              <li key={dish.id} data-testid="plan-dish" data-dish={dish.id} className="flex items-center gap-2 border-t border-hairline py-2 pr-1 pl-3.5 first:border-t-0">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  {dish.recipeId ? (
                    <Link href={`/recept/${dish.recipeId}`} className="line-clamp-2 self-start wrap-break-word text-row-title text-ink">
                      {dish.recipeTitle}
                    </Link>
                  ) : (
                    <p className="line-clamp-2 wrap-break-word text-row-title text-ink">{dish.recipeTitle}</p>
                  )}
                  <p data-testid="dish-note" className="text-meta text-ink-2">
                    {dish.recipeId ? dishNoteText(byId.get(dish.recipeId)) : "Borttaget recept"}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="dish-day"
                  onClick={() => setDayFor(dish.id)}
                  aria-label={`Välj dag för ${dish.recipeTitle}, nu ${dayChipText(dish.weekday).toLowerCase()}`}
                  className={`min-h-9 shrink-0 rounded-pill px-2.5 text-control font-semibold ${dish.weekday ? "bg-mint text-mint-ink" : "bg-bg text-ink-3"}`}
                >
                  {dayChipText(dish.weekday)}
                </button>
                <button
                  type="button"
                  data-testid="dish-remove"
                  onClick={() => void remove(dish)}
                  aria-label={`Ta bort ${dish.recipeTitle}`}
                  className="flex size-tap shrink-0 items-center justify-center rounded-full text-ink-3"
                >
                  <CloseIcon size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="add-dishes-heading" className="flex flex-col gap-2.5">
        <h2 id="add-dishes-heading" className="text-section-title text-ink">
          Lägg till rätter
        </h2>
        {options === null ? (
          <p role="alert" className="rounded-lg bg-surface px-3.5 py-4 text-body text-ink-2">
            {errorMessages.mealplan_recipes_unavailable}
          </p>
        ) : (
          <>
            <div role="radiogroup" aria-label="Rätter att lägga till" className="-mx-page flex gap-2 overflow-x-auto px-page">
              {tabs.map(({ value, label }) => (
                <Chip key={value} role="radio" aria-checked={tab === value} selected={tab === value} onClick={() => setTab(value)}>
                  {label}
                </Chip>
              ))}
            </div>
            {tab === "offers" ? (
              <p data-testid="offers-hint" className="text-meta text-deal-ink">
                Förslag för att varorna har extrapris den här veckan.
              </p>
            ) : null}
            {rows.length === 0 ? (
              <p data-testid="options-empty" className="text-body text-ink-2">
                {emptyText[tab]}
              </p>
            ) : (
              <ul aria-label={tabs.find((candidate) => candidate.value === tab)?.label} className="flex flex-col gap-2">
                {rows.map((option) => (
                  <PlanRow
                    key={option.id}
                    title={option.title}
                    imageUrl={option.imageUrl}
                    meta={option.meta}
                    deal={option.deal?.text ?? null}
                    onWeekLabel={onWeek.has(option.id) ? onWeekLabel(onWeekDay.get(option.id)) : undefined}
                    onAdd={() => void add(option)}
                    disabled={adding.has(option.id)}
                  />
                ))}
              </ul>
            )}
            {/* Mounted while the tab is not shown, so the ideas and their job stay when the tab changes. */}
            {offersFooter ? <div hidden={tab !== "offers"}>{offersFooter}</div> : null}
          </>
        )}
      </section>

      <MoveToDaySheet
        open={dayDish !== null}
        onClose={() => setDayFor(null)}
        title={dayDish?.recipeTitle ?? ""}
        weekday={dayDish?.weekday ?? null}
        onMove={(weekday) => dayDish && void moveTo(dayDish, weekday)}
        servings={dayDish ? { value: portions[dayDish.id] ?? dayDish.servings, onChange: (value) => void changeServings(dayDish, value) } : undefined}
      />

      <FixedAction glass>
        <div data-testid="week-bar" className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <p data-testid="week-bar-count" className="text-row-title text-ink">
              {weekBarText(shown.length, toBuy)}
            </p>
            <p className="text-meta text-ink-2">Det du har hemma räknas bort.</p>
          </div>
          <Link href={`/lista${weekQuery(weekStart)}`} className={`${buttonClasses("primary")} shrink-0`}>
            Inköpslistan
          </Link>
        </div>
      </FixedAction>
    </div>
  );
}
