"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Button } from "@/components/button";
import { useConfirmDelete } from "@/components/confirm-delete";
import { EmptyState } from "@/components/empty-state";
import { Meter } from "@/components/meter";
import { RecipeImage } from "@/components/recipe-image";
import { MoreIcon } from "@/components/icons";
import { Sheet } from "@/components/sheet";
import { Stepper } from "@/components/stepper";
import { useToast } from "@/components/toast";
import type { PantrySnapshot } from "@/features/pantry";
import { errorMessages, fail, type Result } from "@/lib/errors";
import { removePlanRecipe } from "../actions/remove-plan-recipe";
import { restorePlanRecipe } from "../actions/restore-plan-recipe";
import { setServings } from "../actions/set-servings";
import { setWeekday } from "../actions/set-weekday";
import { unmarkDishCooked } from "../actions/unmark-dish-cooked";
import { uncookedText } from "../domain/cooked";
import {
  comparePlanRecipes,
  dishRowMetaText,
  dishProgress,
  dishStatus,
  groupByWeekday,
  maxServings,
  movedText,
  removedDishesText,
  shoppingRowText,
  todayWeekday,
  weekdayDayNumber,
  weekdayNames,
  weekdayShortName,
  type PlanDish,
  type PlanRecipeRow,
  type ServingsChange,
  type WeekdayChange,
  weekdayDateText,
} from "../domain/meal-plan";
import { currentWeekStart, weekAnchorDate, weekNumber, weekQuery } from "../domain/week";
import { AddDishButton, useAddDish } from "./add-dish-sheet";
import { MarkCookedButton } from "./mark-cooked-button";
import { MoveToDaySheet } from "./move-to-day-sheet";

// Matsedel (FR-13): the week as one calm list (Story 3.11), a row per dish
// with the day on the first row of a day, the dish's image and title, the
// time and servings, and how much is at home for the chosen servings
// ("✓ Allt hemma", or "6 av 8 hemma" with a thin meter, counted with
// pantry.recipeStatus, AD-7). The seldom used buttons sit behind ⋯: servings
// (saved), "Markera som lagad", "Flytta till annan dag" and "Ta bort från
// matsedeln", which asks first and then offers "Ångra" for 5 s that puts the
// dish back with the same id (AD-20).

/** A moment this week, kept as one value so the store snapshot stays stable between renders. */
let anchorValue: Date | null = null;
function weekAnchor(): Date {
  // A day-old value would show yesterday's dates after midnight; refresh when the date changes.
  if (!anchorValue || todayWeekday(anchorValue) !== todayWeekday(new Date()) || Date.now() - anchorValue.getTime() > 86_400_000) {
    anchorValue = new Date();
  }
  return anchorValue;
}

/** Nothing to subscribe to: today only changes when the page is read again. */
const subscribeToNothing = () => () => {};

/** A removal or "Ångra" the plan shows before the server's plan has it. */
type Entry = {
  kind: "remove" | "restore";
  dish: PlanDish;
  /** Tells this change from a later change of the same dish. */
  token: number;
  /** The action has answered. */
  settled: boolean;
  /** The server's dishes when the action answered. */
  seen?: readonly PlanDish[];
};

/**
 * Whether the server's `dishes` show the change, so the entry can go: a
 * removed dish is no longer there; a restored one is there, or the plan has
 * been read again since (it may have been removed elsewhere meanwhile).
 */
function serverHas(entry: Entry, dishes: readonly PlanDish[]): boolean {
  const listed = dishes.some((dish) => dish.id === entry.dish.id);
  if (entry.kind === "remove") return !listed;
  return listed || (entry.seen !== undefined && entry.seen !== dishes);
}

/** The server's dishes with the pending changes applied, in plan order. */
function applyChanges(dishes: readonly PlanDish[], entries: Iterable<Entry>): readonly PlanDish[] {
  let shown = [...dishes];
  for (const { kind, dish } of entries) {
    if (kind === "remove") shown = shown.filter((other) => other.id !== dish.id);
    else if (!shown.some((other) => other.id === dish.id)) shown = [...shown, dish].sort(comparePlanRecipes);
  }
  return shown;
}

type Removed = { dish: PlanDish; row: PlanRecipeRow };

