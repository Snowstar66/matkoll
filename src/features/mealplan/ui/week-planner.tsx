"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useRef, useState, useSyncExternalStore } from "react";
import { Chip } from "@/components/chip";
import { ChevronDownIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { focusAfterRemoval, TrashButton } from "@/components/trash-button";
import { errorMessages, fail, type Result } from "@/lib/errors";
import { optionsForTab, type PlanOption, type PlanTab } from "@/features/suggestions";
import { weekdayShortName, weekdayWord } from "../domain/meal-plan";
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
import { addedToWeekText, calendarRows, changeDayLabel, dayChipText, dishFromRow, dishNoteText, notOnWeek, shownDishes, targetDayText, weekBarText } from "../domain/planner";
import { weekdayDateText } from "../domain/week";
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

/** Remembers per viewer whether the library panel was opened; the panel is collapsed until then. */
const openKey = "matkoll.mealplan.library-open";

function readStoredOpen(): boolean {
  try {
    return window.localStorage.getItem(openKey) === "1";
  } catch {
    return false;
  }
}

function subscribeToStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

const emptyText: Record<PlanTab, string> = {
  favorites: "Inga favoriter än. Tryck på hjärtat på ett recept.",
  offers: "Inget av dina recept har en huvudvara på erbjudande just nu.",
  all: "Inga recept än. Lägg till ett i Recept.",
};

/** What a tab says when its dishes are all on the week already. */
const plannedText: Record<PlanTab, string> = {
  favorites: "Alla dina favoriter ligger redan på veckan.",
  offers: "Alla dina rätter på erbjudande ligger redan på veckan.",
  all: "Alla dina recept ligger redan på veckan.",
};

export type WeekPlannerProps = {
  /** The Monday of the week shown. */
  weekStart: string;
  /** The first weekday (1–7) that is still open: today's in this week, 1 in a coming week, 8 in a past one. */
  firstOpenDay?: number;
  /** The week's dishes. */
  dishes: readonly PlanDish[];
  /** The library as rows, or `null` when it could not be read. */
  options: readonly PlanOption[] | null;
  /** How many items the week's dishes still need, or `null` when it could not be counted. */
  toBuy: number | null;
  /** Under the rows of På erbjudande: "Nya idéer med extrapris" and the ideas. */
  offersFooter?: ReactNode;
};

export function WeekPlanner({ weekStart, firstOpenDay = 1, dishes, options, toBuy, offersFooter }: WeekPlannerProps) {
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
  /** The free day tapped in Veckans rätter: the next "+" puts its dish there. */
  const [targetDay, setTargetDay] = useState<number | null>(null);
  const addRef = useRef<HTMLElement>(null);
  const bodyId = useId();
  /** The viewer's stored choice: collapsed on the server and on the first paint, the stored value after hydration. */
  const stored = useSyncExternalStore(subscribeToStorage, readStoredOpen, () => false);
  /** What was chosen on this page (a tap on the heading, or a free day), until then the stored choice. */
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? stored;
  const setOpen = setChoice;

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(openKey, next ? "1" : "0");
    } catch {
      // Not remembered, still works.
    }
  }
  const dishIds = useRef(new Map<string, string>());

  const shown = shownDishes(dishes, hidden, added, days);
  const byId = new Map((options ?? []).map((option) => [option.id, option]));
  const tabRows = optionsForTab(options ?? [], tab);
  const rows = notOnWeek(tabRows, shown);

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
      // A free day tapped above is sent; else no day, and the server puts the dish on the first free day.
      result = await addToCurrentPlan({ recipeId: option.id, servings: clampServings(option.servings), id, weekStart, ...(targetDay ? { weekday: targetDay } : {}) });
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
    setTargetDay(null);
    const row = result.data;
    setAdded((current) => [...current, dishFromRow(row)]);
    showToast(addedToWeekText(option.title, option.buyNames, row.weekday ?? null), {
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

  function chooseFreeDay(weekday: number) {
    setTargetDay((current) => (current === weekday ? null : weekday));
    // Opens the panel for this tap only: the stored preference is left as the viewer set it.
    setOpen(true);
    // After the panel is open, so the scroll lands on its content.
    requestAnimationFrame(() => addRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
  }

  const rowsOfWeek = calendarRows(shown, firstOpenDay);
  const dayDish = shown.find((dish) => dish.id === dayFor) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="week-dishes-heading" className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 id="week-dishes-heading" className="text-section-title text-ink">
            Veckans rätter
          </h2>
          {/* The count once lay in a bar with "Inköpslistan"; the tab bar already goes there, so only the count stays. */}
          {shown.length > 0 ? (
            <p data-testid="week-bar-count" className="text-meta text-ink-2">
              {weekBarText(shown.length, toBuy)}
            </p>
          ) : null}
        </div>
        {shown.length === 0 ? (
          <p data-testid="week-empty" className="rounded-lg bg-surface px-3.5 py-4 text-body text-ink-2">
            Inga rätter än. Välj bland dina recept här under.
          </p>
        ) : null}
        {rowsOfWeek.length > 0 ? (
          <ul aria-label="Veckans rätter" className="overflow-hidden rounded-lg bg-surface">
            {rowsOfWeek.map((row) => {
              if (row.kind === "no-day-label") {
                return (
                  <li key="no-day" data-testid="no-day-label" className="border-t border-hairline bg-bg px-3.5 py-1.5 text-badge font-semibold text-ink-2 first:border-t-0">
                    Ingen dag
                  </li>
                );
              }
              if (row.kind === "free") {
                return (
                  <li key={`free-${row.weekday}`} className="border-t border-hairline first:border-t-0">
                    <button
                      type="button"
                      data-testid="free-day"
                      aria-pressed={targetDay === row.weekday}
                      aria-label={`Lägg till en rätt på ${weekdayWord(row.weekday)}`}
                      onClick={() => chooseFreeDay(row.weekday)}
                      className={`flex min-h-tap w-full items-stretch text-left ${targetDay === row.weekday ? "bg-mint/40" : ""}`}
                    >
                      <span className="flex w-14 shrink-0 flex-col items-center justify-center bg-bg py-1.5 text-ink-3">
                        <span className="text-badge font-semibold uppercase">{weekdayShortName(row.weekday)}</span>
                        <span className="text-meta">{weekdayDateText(weekStart, row.weekday)}</span>
                      </span>
                      <span className="flex items-center px-3.5 text-meta text-ink-2">Ledig – lägg till</span>
                    </button>
                  </li>
                );
              }
              const dish = row.dish;
              return (
                <li key={dish.id} data-testid="plan-dish" data-dish={dish.id} className="flex items-stretch border-t border-hairline first:border-t-0">
                  <button
                    type="button"
                    data-testid="dish-day"
                    onClick={() => setDayFor(dish.id)}
                    aria-label={`Välj dag för ${dish.recipeTitle}, nu ${dayChipText(dish.weekday).toLowerCase()}`}
                    className={`flex min-h-tap w-14 shrink-0 flex-col items-center justify-center py-2 ${row.weekday ? "bg-mint text-mint-ink" : "bg-bg text-ink-3"}`}
                  >
                    {row.weekday && row.showDay ? (
                      <>
                        <span className="text-badge font-semibold uppercase">{weekdayShortName(row.weekday)}</span>
                        <span className="text-meta">{weekdayDateText(weekStart, row.weekday)}</span>
                      </>
                    ) : row.weekday ? null : (
                      <span className="text-meta">–</span>
                    )}
                  </button>
                  <div className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-1 pl-3">
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
                    <TrashButton
                      data-testid="dish-remove"
                      label={`Ta bort ${dish.recipeTitle}`}
                      onPress={(bin, press) => {
                        if (!press.pointer) focusAfterRemoval(bin);
                        void remove(dish);
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <section ref={addRef} aria-labelledby="add-dishes-heading" className="flex scroll-mt-4 flex-col gap-2.5 rounded-xl bg-fill p-3">
        <h2 id="add-dishes-heading" className="text-section-title text-ink">
          <button
            type="button"
            data-testid="add-dishes-toggle"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={toggleOpen}
            className="-m-3 flex min-h-tap w-[calc(100%+1.5rem)] items-center justify-between gap-2 p-3 text-left"
          >
            <span className="min-w-0 wrap-break-word">Lägg till nya rätter</span>
            <ChevronDownIcon size={20} className={`shrink-0 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </h2>
        <div id={bodyId} hidden={!open && options !== null} className="flex flex-col gap-2.5">
          {targetDay ? (
            <div data-testid="target-day" className="flex items-center justify-between gap-2 rounded-lg bg-mint px-3.5 text-mint-ink">
              <p className="text-control font-semibold">{targetDayText(targetDay)}</p>
              <button type="button" onClick={() => setTargetDay(null)} className="min-h-tap px-1 text-control font-semibold underline">
                Ta bort dag
              </button>
            </div>
          ) : null}
          {options === null ? (
            <p role="alert" className="rounded-lg bg-surface px-3.5 py-4 text-body text-ink-2">
              {errorMessages.mealplan_recipes_unavailable}
            </p>
          ) : (
            <>
              <div role="radiogroup" aria-label="Rätter att lägga till" className="-mx-3 flex gap-2 overflow-x-auto px-3">
                {tabs.map(({ value, label }) => (
                  <Chip key={value} role="radio" aria-checked={tab === value} selected={tab === value} onClick={() => setTab(value)}>
                    {label}
                  </Chip>
                ))}
              </div>
              {tab === "offers" ? (
                <p data-testid="offers-hint" className="text-meta text-deal-ink">
                  Förslag för att varorna är på erbjudande den här veckan.
                </p>
              ) : null}
              {rows.length === 0 ? (
                <p data-testid="options-empty" className="text-body text-ink-2">
                  {tabRows.length > 0 ? plannedText[tab] : emptyText[tab]}
                </p>
              ) : (
                <ul aria-label={tabs.find((candidate) => candidate.value === tab)?.label} className="flex flex-col gap-2">
                  {rows.map((option) => (
                    <PlanRow
                      key={option.id}
                      title={option.title}
                      imageUrl={option.imageUrl}
                      dish={option.dish}
                      meta={option.meta}
                      deal={option.deal?.text ?? null}
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
        </div>
      </section>

      <MoveToDaySheet
        open={dayDish !== null}
        onClose={() => setDayFor(null)}
        title={dayDish?.recipeTitle ?? ""}
        weekday={dayDish?.weekday ?? null}
        weekStart={weekStart}
        firstOpenDay={firstOpenDay}
        taken={takenByDay(shown, dayDish?.id ?? null)}
        onMove={(weekday) => dayDish && void moveTo(dayDish, weekday)}
        servings={dayDish ? { value: portions[dayDish.id] ?? dayDish.servings, onChange: (value) => void changeServings(dayDish, value) } : undefined}
      />

    </div>
  );
}

/** The titles of the dishes on each weekday, without `exceptId` (the dish being moved), for the sheet Flytta till dag. */
function takenByDay(dishes: readonly PlanDish[], exceptId: string | null): Record<number, string[]> {
  const taken: Record<number, string[]> = {};
  for (const dish of dishes) {
    if (dish.id === exceptId || !dish.weekday) continue;
    (taken[dish.weekday] ??= []).push(dish.recipeTitle);
  }
  return taken;
}
