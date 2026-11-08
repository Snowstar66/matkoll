import type { IngredientNutrition, KostradGroup, Per100g } from "./groups";

// Small builders for the nutrition tests.

export function food(
  name: string,
  group: KostradGroup,
  per100g: Per100g | null,
  extra: Partial<Pick<IngredientNutrition, "gramsPerPiece" | "gramsPerSlice" | "gramsPerDl" | "lmvNumber">> = {},
): IngredientNutrition {
  return { name, group, lmvNumber: 1, per100g, gramsPerPiece: null, gramsPerSlice: null, gramsPerDl: null, ...extra };
}

export const per = (kcal: number, proteinG = 0, fatG = 0, carbsG = 0, fiberG = 0): Per100g => ({
  kcal,
  proteinG,
  fatG,
  carbsG,
  fiberG,
});

export const line = (ingredientId: string | null, amount: number | null, unit: string | null, isVague = false) => ({
  ingredientId,
  amount,
  unit,
  isVague,
});
