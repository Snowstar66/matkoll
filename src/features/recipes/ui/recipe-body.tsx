"use client";

import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/button";
import { FixedAction } from "@/components/fixed-action";
import { Stepper } from "@/components/stepper";
import { clampServings, maxServings, type PlanningTarget } from "@/features/mealplan";
import {
  atHomeSummaryText,
  recipeStatusForFactor,
  siteLineText,
  type PantrySnapshot,
  type SelectedSite,
} from "@/features/pantry";
import { cookSteps } from "../domain/cook-steps";
import type { SavedRecipe } from "../domain/saved-recipe";
import { scaleFactor, scaleLines } from "../domain/scale";
import { AddToPlanButton, type AddToPlan } from "./add-to-plan-button";
import { CookMode } from "./cook-mode";
import { IngredientRow, lineCoverage } from "./ingredient-row";
import { MissingChip, RecipeStatusBadge } from "./recipe-status-badge";

export type RecipeBodyProps = {
  recipe: SavedRecipe;
  /**
   * The whole pantry, for the status for the chosen servings; `null` when it
   * could not be read: no badge, marks or "X av Y hemma" then.
   */
  snapshot: PantrySnapshot | null;
  /** The place the snapshot is of: "Lager: Stugan" under "X av Y hemma" with more than one place. */
  site?: SelectedSite | null;
  /** mealplan.addToCurrentPlan from the page (AD-1): "Lägg på matsedeln" pinned to the bottom. */
  addToPlan?: AddToPlan;
  /** mealplan's "Markera som lagad" for this recipe's dish, from the page: shown at the end of the step mode (Story 13.4). */
  finish?: ReactNode;
  /** Planning mode (Story 13.8): the primary button is "Lägg på onsdag". */
  planning?: PlanningTarget;
};

/**
 * The recipe view's part that follows the chosen servings (FR-20): the
 * portion selector, the badge and "X av Y hemma", the ingredients scaled
 * with recipes.scaleLines, the steps, "Lägg på matsedeln" and "Laga nu",
 * which opens the step mode (FR-21) with the same lines and status. The servings
 * start at the recipe's own, within 1–1000 as a dish's (a recipe for 1200
 * starts at 1000), and are kept only while the page is open: − and + change
 * what is shown and call nothing on the server. The status is counted here
 * from the snapshot with the same factor the lines are scaled with, so it
 * follows the servings at once; the first render uses the starting servings,
 * as the server's does. The page keys this part on the recipe's servings and
 * amounts, so a saved edit of them starts again from the recipe's servings,
 * while the heart or a pantry change keeps the choice.
 *
 * "Laga nu" (secondary) is beside "Lägg på matsedeln" (primary), which takes
 * the rest of the row; with large text they wrap onto a row each. It is there
 * without "Lägg på matsedeln" too, but never for a recipe without steps, and
 * it waits while a dish is being added, so the confirmation is not hidden
 * behind the step mode. The step mode always opens at step 1 with the
 * servings shown, and closing it leaves the servings and the scroll as they
 * were. It closes if the steps go while it is open (a re-read after "Ändra").
 */
