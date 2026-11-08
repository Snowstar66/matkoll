"use client";

import { useOption } from "@/lib/use-option";

/**
 * The two Tillval switches of the nutrition UI. Both are off on the server and
 * during hydration (the default), so a page renders nothing nutritional until
 * the client has read the choice: no mismatch, and no jump for people with it off.
 */
export function useNutritionOptions(): { show: boolean; kcal: boolean } {
  const show = useOption("showNutrition");
  const kcal = useOption("showKcal");
  return { show, kcal: show && kcal };
}
