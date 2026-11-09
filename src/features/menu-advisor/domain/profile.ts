// People the advisor chooses for: household members and guests. Nothing filled in = eats anything.
import type { MenuAllergen } from "./types";

/** -2 = hate, -1 = dislike, 0 = no opinion (default), 1 = like, 2 = love. */
export type Taste = -2 | -1 | 0 | 1 | 2;

/** Food kinds a person can have a taste for. Keys of Person.tastes. */
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
  tastes: Partial<Record<TasteKey, Taste>>;
  /** The drink the person usually orders; null = not set. */
  drink: DrinkKind | null;
};
