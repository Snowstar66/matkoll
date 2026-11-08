"use client";

import { Suspense, use } from "react";
import { LeafIcon } from "@/components/icons";
import { summarizeWeek } from "../domain/kostrad";
import type { RecipeNutrition } from "../domain/recipe-nutrition";
import { weekLineText } from "../domain/texts";
import { useNutritionOptions } from "./use-nutrition-options";

/**
 * The week line for a nutrition promise that the page did not wait for (by recipe id): it appears
 * when the nutrition has been read, under its own Suspense, and never holds the plan back.
 * `recipeIds` is one entry per planned dinner, `null` for a dish without a recipe.
 */
export function NutritionWeekLineAsync({
  recipeIds,
  nutrition,
}: {
  recipeIds: readonly (string | null)[];
  nutrition: Promise<Readonly<Record<string, RecipeNutrition>>>;
}) {
  return (
    <Suspense fallback={null}>
      <Resolved recipeIds={recipeIds} nutrition={nutrition} />
    </Suspense>
  );
}

function Resolved({ recipeIds, nutrition }: { recipeIds: readonly (string | null)[]; nutrition: Promise<Readonly<Record<string, RecipeNutrition>>> }) {
  const byId = use(nutrition);
  return <NutritionWeekLine dinners={recipeIds.map((id) => (id ? (byId[id] ?? null) : null))} />;
}

/**
 * Matsedel's quiet week line ("Veckans middagar: 2 fiskrätter · 3 gröna"), only with Tillval
 * "Visa näring" on. `dinners` is one entry per planned dinner, `null` for a dish without
 * nutrition. No score and no advice; with nothing to say there is no line.
 */
export function NutritionWeekLine({ dinners }: { dinners: readonly (RecipeNutrition | null)[] }) {
  const { show } = useNutritionOptions();
  if (!show) return null;
  const text = weekLineText(summarizeWeek(dinners));
  if (!text) return null;
  return (
    <p className="flex items-center gap-2 px-1 text-meta text-ink-2" data-testid="nutrition-week-line">
      <LeafIcon size={16} className="shrink-0 text-accent" />
      {text}
    </p>
  );
}
