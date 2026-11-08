"use client";

import { LeafIcon } from "@/components/icons";
import { summarizeWeek } from "../domain/kostrad";
import type { RecipeNutrition } from "../domain/recipe-nutrition";
import { weekLineText } from "../domain/texts";
import { useNutritionOptions } from "./use-nutrition-options";

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