/** A dish's servings writes during a burst of taps. */
type ServingsWrites = {
  /** The latest value tapped. */
  wanted: number;
  /** The value the burst last sent, or `null` before the first write. */
  sent: number | null;
  /** The result of that write. */
  last: Result<ServingsChange> | null;
  /** Writes queued and not yet done. */
  pending: number;
  /** The last queued write; the next waits for it. */
  chain: Promise<void>;
};

export type MealPlanListProps = {
  /** The current plan's name ("Vecka 44"), or `null` when there is no plan yet. */
  planName: string | null;
  /** The plan's dishes in order, with their recipes (mealplan.getMealPlanView). */
  dishes: readonly PlanDish[];
  /** The whole pantry for the status, or `null` when it could not be read: no status then. */
  snapshot: PantrySnapshot | null;
  /**
   * "Lager: Stugan" (pantry.siteLineText), the place the status is counted
   * against, shown first while a shown dish has a status; `null` with one
   * place or without a status.
   */
  siteLine?: string | null;
  /** The place `snapshot` is read from, for "Markera som lagad". */
  siteId?: string | null;
  /** The catalog names by ingredient id, for "Markera som lagad" (Story 13.4). */
  names?: Readonly<Record<string, string>>;
  /**
   * The Monday of the week shown (Story 13.7). Dates are counted from it and
   * "Idag" only marks a day in this week; left out, this week as the
   * browser counts it.
   */
  weekStart?: string;
  /** A coming week: with no dish it still shows the week's days ("Ledig"), not the empty-plan text. */
  upcoming?: boolean;
  /** The weekday a dish was just put on from Recept (Story 13.8): lit for a moment. */
  highlightDay?: number | null;
};

/**
 * The plan's dishes, or "Ingen rätt på matsedeln än." with "Lägg till rätt"
 * (needs an AddDishProvider above). Servings show at once and are saved with
 * setServings; when saving fails the saved value comes back with "Det gick
 * inte att spara portionerna.". A removed dish is gone at once and stays gone
 * until the server's plan no longer has it; dishes removed while the
 * confirmation shows join it, and "Ångra" puts them all back. A failure is a
 * short confirmation announced as an alert. After a removal with the keyboard
 * or the card's button, focus goes to the next dish, else the one before,
 * else "Lägg till rätt".
 */