export function RecipeBody({ recipe, snapshot, site = null, addToPlan, finish, planning }: RecipeBodyProps) {
  const [servings, setServings] = useState(() => clampServings(recipe.servings));
  const factor = scaleFactor(servings, recipe.servings);
  const lines = useMemo(() => scaleLines(recipe.lines, factor), [recipe.lines, factor]);
  const status = useMemo(
    () => (snapshot ? recipeStatusForFactor(recipe.lines, factor, snapshot) : null),
    [recipe.lines, factor, snapshot],
  );
  // Story 4.3: the missing ingredients' names (the line's catalog name) and the first line that misses one.
  const missing = useMemo(() => {
    const names: string[] = [];
    let firstLineId: string | null = null;
    if (!status) return { names, firstLineId };
    for (const id of status.missingIngredientIds) {
      const named = lines.find((line) => line.ingredientId === id && line.ingredientName);
      if (named?.ingredientName) names.push(named.ingredientName);
    }
    const ids = new Set(status.missingIngredientIds);
    firstLineId = lines.find((line) => line.ingredientId !== null && ids.has(line.ingredientId))?.id ?? null;
    return { names, firstLineId };
  }, [lines, status]);
  const ingredientsRef = useRef<HTMLElement>(null);
  const showMissing = () => {
    const section = ingredientsRef.current;
    if (!section) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    section.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
    const line = missing.firstLineId ? document.getElementById(`recipe-line-${missing.firstLineId}`) : null;
    line?.focus({ preventScroll: true });
  };
  const steps = useMemo(() => cookSteps(recipe.steps, lines), [recipe.steps, lines]);
  // Only beside a status: the place it is counted against (AD-24).
  const siteLine = status ? siteLineText(site) : null;
  const canCook = steps.length > 0;
  const [cooking, setCooking] = useState(false);
  const [adding, setAdding] = useState(false);
  const cookButtonRef = useRef<HTMLButtonElement>(null);
  // A client navigation hides this page (Activity) instead of unmounting it:
  // the step mode closes then, so it is not open when Pontus comes back.
  useLayoutEffect(() => () => setCooking(false), []);
  // Without steps there is nothing to show, and it must not open again by
  // itself if they come back. Adjusted while rendering, as React recommends
  // over an effect (react-hooks/set-state-in-effect).
  if (cooking && !canCook) setCooking(false);

  return (
    <>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Stepper value={servings} onChange={setServings} min={1} max={maxServings} />
          {status ? (
            <div aria-live="polite" aria-atomic="true" className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {status.missingCount > 0 ? (
                <MissingChip
                  missingCount={status.missingCount}
                  missingNames={missing.names}
                  onPress={showMissing}
                />
              ) : (
                <RecipeStatusBadge missingCount={0} />
              )}
              {status.ingredientCount > 0 ? (
                <p className="text-meta text-ink-2" data-testid="recipe-at-home">
                  {atHomeSummaryText(status.atHomeCount, status.ingredientCount)}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        {/* Outside the live region: metadata, not read out when the servings change. */}
        {siteLine ? (
          <p className="text-meta break-words text-ink-2" data-testid="site-line">
            {siteLine}
          </p>
        ) : null}
      </div>

      {/* Mobile: ingredients above the steps. Desktop: side by side. */}
      <div className="flex flex-col gap-6 desktop:grid desktop:grid-cols-[2fr_3fr] desktop:items-start">
        <section
          ref={ingredientsRef}
          aria-labelledby="ingredienser"
          className="flex scroll-mt-4 flex-col gap-1 rounded-lg bg-surface px-4 py-3"
        >
          <h2 id="ingredienser" className="text-section-label text-ink-2">
            Ingredienser
          </h2>
          {lines.length > 0 ? (
            <ul className="flex flex-col">
              {lines.map((line) => (
                <IngredientRow
                  key={line.id}
                  line={line}
                  coverage={status ? lineCoverage(status, line.id) : null}
                  factor={factor}
                  anchorId={`recipe-line-${line.id}`}
                />
              ))}
            </ul>
          ) : (
            <p className="py-2 text-body text-ink-2">Receptet har inga ingredienser.</p>
          )}
        </section>

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
                  <p className="text-body text-ink">{step.text}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-body text-ink-2">Receptet har inga steg.</p>
          )}
        </section>
      </div>

      {addToPlan || canCook ? (
        <FixedAction>
          <div className="flex flex-wrap gap-2">
            {addToPlan ? (
              <AddToPlanButton
                recipeId={recipe.id}
                addToPlan={addToPlan}
                servings={servings}
                fullWidth={false}
                className="grow-[999] basis-auto"
                onPendingChange={setAdding}
                planning={planning}
              />
            ) : null}
            {canCook ? (
              <Button
                ref={cookButtonRef}
                variant="secondary"
                disabled={adding}
                onClick={() => setCooking(true)}
                className="grow basis-auto"
              >
                Laga nu
              </Button>
            ) : null}
          </div>
        </FixedAction>
      ) : null}

      {cooking && canCook ? (
        <CookMode
          title={recipe.title}
          servings={servings}
          steps={steps}
          status={status}
          factor={factor}
          onClose={() => setCooking(false)}
          returnFocusRef={cookButtonRef}
          finish={finish}
        />
      ) : null}
    </>
  );
}
