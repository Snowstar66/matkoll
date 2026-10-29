"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { Button, buttonClasses } from "@/components/button";
import { useConfirmDelete } from "@/components/confirm-delete";
import { EmptyState } from "@/components/empty-state";
import { Meter } from "@/components/meter";
import { RecipeImage } from "@/components/recipe-image";
import { CheckIcon } from "@/components/icons";
import { Stepper } from "@/components/stepper";
import { SwipeRow } from "@/components/swipe-row";
import { useToast } from "@/components/toast";
import { TrashButton } from "@/components/trash-button";
import type { PantrySnapshot } from "@/features/pantry";
import { errorMessages, fail, type Result } from "@/lib/errors";
import { removePlanRecipe } from "../actions/remove-plan-recipe";
import { restorePlanRecipe } from "../actions/restore-plan-recipe";
import { setServings } from "../actions/set-servings";
import { unmarkDishCooked } from "../actions/unmark-dish-cooked";
import { uncookedText } from "../domain/cooked";
import {
  comparePlanRecipes,
  dishMetaText,
  dishProgress,
  dishStatus,
  maxServings,
  removedDishesText,
  type PlanDish,
  type PlanRecipeRow,
  type ServingsChange,
} from "../domain/meal-plan";
import { AddDishButton } from "./add-dish-sheet";
import { MarkCookedButton } from "./mark-cooked-button";

