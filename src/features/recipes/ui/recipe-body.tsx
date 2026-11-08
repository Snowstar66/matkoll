"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/button";
import { cx } from "@/components/cx";
import { FixedAction } from "@/components/fixed-action";
import { Stepper } from "@/components/stepper";
import { useToast } from "@/components/toast";
import { clampServings, maxServings, weekOffsetLabel, weekQueryAlways, weekShortName } from "@/features/mealplan";
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
import { useOption } from "@/lib/use-option";
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
  staplesNote,
  summarizeLines,
  type LineOffer,
} from "../domain/line-status";
import type { SavedRecipe } from "../domain/saved-recipe";
import { scaleFactor, scaleLines } from "../domain/scale";
import { BuyMissingSheet } from "./buy-missing-sheet";
import { ChooseWeekSheet } from "./choose-week-sheet";
import { IngredientRow, lineCoverage } from "./ingredient-row";
import { StepText } from "./step-text";
import { TimerBar } from "./timer-bar";
import { useStepTimers } from "./use-step-timers";
import { useWakeLock } from "./use-wake-lock";
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

/** mealplan.removePlanRecipe from the page: the undo of "Lägg på matsedeln" (and the first half of "Byt vecka"). */
export type RemoveFromPlan = (id: string) => Promise<Result<unknown>>;

/** The recipe's dish on this week's meal plan, or `null` when it is not on it. */
export type PlanDishInfo = { id: string; weekday: number | null };

