import { z } from "zod";

// Kostråd groups and the nutrition values of one ingredient. The groups follow
// Livsmedelsverket's kostråd (more vegetables, pulses, fish and whole grain;
// less red meat). The check list for ingredient_nutrition.kostrad_group in the
// migration must equal KOSTRAD_GROUPS (tests/design/nutrition-checks.test.ts).

export const KOSTRAD_GROUPS = [
  "gronsak",
  "baljvaxt",
  "fisk",
  "rott_kott",
  "fagel",
  "agg",
  "mejeri",
  "fullkorn",
  "raffinerad",
  "fett",
  "socker",
  "ovrigt",
  "ej_raknad",
] as const;

export const kostradGroupSchema = z.enum(KOSTRAD_GROUPS);
export type KostradGroup = z.infer<typeof kostradGroupSchema>;

/** Swedish names of the groups, for the UI to show later. */
export const KOSTRAD_GROUP_LABELS: Record<KostradGroup, string> = {
  gronsak: "Grönsaker och frukt",
  baljvaxt: "Baljväxter",
  fisk: "Fisk och skaldjur",
  rott_kott: "Rött kött och chark",
  fagel: "Fågel",
  agg: "Ägg",
  mejeri: "Mejeri",
  fullkorn: "Fullkorn",
  raffinerad: "Vitt mjöl, ris, pasta och potatis",
  fett: "Fett och olja",
  socker: "Socker och sött",
  ovrigt: "Övrigt",
  ej_raknad: "Räknas inte",
};

/** Energy and nutrients in 100 g. */
export type Per100g = {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  fiberG: number;
};

/** What is known about one ingredient (a row of ingredient_nutrition). */
export type IngredientNutrition = {
  /** The normalised ingredient name the row belongs to. */
  name: string;
  group: KostradGroup;
  /** Livsmedelsverket's food number; `null` for ingredients that are not counted. */
  lmvNumber: number | null;
  /** `null` for ingredients that are not counted (group `ej_raknad`). */
  per100g: Per100g | null;
  /** Grams of one whole piece ("2 st"), or `null`. */
  gramsPerPiece: number | null;
  /** Grams of one slice ("2 skivor"), or `null`. */
  gramsPerSlice: number | null;
  /** Grams in 1 dl, or `null` when volume amounts cannot be converted. */
  gramsPerDl: number | null;
};

/**
 * Livsmedelsverket's licence asks for attribution (CC BY 4.0). The UI shows
 * this text wherever it shows nutrition.
 */
export const NUTRITION_ATTRIBUTION =
  "Näringsvärden: Livsmedelsverket, Livsmedelsdatabasen (CC BY 4.0). Värdena är ungefärliga och räknade på receptets mängder.";

export const NUTRITION_LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/deed.sv";
