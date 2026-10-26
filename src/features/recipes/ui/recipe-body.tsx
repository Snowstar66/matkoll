"use client";

import { useMemo, useState } from "react";
import { FixedAction } from "@/components/fixed-action";
import { Stepper } from "@/components/stepper";
import { clampServings, maxServings } from "@/features/mealplan";
import { atHomeSummaryText, recipeStatusForFactor, type PantrySnapshot } from "@/features/pantry";
import type { SavedRecipe } from "../domain/saved-recipe";
import { scaleFactor, scaleLines } from "../domain/scale";
import { AddToPlanButton, type AddToPlan } from "./add-to-plan-button";
import { IngredientRow, lineCoverage } from "./ingredient-row";
import { RecipeStatusBadge } from "./recipe-status-badge";

export type RecipeBodyProps = {
  recipe: SavedRecipe;
  /**
   * The whole pantry, for the status for the chosen servings; `null` when it
   * could not be read: no badge, marks or "X av Y hemma" then.
   */
  snapshot: PantrySnapshot | null;
  /** mealplan.addToCurrentPlan from the page (AD-1): "Lägg på matsedeln" pinned to the bottom. */
  addToPlan?: AddToPlan;
};

/**
 * The recipe view's part that follows the chosen servings (FR-20): the
 * portion selector, the badge and "X av Y hemma", the ingredients scaled
 * with recipes.scaleLines, the steps, and "Lägg på matsedeln". The servings
 * start at the recipe's own, within 1–1000 as a dish's (a recipe for 1200
 * starts at 1000), and are kept only while the page is open: − and + change
 * what is shown and call nothing on the server. The status is counted here
 * from the snapshot with the same factor the lines are scaled with, so it
 * follows the servings at once; the first render uses the starting servings,
 * as the server's does. The page keys this part on the recipe's servings and
 * amounts, so a saved edit of them starts again from the recipe's servings,
 * while the heart or a pantry change keeps the choice.
 */
export function RecipeBody({ recipe, snapshot, addToPlan }: RecipeBodyProps) {
  const [servings, setServings] = useState(() => clampServings(recipe.servings));
  const factor = scaleFactor(servings, recipe.servings);
  const lines = useMemo(() => scaleLines(recipe.lines, factor), [recipe.lines, factor]);
  const status = useMemo(
    () => (snapshot ? recipeStatusForFactor(recipe.lines, factor, snapshot) : null),
    [recipe.lines, factor, snapshot],
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Stepper value={servings} onChange={setServings} min={1} max={maxServings} />
        {status ? (
          <div aria-live="polite" aria-atomic="true" className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <RecipeStatusBadge missingCount={status.missingCount} />
            {status.ingredientCount > 0 ? (
              <p className="text-meta text-ink-2" data-testid="recipe-at-home">
                {atHomeSummaryText(status.atHomeCount, status.ingredientCount)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Mobile: ingredients above the steps. Desktop: side by side. */}
      <div className="flex flex-col gap-6 desktop:grid desktop:grid-cols-[2fr_3fr] desktop:items-start">
        <section aria-labelledby="ingredienser" className="flex flex-col gap-1 rounded-lg bg-surface px-4 py-3">
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

      {/* Room for "Laga nu" beside it in Story 4.2. */}
      {addToPlan ? (
        <FixedAction>
          <AddToPlanButton recipeId={recipe.id} addToPlan={addToPlan} servings={servings} />
        </FixedAction>
      ) : null}
    </>
  );
}
