"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/button";
import { cx } from "@/components/cx";
import { WeekPicker } from "@/components/week-picker";
import { FixedAction } from "@/components/fixed-action";
import { Stepper } from "@/components/stepper";
import { useToast } from "@/components/toast";
import { clampServings, maxServings, weekdayWord } from "@/features/mealplan";
import {
  atHomeSummaryText,
  noStaples,
  recipeStatusForFactor,
  shownSiteName,
  type PantrySnapshot,
  type SelectedSite,
  type StapleRules,
} from "@/features/pantry";
import { fail, type Result } from "@/lib/errors";
import { groupLines } from "../domain/line-groups";
import {
  boughtText,
  buyKey,
  itemsToBuy,
  lineStates,
  listedChipText,
  offerChipText,
  plannedChipText,
  plannedToastText,
  whenText,
  staplesNote,
  summarizeLines,
  type LineOffer,
} from "../domain/line-status";
import type { SavedRecipe } from "../domain/saved-recipe";
import { scaleFactor, scaleLines } from "../domain/scale";
import { BuyMissingSheet } from "./buy-missing-sheet";
import { ChooseDaySheet } from "./choose-day-sheet";
import { IngredientRow, lineCoverage } from "./ingredient-row";
import { formatQuantity } from "@/features/catalog";

const wideQuery = "(min-width: 1024px)";

/** A desktop window (Story 19.6): the buttons stand in the column instead of pinned to the bottom. */
function useWideScreen(): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const list = window.matchMedia(wideQuery);
      list.addEventListener?.("change", notify);
      return () => list.removeEventListener?.("change", notify);
    },
    () => typeof window.matchMedia === "function" && window.matchMedia(wideQuery).matches,
    () => false,
  );
}

/** mealplan.addToCurrentPlan from the page (AD-1): "Lägg på matsedeln", on this week without a day. */
export type AddToPlan = (input: {
  recipeId: string;
  servings?: number;
  id: string;
  weekday?: number | null;
  /** The Monday of the week to add to; left out, this week. */
  weekStart?: string;
}) => Promise<Result<{ weekday?: number | null }>>;

/** shopping.addKeyedItems from the page (AD-1): one own item per key, linked to its catalog ingredient. */
export type BuyMissing = (input: {
  items: { key: string; label: string; ingredientId: string | null }[];
}) => Promise<Result<unknown>>;

/** shopping.removeKeyedItems from the page: the undo of BuyMissing. */
export type UndoBuy = (input: { keys: string[] }) => Promise<Result<unknown>>;

/** mealplan.setWeekday from the page. */
export type SetDishWeekday = (change: { id: string; weekday: number | null }) => Promise<Result<unknown>>;

/** The recipe's dish on this week's meal plan, or `null` when it is not on it. */
export type PlanDishInfo = { id: string; weekday: number | null };

/** A week the recipe can be planned for (this week and the next two), with the recipe's dish on it. */
export type RecipeWeek = {
  /** The Monday, `YYYY-MM-DD`. */
  weekStart: string;
  /** 0 this week, 1 next week, 2 in two weeks. */
  offset: number;
  /** The ISO week number: 46. */
  number: number;
  dish: PlanDishInfo | null;
};

/** The week a recipe is planned for unless the person picks another: next week. */
const defaultWeekOffset = 1;

export type RecipeBodyProps = {
  recipe: SavedRecipe;
  /**
   * The whole pantry, for the status for the chosen servings; `null` when it
   * could not be read: no chips, marks or buttons for what is missing then.
   */
  snapshot: PantrySnapshot | null;
  /** The place the snapshot is of: "2 av 8 hemma i Stugan" with more than one place. */
  site?: SelectedSite | null;
  /** The household's Basvaror: at home within their limits (pantry.isStaple); none when left out. */
  staples?: StapleRules;
  /** mealplan.addToCurrentPlan from the page (AD-1): "Lägg på matsedeln" pinned to the bottom. */
  addToPlan?: AddToPlan;
  /** The best offer per catalog ingredient, from this week's offers in the user's stores (recipes.lineOffers). */
  offers?: Record<string, LineOffer>;
  /** The catalog ingredients that stand on the shopping list now. */
  listedIds?: readonly string[];
  /** This week and the next two with the recipe's dish on each: the week picker; next week is chosen first. */
  weeks?: readonly RecipeWeek[];
  /** The recipe's dish on this week's plan, which turns "Lägg på matsedeln" into "Välj dag". */
  dish?: PlanDishInfo | null;
  buyMissing?: BuyMissing;
  undoBuy?: UndoBuy;
  setWeekday?: SetDishWeekday;
  /** mealplan's "Markera som lagad" for this recipe's dish, from the page: shown under the steps (Story 13.4). */
  finish?: ReactNode;
};