export function MealPlanList({
  planName,
  dishes,
  snapshot,
  siteLine = null,
  siteId = null,
  names = {},
  weekStart,
  upcoming = false,
  highlightDay = null,
}: MealPlanListProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [entries, setEntries] = useState<ReadonlyMap<string, Entry>>(() => new Map());
  /** The id of a dish just removed with the keyboard or the card's button, until focus has moved. */
  const focusAfter = useRef<string | null>(null);
  const nextToken = useRef(0);
  const serverDishes = useRef(dishes);
  /** The dishes removed under the confirmation showing now; a new object per confirmation. */
  const batch = useRef<{ removed: readonly Removed[] } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const confirm = useConfirmDelete();

  useEffect(() => {
    serverDishes.current = dishes;
  }, [dishes]);

  const begin = useCallback((kind: Entry["kind"], dish: PlanDish): number => {
    nextToken.current += 1;
    const token = nextToken.current;
    setEntries((current) => {
      // Entries the server's plan shows by now are done.
      const next = new Map([...current].filter(([, entry]) => !(entry.settled && serverHas(entry, serverDishes.current))));
      return next.set(dish.id, { kind, dish, token, settled: false });
    });
    return token;
  }, []);

  /** The action failed: the plan shows the server's dishes again. */
  const drop = useCallback((id: string, token: number) => {
    setEntries((current) => {
      if (current.get(id)?.token !== token) return current;
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }, []);

  /** The action succeeded: the entry stays until the server's plan shows the change. */
  const settle = useCallback((id: string, token: number) => {
    setEntries((current) => {
      const entry = current.get(id);
      if (entry?.token !== token) return current;
      const next = new Map(current);
      const settled: Entry = { ...entry, settled: true };
      if (serverHas(settled, serverDishes.current)) next.delete(id);
      else next.set(id, { ...settled, seen: serverDishes.current });
      return next;
    });
  }, []);

  function failed(message: string, lost: boolean) {
    showToast(message, { role: "alert" });
    if (lost) router.refresh();
  }

  async function removeDish(dish: PlanDish, moveFocus: boolean) {
    const token = begin("remove", dish);
    if (moveFocus) focusAfter.current = dish.id;
    let result: Result<PlanRecipeRow>;
    let lost = false;
    try {
      result = await removePlanRecipe(dish.id);
    } catch {
      // No answer (e.g. no connection): the dish comes back until the page is read again.
      result = fail("mealplan_remove_failed");
      lost = true;
    }
    if (!result.ok) {
      drop(dish.id, token);
      if (focusAfter.current === dish.id) focusAfter.current = null;
      if (result.error.code === "unauthorized") router.refresh();
      else failed(result.error.message, lost);
      return;
    }
    settle(dish.id, token);
    confirmRemoved({ dish, row: result.data });
  }

  function confirmRemoved(removed: Removed) {
    const all = [...(batch.current?.removed ?? []).filter((other) => other.dish.id !== removed.dish.id), removed];
    const current = { removed: all };
    batch.current = current;
    const forget = () => {
      if (batch.current === current) batch.current = null;
    };
    showToast(removedDishesText(all.map(({ dish }) => dish.recipeTitle)), {
      onUndo: () => {
        forget();
        void restoreAll(all);
      },
      onClose: forget,
    });
  }

  async function restoreAll(removed: readonly Removed[]) {
    const results = await Promise.all(
      removed.map(async ({ dish, row }) => {
        const token = begin("restore", dish);
        try {
          const result = await restorePlanRecipe(row);
          if (result.ok) settle(dish.id, token);
          else drop(dish.id, token);
          return { result, lost: false };
        } catch {
          drop(dish.id, token);
          return { result: fail("mealplan_restore_failed"), lost: true };
        }
      }),
    );
    const failure = results.find(({ result }) => !result.ok);
    if (failure && !failure.result.ok) failed(failure.result.error.message, results.some(({ lost }) => lost));
  }

  // Servings: shown at once, saved with setServings (useOptimistic).
  const savedServings = useMemo(() => Object.fromEntries(dishes.map((dish) => [dish.id, dish.servings])), [dishes]);
  const [servings, showServings] = useOptimistic(savedServings, (state, change: ServingsChange) => ({
    ...state,
    [change.id]: change.servings,
  }));
  const [, startTransition] = useTransition();
  /** The number of the latest change per dish, so only its failure is reported. */
  const latestChange = useRef(new Map<string, number>());
  /** Per dish, the writes of a burst of taps, one at a time; see saveServings. */
  const writes = useRef(new Map<string, ServingsWrites>());
  // Days (Story 13.5): a move shows at once and is saved with setWeekday (useOptimistic).
  const savedDays = useMemo(() => Object.fromEntries(dishes.map((dish) => [dish.id, dish.weekday ?? null])), [dishes]);
  const [days, showDay] = useOptimistic(savedDays, (state, change: WeekdayChange) => ({
    ...state,
    [change.id]: change.weekday,
  }));
  /** Today's weekday, known only in the browser so the server's page never differs from it. */
  const today = useSyncExternalStore(
    subscribeToNothing,
    () => (weekStart && weekStart !== currentWeekStart() ? null : todayWeekday(new Date())),
    () => null,
  );
  /** The week's dates ("26 okt") are known only in the browser too, for the same reason. */
  const browserWeek = useSyncExternalStore(
    subscribeToNothing,
    () => weekAnchor(),
    () => null,
  );
  // The viewed week's dates come from its Monday, never from "this week" (Story 13.7).
  const weekOf = weekStart ? weekAnchorDate(weekStart) : browserWeek;
  const { open: openAdd } = useAddDish();
  /** The day lit after "Lägg på onsdag" in Recept, for a few seconds. */
  const [lit, setLit] = useState(highlightDay);
  // A page kept from an earlier visit gets a new ?dag= without remounting, so the prop is followed.
  const [seenDay, setSeenDay] = useState(highlightDay);
  if (seenDay !== highlightDay) {
    setSeenDay(highlightDay);
    setLit(highlightDay);
  }
  useEffect(() => {
    if (!lit) return;
    const timer = setTimeout(() => setLit(null), 3000);
    return () => clearTimeout(timer);
  }, [lit]);

  function moveDish(dish: PlanDish, weekday: number | null) {
    startTransition(async () => {
      showDay({ id: dish.id, weekday });
      let result: Result<WeekdayChange>;
      try {
        result = await setWeekday({ id: dish.id, weekday });
      } catch {
        result = fail("mealplan_weekday_failed");
      }
      if (result.ok) {
        showToast(movedText(dish.recipeTitle, weekday));
        return;
      }
      if (result.error.code === "unauthorized") router.refresh();
      else showToast(result.error.message, { role: "alert" });
    });
  }

  /** The pending removals as last rendered, for code that runs after an await. */
  const entriesNow = useRef(entries);
  useEffect(() => {
    entriesNow.current = entries;
  }, [entries]);

  /**
   * Saves the dish's latest servings after any write of it already on its
   * way, so a quick series of taps ends with the last value saved. A write
   * whose value an earlier write of the same burst already saved is skipped.
   * Resolves with the result of the write that saved (or tried) the latest value.
   */
  function saveServings(id: string, value: number): Promise<Result<ServingsChange>> {
    let write = writes.current.get(id);
    if (!write) {
      write = { wanted: value, sent: null, last: null, pending: 0, chain: Promise.resolve() };
      writes.current.set(id, write);
    }
    const current = write;
    current.wanted = value;
    current.pending += 1;
    const link = current.chain.then(async () => {
      try {
        if (current.sent === current.wanted && current.last?.ok) return;
        const servings = current.wanted;
        let result: Result<ServingsChange>;
        try {
          result = await setServings({ id, servings });
        } catch {
          result = fail("mealplan_servings_failed");
        }
        current.sent = servings;
        current.last = result;
      } finally {
        current.pending -= 1;
        // The burst is over: the next tap always writes, whatever was sent.
        if (current.pending === 0) current.sent = null;
      }
    });
    current.chain = link;
    return link.then(() => current.last ?? fail("mealplan_servings_failed"));
  }

  function changeServings(dish: PlanDish, value: number) {
    const request = (latestChange.current.get(dish.id) ?? 0) + 1;
    latestChange.current.set(dish.id, request);
    startTransition(async () => {
      showServings({ id: dish.id, servings: value });
      const result = await saveServings(dish.id, value);
      if (result.ok || latestChange.current.get(dish.id) !== request) return;
      if (result.error.code === "unauthorized") {
        router.refresh();
        return;
      }
      // A dish on its way off the plan says nothing, so its "Ångra" stays.
      if (entriesNow.current.get(dish.id)?.kind === "remove") return;
      showToast(errorMessages.mealplan_servings_failed, { role: "alert" });
    });
  }

  /** Takes the "lagad" mark off; the pantry stays as it is, which the confirmation says. */
  async function unmark(dish: PlanDish) {
    let result: Result<null>;
    try {
      result = await unmarkDishCooked(dish.id);
    } catch {
      result = fail("mealplan_uncook_failed");
    }
    if (!result.ok) {
      if (result.error.code === "unauthorized") router.refresh();
      else showToast(result.error.message, { role: "alert" });
      return;
    }
    showToast(uncookedText(dish.recipeTitle));
  }

  // A change the server's plan already shows is done, whatever the entry says.
  const pending = [...entries.values()].filter((entry) => !(entry.settled && serverHas(entry, dishes)));
  const shown = applyChanges(dishes, pending).map((dish) =>
    dish.id in days ? { ...dish, weekday: days[dish.id] } : dish,
  );
  const sections = groupByWeekday(shown);
  const order = shown.map((dish) => dish.id);
  const lastOrder = useRef<readonly string[]>(order);

  // Focus after a removal with the keyboard or the card's button.
  useEffect(() => {
    const removed = focusAfter.current;
    if (removed !== null && !order.includes(removed)) {
      const before = lastOrder.current;
      const index = before.indexOf(removed);
      const neighbours = index === -1 ? [] : [...before.slice(index + 1), ...before.slice(0, index).reverse()];
      const target = neighbours.find((id) => order.includes(id));
      const root = rootRef.current;
      const element = target
        ? root?.querySelector<HTMLElement>(`[data-dish="${target}"] [data-dish-focus]`)
        : root?.querySelector<HTMLElement>("button");
      element?.focus();
      focusAfter.current = null;
    }
    lastOrder.current = order;
  });

  if (shown.length === 0 && !upcoming) {
    return (
      <div ref={rootRef}>
        <EmptyState action={<AddDishButton variant="primary" />}>Ingen rätt på matsedeln än.</EmptyState>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-3">
      {/* Metadata under the page title, never announced: the dishes' badges are what changes.
          Only above a dish with a status: a recipe, and a pantry to count it against. */}
      {siteLine && snapshot && shown.some((dish) => dish.recipe !== null) ? (
        <p className="text-meta break-words text-ink-2" data-testid="site-line">
          {siteLine}
        </p>
      ) : null}
      {/* The week's name is the selected tile now; the heading stays for screen readers (Story 13.9). */}
      {planName ? (
        <h2 data-testid="plan-name" className="sr-only">
          {planName}
        </h2>
      ) : null}
      {shown.length > 0 ? (
        // The count of missing items would need every dish's lines counted against the pantry
        // and merged as the list merges them, so the row names the week instead.
        <Link
          href={`/lista${weekStart ? weekQuery(weekStart) : ""}`}
          data-testid="shopping-row"
          className="flex min-h-tap items-center gap-3 rounded-lg bg-surface px-3.5 py-2 text-body text-ink"
        >
          <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sky">
            🛒
          </span>
          <span className="min-w-0 flex-1 break-words">{shoppingRowText(weekNumber(weekStart ?? currentWeekStart()))}</span>
          <span aria-hidden="true" className="text-row-title text-ink-3">
            ›
          </span>
        </Link>
      ) : null}
      <ul aria-label="Matsedelsrätter" className="overflow-hidden rounded-lg bg-surface">
        {sections.map(({ weekday, dishes: dayDishes }) => {
          const past = today !== null && weekday !== null && weekday < today;
          // A passed day with nothing on it is left out.
          if (dayDishes.length === 0 && (past || weekday === null)) return null;
          const heading = weekday ? (weekdayNames[weekday - 1] ?? "") : "Ingen dag än";
          const isToday = weekday !== null && weekday === today;
          const lighted = weekday !== null && weekday === lit;
          const date = weekday && weekOf ? weekdayDateText(weekOf, weekday) : null;
          const dayText = date ? `${heading} ${date}` : heading;
          const when = (
            <div
              className={`w-10 shrink-0 text-center leading-tight ${past ? "opacity-60" : ""} ${isToday ? "text-accent" : "text-ink-2"}`}
            >
              <span className="sr-only">{dayText}</span>
              <span aria-hidden="true" className="block text-meta font-semibold uppercase">
                {weekday ? weekdayShortName(weekday) : "–"}
              </span>
              {weekday && weekOf ? (
                <span aria-hidden="true" className="block text-row-title">
                  {weekdayDayNumber(weekOf, weekday)}
                </span>
              ) : null}
            </div>
          );
          return (
            <li
              key={weekday ?? "none"}
              data-testid="plan-day"
              data-day={weekday ?? "none"}
              data-today={isToday || undefined}
              data-highlight={lighted ? "true" : undefined}
              aria-current={isToday ? "date" : undefined}
              className={`border-t border-l-4 border-t-hairline first:border-t-0 ${isToday ? "border-l-mint" : "border-l-transparent"} ${lighted ? "bg-accent/20 motion-safe:transition-colors" : ""}`}
            >
              {dayDishes.length === 0 && weekday ? (
                // An empty day is one thin row: the day and "+ Lägg till", which opens Lägg till rätt on it.
                <button
                  type="button"
                  data-testid="day-free"
                  aria-label={`Lägg till rätt på ${heading.toLowerCase()}`}
                  onClick={() => openAdd(weekday)}
                  className="flex min-h-tap w-full items-center gap-3 py-2 pr-3 pl-3 text-left"
                >
                  {when}
                  <span className="flex-1 text-body font-semibold text-accent">+ Lägg till</span>
                  {isToday ? <TodayPill /> : null}
                </button>
              ) : (
                <ul aria-label={heading}>
                  {dayDishes.map((dish, index) => (
                    <DishRow
                      key={dish.id}
                      dish={dish}
                      when={index === 0 ? when : <div className="w-10 shrink-0" aria-hidden="true" />}
                      dayText={dayText}
                      today={isToday}
                      past={past}
                      servings={servings[dish.id] ?? dish.servings}
                      snapshot={snapshot}
                      siteId={siteId}
                      names={names}
                      onUnmark={() => void unmark(dish)}
                      onServingsChange={(value) => changeServings(dish, value)}
                      onMove={(day) => moveDish(dish, day)}
                      onRemove={(moveFocus) =>
                        confirm.requestDelete({
                          question: `Ta bort ${dish.recipeTitle} från matsedeln?`,
                          onConfirm: () => removeDish(dish, moveFocus),
                        })
                      }
                    />
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {confirm.dialog}
    </div>
  );
}

/** The small mint "Idag" label. */
function TodayPill() {
  return <span className="rounded-full bg-mint px-2 text-badge text-mint-ink">Idag</span>;
}

type DishRowProps = {
  dish: PlanDish;
  /** The day column: the weekday and date on a day's first row, else blank space. */
  when: ReactNode;
  /** "Lördag 31 okt", for the sheet. */
  dayText: string;
  today: boolean;
  past: boolean;
  /** The servings shown now, optimistic included. */
  servings: number;
  snapshot: PantrySnapshot | null;
  siteId: string | null;
  names: Readonly<Record<string, string>>;
  onUnmark: () => void;
  onServingsChange: (servings: number) => void;
  /** Flytta till dag: the chosen day (1–7) or `null`. */
  onMove: (weekday: number | null) => void;
  /** `moveFocus`: the removal came from the keyboard or a button. */
  onRemove: (moveFocus: boolean) => void;
};

/** Which sheet of a row is showing; they never stack, so one value. */
type Panel = "more" | "move" | "cooked" | null;

/**
 * A row of the week list (Story 3.11, DESIGN.md dish-card): the day column,
 * the recipe's image, the title (a link that covers the row, so a tap opens
 * the recipe), a line with the time and servings ("60 min · 4 port.") and
 * what is at home for them ("✓ Allt hemma", or "1 av 11 hemma" in sand with
 * a thin meter), and ⋯, which opens the sheet with servings, "Markera som
 * lagad", "Flytta till annan dag" and "Ta bort från matsedeln". A passed day
 * is smaller and dimmed, and an uncooked dish on it has "Lagad?" as a chip under the meta line (so the title keeps the row's width and never breaks mid-word). Without a
 * pantry, or a catalog ingredient to count, there is no status and no
 * meter; a dish whose recipe is gone keeps its title and says "Borttaget recept".
 */
function DishRow({
  dish,
  when,
  dayText,
  today,
  past,
  servings,
  snapshot,
  siteId,
  names,
  onUnmark,
  onServingsChange,
  onMove,
  onRemove,
}: DishRowProps) {
  const { recipe, recipeTitle: title } = dish;
  const [panel, setPanel] = useState<Panel>(null);
  const cooked = Boolean(dish.cookedAt);
  // A cooked dish has no status: it is done (Story 13.4).
  const status = cooked ? null : dishStatus(recipe, servings, snapshot);
  const progress = status ? dishProgress(status) : null;
  const missing = progress !== null && progress.value < 1;
  const close = () => setPanel(null);
  return (
    <li
      data-testid="plan-dish"
      data-dish={dish.id}
      data-cooked={cooked || undefined}
      className="relative border-t border-hairline first:border-t-0"
    >
      <div className={`flex items-center gap-3 py-2 pr-1 pl-3 ${past ? "" : "min-h-row"}`}>
        {when}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <RecipeImage
            src={recipe?.imageUrl ?? null}
            iconSize={past ? 20 : 24}
            className={`shrink-0 rounded-md ${past ? "size-tap opacity-60" : "size-dish-thumb"}`}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className={`flex min-w-0 flex-col gap-0.5 ${past ? "opacity-60" : ""}`}>
              {dish.recipeId ? (
                <Link
                  href={`/recept/${dish.recipeId}`}
                  data-dish-focus
                  // The link covers the whole row, so a tap anywhere on it opens the recipe.
                  className={`max-w-full self-start break-words text-ink after:absolute after:inset-0 ${past ? "text-body font-semibold" : "text-row-title"}`}
                >
                  {title}
                </Link>
              ) : (
                <p className={`break-words text-ink ${past ? "text-body font-semibold" : "text-row-title"}`}>{title}</p>
              )}
              <p data-testid="dish-meta" className="flex flex-wrap items-center gap-x-1.5 text-meta text-ink-3">
                {today ? <TodayPill /> : null}
                <span>{dishRowMetaText(dish.recipeId, recipe?.totalMinutes, servings)}</span>
                {cooked ? (
                  <span data-testid="dish-cooked" className="font-semibold text-mint-ink">
                    ✓ Lagad
                  </span>
                ) : progress ? (
                  <span data-testid="dish-status" className={`font-semibold ${missing ? "text-sand-ink" : "text-mint-ink"}`}>
                    {missing ? progress.text : "✓ Allt hemma"}
                  </span>
                ) : null}
              </p>
              {missing && progress ? <Meter value={progress.value} size="small" className="mt-1" /> : null}
            </div>
              {past && !cooked && recipe ? (
                <button
                  type="button"
                  onClick={() => setPanel("cooked")}
                  aria-label={`Lagad? ${title}`}
                  className="relative z-10 flex min-h-tap items-center self-start rounded-full text-meta font-semibold text-accent"
                >
                  <span className="rounded-full border border-border bg-surface px-3 py-1">Lagad?</span>
                </button>
              ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPanel("more")}
          aria-label={`Fler val för ${title}`}
          {...(dish.recipeId ? {} : { "data-dish-focus": true })}
          className="relative z-10 flex size-tap shrink-0 items-center justify-center rounded-full text-ink-3"
        >
          <MoreIcon size={22} />
        </button>
      </div>
      <Sheet open={panel === "more"} onClose={close} title={title} closeLabel="Klar">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <RecipeImage src={recipe?.imageUrl ?? null} iconSize={28} className="size-16 shrink-0 rounded-md" />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-meta break-words text-ink-2">
                {[dayText, recipe?.totalMinutes ? `${recipe.totalMinutes} min` : null].filter(Boolean).join(" · ")}
              </p>
              {dish.recipeId ? (
                <Link
                  href={`/recept/${dish.recipeId}`}
                  className="flex min-h-tap items-center self-start text-body font-semibold text-accent"
                >
                  Öppna receptet ›
                </Link>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-bg py-1 pl-3.5">
            <span className="text-body text-ink">Portioner</span>
            <Stepper
              value={servings}
              onChange={onServingsChange}
              min={1}
              max={maxServings}
              decreaseLabel={`Färre portioner, ${title}`}
              increaseLabel={`Fler portioner, ${title}`}
              className="bg-bg"
            />
          </div>
          {cooked ? (
            <div className="flex flex-col">
              <div className="flex items-center justify-between gap-3">
                <p className="flex min-h-tap items-center text-row-title font-semibold text-mint-ink">✓ Lagad</p>
                <Button
                  variant="text"
                  onClick={onUnmark}
                  aria-label={`Ta bort markeringen lagad, ${title}`}
                  aria-describedby={`cooked-note-${dish.id}`}
                >
                  Inte lagad
                </Button>
              </div>
              <p id={`cooked-note-${dish.id}`} className="text-meta text-ink-2">
                Om du tar bort markeringen ändras inte lagret.
              </p>
            </div>
          ) : recipe ? (
            <Button fullWidth onClick={() => setPanel("cooked")}>
              Markera som lagad
            </Button>
          ) : null}
          <div className="flex flex-col overflow-hidden rounded-lg bg-bg">
            <button
              type="button"
              onClick={() => setPanel("move")}
              className="flex min-h-row w-full items-center justify-between gap-3 px-3.5 text-left text-body text-ink"
            >
              Flytta till annan dag
              <span className="text-ink-3">{dish.weekday ? `${weekdayNames[dish.weekday - 1]} ›` : "Ingen dag ›"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                close();
                onRemove(true);
              }}
              className="flex min-h-row w-full items-center border-t border-hairline px-3.5 text-left text-body text-danger"
            >
              Ta bort från matsedeln
            </button>
          </div>
        </div>
      </Sheet>
      <MoveToDaySheet open={panel === "move"} onClose={close} title={title} weekday={dish.weekday ?? null} onMove={onMove} />
      {recipe ? (
        <MarkCookedButton
          dish={{ id: dish.id, title, servings }}
          originalServings={recipe.originalServings}
          lines={recipe.lines}
          snapshot={snapshot}
          siteId={siteId}
          names={names}
          open={panel === "cooked"}
          onOpenChange={(open) => setPanel(open ? "cooked" : null)}
        />
      ) : null}
    </li>
  );
}
