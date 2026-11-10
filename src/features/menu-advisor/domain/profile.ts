// People the advisor chooses for: household members and guests. Nothing filled in = eats anything.
import type { MenuAllergen } from "./types";

/** -2 = hate, -1 = dislike, 0 = no opinion (default), 1 = like, 2 = love. */
export type Taste = -2 | -1 | 0 | 1 | 2;

/**
 * The eight food kinds that existed first. They keep their link to a dish's category and word list (recommend.ts), so
 * they stay a fixed list; every other taste (the other presets and the ones a person adds) is matched by words.
 */
export const tasteKeys = ["kott", "fisk", "skaldjur", "vegetariskt", "pasta", "pizza", "starkt", "sott"] as const;
export type TasteKey = (typeof tasteKeys)[number];

export const drinkKinds = ["vatten", "lask", "ol", "vin", "cocktail", "kaffe", "ingen"] as const;
export type DrinkKind = (typeof drinkKinds)[number];

export type Person = {
  id: string;
  name: string;
  kind: "member" | "guest";
  /** One-time registration: allergies and intolerances that must never be suggested. */
  allergies: MenuAllergen[];
  /**
   * Everything a person likes or dislikes, one key each (domain/tastes.ts): a preset (kott, vitlok, ris) or an own thing
   * (a key like "nasi goreng"). -2 Ogillar, -1 Hellre inte, 1 Gillar, 2 Älskar; 0 is never stored. Not an allergy: a
   * dish is ranked down and flagged, never left out.
   */
  tastes: Record<string, Taste>;
  /** The drink the person usually orders; null = not set. */
  drink: DrinkKind | null;
};