/**
 * The recipe view's part that follows the chosen servings (FR-20, Story 25.1):
 * the portion selector, the chips (on the meal plan, "X av Y hemma", on the
 * list, on offer), the ingredients scaled with recipes.scaleLines, each saying
 * at home, "Saknas" or "På listan" and its offer, and the steps. The status is
 * counted here from the snapshot with the same factor the lines are scaled
 * with, so it follows the servings at once. The servings start at the recipe's
 * own, within 1–1000 as a dish's, and are kept only while the page is open.
 *
 * The bottom bar has two buttons. "Köp det som saknas (N)" opens a sheet with
 * the missing ingredients ticked and puts them, and only them, on the list
 * (keyed items, so a retry is the same items); afterwards it is "På listan ✓ ·
 * Ångra", which removes just those. "Lägg på matsedeln" is one tap: this week,
 * without a day, and the recipe's missing ingredients stand on the list through
 * the plan; the button then becomes "Välj dag" / "Byt dag", an optional sheet.
 */
export function RecipeBody({
  recipe,
  snapshot,
  site = null,
  staples = noStaples,
  addToPlan,
  offers = {},
  listedIds = [],
  dish = null,
  weeks,
  buyMissing,
  undoBuy,
  setWeekday,
  finish,
}: RecipeBodyProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [servings, setServings] = useState(() => clampServings(recipe.servings));
  const factor = scaleFactor(servings, recipe.servings);
  const lines = useMemo(() => scaleLines(recipe.lines, factor), [recipe.lines, factor]);
  const status = useMemo(
    () => (snapshot ? recipeStatusForFactor(recipe.lines, factor, snapshot, staples) : null),
    [recipe.lines, factor, snapshot, staples],
  );
  // What this visit put on the list or on the plan shows at once; the server's list catches up after the action.
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  const [bought, setBought] = useState<readonly string[] | null>(null);
  // The week the dish goes on: next week unless the person picks another (only with the `weeks` of the page).
  const [weekOffset, setWeekOffset] = useState(defaultWeekOffset);
  const week = weeks?.find((candidate) => candidate.offset === weekOffset) ?? null;
  const [planned, setPlanned] = useState<Readonly<Record<string, PlanDishInfo>>>({});
  const weekKey = week?.weekStart ?? "";
  const onPlan = planned[weekKey] ?? (week ? week.dish : dish);
  const when = week ? whenText(week.offset) : null;
  const listed = useMemo(() => new Set([...listedIds, ...added]), [listedIds, added]);
  const states = useMemo(() => (status ? lineStates(lines, status, listed, offers) : null), [lines, status, listed, offers]);
  const toBuy = useMemo(() => (states ? itemsToBuy(lines, states) : []), [lines, states]);
  const summary = useMemo(() => (states ? summarizeLines(lines, states) : null), [lines, states]);
  const note = useMemo(() => (states ? staplesNote(lines, states) : null), [lines, states]);
  // Only beside a status: the place it is counted against (AD-24), as "2 av 8 hemma i Stugan" (Story 19.2).
  const siteName = status ? shownSiteName(site) : null;

  const [buyOpen, setBuyOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const planDishId = useRef<string | null>(null);
  function pickWeek(offset: number) {
    // A retry id left by a failed tap belongs to the old week.
    planDishId.current = null;
    setWeekOffset(offset);
  }

  const rows = toBuy.map((item) => {
    const line = lines.find((candidate) => candidate.id === item.lineId);
    const amount = line && line.amount !== null ? formatQuantity(line.amount, line.unit) : "";
    return { ingredientId: item.ingredientId, text: [amount, item.name].filter(Boolean).join(" "), offer: item.offer };
  });

  async function confirmBuy(ingredientIds: string[]) {
    if (!buyMissing || working) return;
    const items = toBuy.filter((item) => ingredientIds.includes(item.ingredientId));
    if (items.length === 0) return;
    setWorking(true);
    let result: Result<unknown>;
    try {
      result = await buyMissing({
        items: items.map((item) => ({ key: buyKey(recipe.id, item.ingredientId), label: item.name, ingredientId: item.ingredientId })),
      });
    } catch {
      result = fail("shopping_save_failed");
    }
    setWorking(false);
    if (result.ok) {
      setBuyOpen(false);
      setAdded((current) => new Set([...current, ...items.map((item) => item.ingredientId)]));
      setBought((current) => [...new Set([...(current ?? []), ...items.map((item) => item.ingredientId)])]);
      showToast(boughtText(items.length));
    } else if (result.error.code === "unauthorized") router.refresh();
    else showToast(result.error.message, { role: "alert" });
  }

  async function undo() {
    if (!undoBuy || !bought || working) return;
    setWorking(true);
    let result: Result<unknown>;
    try {
      result = await undoBuy({ keys: bought.map((id) => buyKey(recipe.id, id)) });
    } catch {
      result = fail("shopping_remove_failed");
    }
    setWorking(false);
    if (result.ok) {
      const gone = new Set(bought);
      setAdded((current) => new Set([...current].filter((id) => !gone.has(id))));
      setBought(null);
    } else if (result.error.code === "unauthorized") router.refresh();
    else showToast(result.error.message, { role: "alert" });
  }

  async function addToWeek() {
    if (!addToPlan || working) return;
    setWorking(true);
    planDishId.current ??= crypto.randomUUID();
    let result: Result<{ weekday?: number | null }>;
    try {
      // No day sent: the server puts the dish on the first free day of the week.
      result = await addToPlan({
        recipeId: recipe.id,
        servings: clampServings(servings),
        id: planDishId.current,
        ...(week ? { weekStart: week.weekStart } : {}),
      });
    } catch {
      result = fail("mealplan_add_failed");
    }
    setWorking(false);
    if (result.ok) {
      const id = planDishId.current;
      planDishId.current = null;
      const day = result.data.weekday ?? null;
      setPlanned((current) => ({ ...current, [weekKey]: { id, weekday: day } }));
      // The recipe's missing ingredients stand on the list through the plan.
      const names = toBuy.map((item) => item.name);
      setAdded((current) => new Set([...current, ...toBuy.map((item) => item.ingredientId)]));
      setBought(null);
      showToast(plannedToastText(recipe.title, day ? weekdayWord(day) : null, names, when), {
        show: { label: day ? "Byt dag" : "Välj dag", onShow: () => setDayOpen(true) },
      });
    } else if (result.error.code === "unauthorized") router.refresh();
    else showToast(result.error.message, { role: "alert" });
  }

  async function chooseDay(weekday: number | null) {
    if (!setWeekday || !onPlan) return;
    const result = await setWeekday({ id: onPlan.id, weekday }).catch(() => fail("mealplan_weekday_failed"));
    if (result.ok) {
      setPlanned((current) => ({ ...current, [weekKey]: { id: onPlan.id, weekday } }));
      showToast(
        weekday === null
          ? `Ingen dag vald. Rätten ligger på ${when ?? "veckan"}.`
          : `${recipe.title} på ${weekdayWord(weekday)}${when ? ` ${when}` : ""}.`,
      );
    } else if (result.error.code === "unauthorized") router.refresh();
    else showToast(result.error.message, { role: "alert" });
  }

  const wide = useWideScreen();
  const showBuy = Boolean(buyMissing) && !onPlan && (toBuy.length > 0 || bought !== null);
  const showUndo = bought !== null && toBuy.length === 0;
  const hasActions = Boolean(addToPlan) || showBuy;
  const actions = (
    <>
      {showBuy ? (
        showUndo ? (
          <Button
            variant="secondary"
            disabled={working}
            onClick={undo}
            className={cx("text-sky-ink!", wide ? "w-full" : "grow basis-auto")}
          >
            På listan ✓ · Ångra
          </Button>
        ) : (
          <Button variant="secondary" disabled={working} onClick={() => setBuyOpen(true)} className={wide ? "w-full" : "grow basis-auto"}>
            Köp det som saknas ({toBuy.length})
          </Button>
        )
      ) : null}
      {addToPlan && onPlan ? (
        <Button variant="secondary" disabled={working} onClick={() => setDayOpen(true)} className={cx(wide ? "w-full" : "grow basis-auto")}>
          {onPlan.weekday ? "Byt dag" : "Välj dag"}
        </Button>
      ) : addToPlan ? (
        <Button disabled={working} onClick={addToWeek} className={wide ? "w-full" : "grow-[999] basis-auto"}>
          Lägg på matsedeln
        </Button>
      ) : null}
    </>
  );

  return (
    <>
      {/* Mobile: ingredients above the steps. Desktop: portions, buttons and ingredients in the left column, the steps beside it. */}
      <div className="flex flex-col gap-5 desktop:grid desktop:grid-cols-[2fr_3fr] desktop:items-start desktop:gap-6">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <Stepper
                value={servings}
                onChange={setServings}
                min={1}
                max={maxServings}
                className="h-10 min-h-10 w-[11rem]! [&>button]:h-11"
              />
            </div>
            {status && summary ? (
              <ul aria-live="polite" aria-label="Status" className="flex flex-wrap gap-2" data-testid="recipe-chips">
                {onPlan ? (
                  <Chip tone="accent" testId="recipe-planned">
                    {plannedChipText(onPlan.weekday ? weekdayWord(onPlan.weekday) : null, when)}
                  </Chip>
                ) : null}
                {status.ingredientCount > 0 ? (
                  <Chip tone="mint" testId="recipe-at-home">
                    {atHomeSummaryText(status.atHomeCount, status.ingredientCount, siteName)}
                  </Chip>
                ) : null}
                {summary.listed > 0 ? (
                  <Chip tone="sky" testId="recipe-listed">
                    {listedChipText(summary.listed)}
                  </Chip>
                ) : null}
                {summary.onOffer > 0 ? (
                  <Chip tone="deal" testId="recipe-on-offer">
                    {offerChipText(summary)}
                  </Chip>
                ) : null}
              </ul>
            ) : null}
          </div>

          {weeks && addToPlan ? <WeekPicker weeks={weeks} selected={weekOffset} onSelect={pickWeek} testId="recipe-week" /> : null}

          {wide && hasActions ? <div className="flex flex-col gap-2">{actions}</div> : null}

          <section aria-labelledby="ingredienser" className="flex scroll-mt-4 flex-col gap-2">
            <div className="flex flex-col gap-1 rounded-lg bg-surface px-4 py-3">
              <h2 id="ingredienser" className="text-section-label text-ink-2">
                Ingredienser
              </h2>
              {lines.length > 0 ? (
                // Ingredient groups (Linas Matkasse cards and the like) each get a small heading; a recipe without groups is one list, as before.
                groupLines(lines).map((group, index) => (
                  <div key={group.name ?? ""} className="flex flex-col" data-testid="recipe-line-group">
                    {group.name !== null ? (
                      <h3 className={cx("text-section-label wrap-break-word text-ink-2", index > 0 ? "pt-4" : "pt-2")}>{group.name}</h3>
                    ) : null}
                    <ul className="flex flex-col">
                      {group.lines.map((line) => (
                        <IngredientRow
                          key={line.id}
                          line={line}
                          coverage={status ? lineCoverage(status, line.id) : null}
                          state={states?.[line.id] ?? null}
                          factor={factor}
                          anchorId={`recipe-line-${line.id}`}
                        />
                      ))}
                    </ul>
                  </div>
                ))
              ) : (
                <p className="py-2 text-body text-ink-2">Receptet har inga ingredienser.</p>
              )}
            </div>
            {note ? (
              <p className="text-meta text-ink-2" data-testid="recipe-staples-note">
                {note}
              </p>
            ) : null}
          </section>
        </div>

        <section aria-labelledby="steg" className="flex flex-col gap-3">
          <h2 id="steg" className="text-section-label text-ink-2">
            Steg
          </h2>
          {recipe.steps.length > 0 ? (
            <ol className="flex flex-col gap-4">
              {recipe.steps.map((step, index) => (
                <li key={step.id} className="flex gap-3">
                  <span aria-hidden="true" className="w-6 shrink-0 text-row-title text-accent">
                    {index + 1}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    {step.title ? (
                      <h3 className="text-headline text-ink" data-testid="recipe-step-title">
                        {step.title}
                      </h3>
                    ) : null}
                    <p className="text-body text-ink">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-body text-ink-2">Receptet har inga steg.</p>
          )}
          {finish}
        </section>
      </div>

      {!wide && hasActions ? <FixedAction glass>{actions}</FixedAction> : null}

      {buyMissing ? (
        <BuyMissingSheet open={buyOpen} onClose={() => setBuyOpen(false)} rows={rows} onConfirm={confirmBuy} pending={working} />
      ) : null}
      {setWeekday ? (
        <ChooseDaySheet open={dayOpen} onClose={() => setDayOpen(false)}
          weekday={onPlan?.weekday ?? null}
          onChoose={chooseDay}
          weekLabel={week ? `Vecka ${week.number}${when ? `, ${when}` : ""}` : undefined}
        />
      ) : null}
    </>
  );
}

const chipTones = {
  accent: "bg-accent text-on-accent",
  mint: "bg-mint text-mint-ink",
  sky: "bg-sky text-sky-ink",
  deal: "bg-deal text-deal-ink",
} as const;

/** A status chip at the top of the recipe: a small pill, text only (status never rests on colour alone). */
function Chip({ tone, testId, children }: { tone: keyof typeof chipTones; testId: string; children: ReactNode }) {
  return (
    <li className={cx("rounded-full px-2.5 py-1.5 text-meta font-semibold", chipTones[tone])} data-testid={testId}>
      {children}
    </li>
  );
}