// Matsedel (FR-13): the current plan's dishes (matsedelsrätter) as dish cards
// (rättkort, Epic 11), each with how much is at home for the chosen servings
// ("6 av 8 hemma" or "Allt finns hemma" and a meter, counted with
// pantry.recipeStatus, AD-7) and the portion selector, which is saved. A swipe
// to the left or "Ta bort" removes a dish at once, and the short confirmation
// offers "Ångra" for 5 s, which puts it back with the same id (AD-20). Under
// the dishes, "Lägg till rätt" and "Visa inköpslistan".

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
export function MealPlanList({ planName, dishes, snapshot, siteLine = null, siteId = null, names = {} }: MealPlanListProps) {
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
  const shown = applyChanges(dishes, pending);
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

  if (shown.length === 0) {
    return (
      <div ref={rootRef}>
        <EmptyState action={<AddDishButton variant="primary" />}>Ingen rätt på matsedeln än.</EmptyState>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-2">
      {/* Metadata under the page title, never announced: the dishes' badges are what changes.
          Only above a dish with a status: a recipe, and a pantry to count it against. */}
      {siteLine && snapshot && shown.some((dish) => dish.recipe !== null) ? (
        <p className="text-meta break-words text-ink-2" data-testid="site-line">
          {siteLine}
        </p>
      ) : null}
      {planName ? (
        <h2 data-testid="plan-name" className="text-section-label text-ink-2">
          {planName}
        </h2>
      ) : null}
      <ul aria-label="Matsedelsrätter" className="flex flex-col gap-3">
        {shown.map((dish) => (
          <DishCard
            key={dish.id}
            dish={dish}
            servings={servings[dish.id] ?? dish.servings}
            snapshot={snapshot}
            siteId={siteId}
            names={names}
            onUnmark={() => void unmark(dish)}
            onServingsChange={(value) => changeServings(dish, value)}
            onRemove={(moveFocus) => 
              confirm.requestDelete({
                question: `Ta bort ${dish.recipeTitle} från matsedeln?`,
                onConfirm: () => removeDish(dish, moveFocus),
              })
            }
          />
        ))}
      </ul>
      <div className="mt-2 flex flex-col gap-3">
        <AddDishButton variant="primary" fullWidth />
        <Link href="/lista" className={buttonClasses("secondary", true)}>
          Visa inköpslistan
        </Link>
      </div>
      {confirm.dialog}
    </div>
  );
}

type DishCardProps = {
  dish: PlanDish;
  /** The servings shown now, optimistic included. */
  servings: number;
  snapshot: PantrySnapshot | null;
  siteId: string | null;
  names: Readonly<Record<string, string>>;
  onUnmark: () => void;
  onServingsChange: (servings: number) => void;
  /** `moveFocus`: the removal came from the keyboard or the card's button. */
  onRemove: (moveFocus: boolean) => void;
};

/**
 * Rättkort (Epic 11, DESIGN.md dish-card): the recipe's image on
 * `dish-thumb`, its title (a link to the recipe), the time and how much is
 * at home for the chosen servings ("35 min · 6 av 8 hemma" or "35 min ·
 * Allt finns hemma") with a small meter hidden from screen readers, then the
 * portion selector and "Ta bort". Without a pantry, or a catalog ingredient
 * to count, the line is the time alone and there is no meter. A dish whose
 * recipe is gone keeps its title and says "Borttaget recept"; one whose
 * recipe could not be read shows its stored title only.
 */
function DishCard({ dish, servings, snapshot, siteId, names, onUnmark, onServingsChange, onRemove }: DishCardProps) {
  const { recipe, recipeTitle: title } = dish;
  const cooked = Boolean(dish.cookedAt);
  // A cooked dish has no status: it is done (Story 13.4).
  const status = cooked ? null : dishStatus(recipe, servings, snapshot);
  const progress = status ? dishProgress(status) : null;
  const meta = dishMetaText(dish.recipeId, recipe?.totalMinutes, progress);
  return (
    <li data-testid="plan-dish" data-dish={dish.id} data-cooked={cooked || undefined}>
      <SwipeRow
        actionLabel="Ta bort"
        actionName={`Ta bort ${title}`}
        onAction={(via) => onRemove(via === "keyboard")}
        className="rounded-lg"
      >
        <div className="flex flex-col gap-3 p-3">
          <div className="flex items-center gap-3">
            <RecipeImage
              src={recipe?.imageUrl ?? null}
              iconSize={24}
              className="size-dish-thumb shrink-0 rounded-md"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {dish.recipeId ? (
                <Link
                  href={`/recept/${dish.recipeId}`}
                  data-dish-focus
                  // A mouse swipe on the title must move the card, not drag the link.
                  draggable={false}
                  className="max-w-full self-start text-row-title break-words text-ink"
                >
                  {title}
                </Link>
              ) : (
                <p className="text-row-title break-words text-ink">{title}</p>
              )}
              {meta ? (
                <p data-testid="dish-meta" className="text-meta break-words text-ink-2">
                  {meta}
                </p>
              ) : null}
              {progress ? <Meter value={progress.value} size="small" className="mt-1" /> : null}
              {cooked ? (
                <p data-testid="dish-cooked" className="flex items-center gap-1.5 text-meta text-ink">
                  <CheckIcon size={16} />
                  Lagad
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <Stepper
              value={servings}
              onChange={onServingsChange}
              min={1}
              max={maxServings}
              decreaseLabel={`Färre portioner, ${title}`}
              increaseLabel={`Fler portioner, ${title}`}
              className="bg-bg"
            />
            {cooked ? (
              <Button
                variant="text"
                onClick={onUnmark}
                aria-label={`Ta bort markeringen lagad, ${title}`}
                aria-describedby={`cooked-note-${dish.id}`}
              >
                Inte lagad
              </Button>
            ) : recipe ? (
              <MarkCookedButton
                dish={{ id: dish.id, title, servings }}
                originalServings={recipe.originalServings}
                lines={recipe.lines}
                snapshot={snapshot}
                siteId={siteId}
                names={names}
                variant="text"
              />
            ) : null}
            <TrashButton
              label={`Ta bort ${title} från matsedeln`}
              onPress={() => onRemove(true)}
              className="-mr-2"
              {...(dish.recipeId ? {} : { "data-dish-focus": true })}
            />
          </div>
          {cooked ? (
            <p id={`cooked-note-${dish.id}`} className="text-meta text-ink-2">
              Om du tar bort markeringen ändras inte lagret.
            </p>
          ) : null}
        </div>
      </SwipeRow>
    </li>
  );
}