/** A week the recipe can be planned for (this week and the next two, and the remembered week), with the recipe's dish on it. */
export type RecipeWeek = {
  /** The Monday, `YYYY-MM-DD`. */
  weekStart: string;
  /** 0 this week, 1 next week, 2 in two weeks. */
  offset: number;
  /** The ISO week number: 46. */
  number: number;
  /** How many dishes the week has: "v. 46 · 2 rätter" in the sheet. */
  count: number;
  dish: PlanDishInfo | null;
};

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
  /** This week and the next two (and the remembered week) with the recipe's dish on each. */
  weeks?: readonly RecipeWeek[];
  /** The Monday "Lägg på matsedeln" puts the dish on: the week last viewed on Matsedel or Inköpslista, else this week (UX-04). */
  defaultWeekStart?: string;
  /** The recipe's dish on this week's plan; used without `weeks`. */
  dish?: PlanDishInfo | null;
  buyMissing?: BuyMissing;
  undoBuy?: UndoBuy;
  removeFromPlan?: RemoveFromPlan;
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
 * Ångra", which removes just those. "Lägg på matsedeln" is one tap (UX-05): the
 * week last viewed on Matsedel or Inköpslista, without a day, and the recipe's
 * missing ingredients stand on the list through the plan. The toast has "Ångra"
 * and "Byt vecka" (the sheet "Vilken vecka?"), and the page then says "På
 * matsedeln v. 46", a link to Matsedel on that week.
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
  defaultWeekStart,
  buyMissing,
  undoBuy,
  removeFromPlan,
  finish,
}: RecipeBodyProps) {
  const router = useRouter();
  const { showToast } = useToast();
  // The screen stays on while the recipe is open, and a time in a step starts a timer (no separate cooking mode).
  const timerOption = useOption("recipeTimer");
  useWakeLock(useOption("recipeAwake"));
  const timers = useStepTimers(recipe.id);
  const ingredientNames = useMemo(
    () => recipe.lines.flatMap((line) => (line.ingredientName ? [line.ingredientName] : [])),
    [recipe.lines],
  );
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
  // The week the dish goes on: the remembered one (UX-04). What this visit did (put it on a week, moved it,
  // took it back) is laid over what the page read, until the page has caught up.
  const target = weeks?.find((candidate) => candidate.weekStart === defaultWeekStart) ?? weeks?.[0] ?? null;
  const [local, setLocal] = useState<{ weekStart: string | null; dish: PlanDishInfo } | "none" | null>(null);
  const placed: { weekStart: string | null; dish: PlanDishInfo } | null =
    local === "none" ? null : local ?? (target ? (target.dish ? { weekStart: target.weekStart, dish: target.dish } : null) : dish ? { weekStart: null, dish } : null);
  const onPlan = placed?.dish ?? null;
  const placedWeek = placed?.weekStart ? weeks?.find((candidate) => candidate.weekStart === placed.weekStart) ?? null : null;
  const placedName = placed?.weekStart ? weekShortName(placed.weekStart) : "denna vecka";
  const [planListed, setPlanListed] = useState<readonly string[]>([]);
  const listed = useMemo(() => new Set([...listedIds, ...added, ...planListed]), [listedIds, added, planListed]);
  const states = useMemo(() => (status ? lineStates(lines, status, listed, offers) : null), [lines, status, listed, offers]);
  const toBuy = useMemo(() => (states ? itemsToBuy(lines, states) : []), [lines, states]);
  const summary = useMemo(() => (states ? summarizeLines(lines, states) : null), [lines, states]);
  const note = useMemo(() => (states ? staplesNote(lines, states) : null), [lines, states]);
  // Only beside a status: the place it is counted against (AD-24), as "2 av 8 hemma i Stugan" (Story 19.2).
  const siteName = status ? shownSiteName(site) : null;

  const [buyOpen, setBuyOpen] = useState(false);
  const [weekOpen, setWeekOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const planDishId = useRef<string | null>(null);

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
      // UX-05: no day (`null`), on the remembered week; the day is chosen later on Matsedel.
      result = await addToPlan({
        recipeId: recipe.id,
        servings: clampServings(servings),
        id: planDishId.current,
        weekday: null,
        ...(target ? { weekStart: target.weekStart } : {}),
      });
    } catch {
      result = fail("mealplan_add_failed");
    }
    setWorking(false);
    if (result.ok) {
      const id = planDishId.current;
      planDishId.current = null;
      setLocal({ weekStart: target?.weekStart ?? null, dish: { id, weekday: null } });
      // The recipe's missing ingredients stand on the list through the plan.
      const names = toBuy.map((item) => item.name);
      setPlanListed(toBuy.map((item) => item.ingredientId));
      setBought(null);
      showToast(plannedToastText(target ? weekShortName(target.weekStart) : "denna vecka", names), {
        onUndo: () => void undoPlan(id),
        show: { label: "Byt vecka", onShow: () => setWeekOpen(true) },
      });
    } else if (result.error.code === "unauthorized") router.refresh();
    else showToast(result.error.message, { role: "alert" });
  }

  async function undoPlan(id: string) {
    if (!removeFromPlan) return;
    const result = await removeFromPlan(id).catch(() => fail("mealplan_remove_failed"));
    if (result.ok) {
      setLocal("none");
      setPlanListed([]);
    } else if (result.error.code === "unauthorized") router.refresh();
    else showToast(result.error.message, { role: "alert" });
  }

  // "Byt vecka": the dish goes on the chosen week first, and then comes off the old one, so a failure never loses it.
  async function moveToWeek(weekStart: string) {
    if (!addToPlan || !removeFromPlan || !onPlan || working) return;
    setWorking(true);
    const id = crypto.randomUUID();
    let added: Result<{ weekday?: number | null }>;
    try {
      added = await addToPlan({ recipeId: recipe.id, servings: clampServings(servings), id, weekday: null, weekStart });
    } catch {
      added = fail("mealplan_add_failed");
    }
    if (!added.ok) {
      setWorking(false);
      if (added.error.code === "unauthorized") router.refresh();
      else showToast(added.error.message, { role: "alert" });
      return;
    }
    const removed = await removeFromPlan(onPlan.id).catch(() => fail("mealplan_remove_failed"));
    setWorking(false);
    setLocal({ weekStart, dish: { id, weekday: null } });
    if (removed.ok) showToast(`Flyttad till matsedeln ${weekShortName(weekStart)}.`);
    else showToast(removed.error.message, { role: "alert" });
  }

  const wide = useWideScreen();
  const showBuy = Boolean(buyMissing) && !onPlan && (toBuy.length > 0 || bought !== null);
  const showUndo = bought !== null && toBuy.length === 0;
  const hasActions = (Boolean(addToPlan) && !onPlan) || showBuy;
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
      {addToPlan && !onPlan ? (
        <Button disabled={working} onClick={addToWeek} className={wide ? "w-full" : "grow-[999] basis-auto"}>
          Lägg på matsedeln
        </Button>
      ) : null}
    </>
  );

  return (
    <>
      <TimerBar timers={timers.timers} onFinish={timers.finish} onDismiss={timers.dismiss} onExtend={timers.extend} />
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
                  <li>
                    {/* UX-05: a pill, not a button; it leads to the week on Matsedel, where the day is chosen. */}
                    <Link
                      href={`/matsedel${placed?.weekStart ? weekQueryAlways(placed.weekStart) : ""}`}
                      data-testid="recipe-planned"
                      className="block rounded-full bg-mint px-2.5 py-1.5 text-meta font-semibold text-mint-ink"
                    >
                      {plannedChipText(placedName)}
                    </Link>
                  </li>
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
                    <p className="text-body text-ink">
                      <StepText
                        text={step.text}
                        stepKey={step.id}
                        label={step.title ? step.title : `Steg ${index + 1}`}
                        ingredientNames={ingredientNames}
                        onStart={timerOption ? timers.start : undefined}
                      />
                    </p>
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
      {weeks && removeFromPlan && addToPlan ? (
        <ChooseWeekSheet
          open={weekOpen}
          onClose={() => setWeekOpen(false)}
          recipeTitle={recipe.title}
          current={placedWeek?.weekStart ?? null}
          onChoose={moveToWeek}
          options={weeks.map((week) => ({
            weekStart: week.weekStart,
            label: weekOffsetLabel(week.offset),
            detail: `v. ${week.number} · ${week.count === 0 ? "Tom" : week.count === 1 ? "1 rätt" : `${week.count} rätter`}`,
          }))}
        />
      ) : null}
    </>
  );
}

const chipTones = {
  // UX-12: outlined, so it does not look like a filled button next to the soft chips.
  accent: "border border-accent text-accent",
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
