import type { DrinkKind } from "./profile";
import type { MenuDish } from "./types";

/** One dish proposed to one person, with why. */
export type DishOption = {
  dish: MenuDish;
  /** Index of the dish in menu.ratter, stable key for selection. */
  dishIndex: number;
  /** Price of the dish in SEK (approx), or null when the menu has no price. */
  priceSek: number | null;
  /** Short reasons that change a decision, never generic ("Anna älskar paprika", "99 kr billigare än förslaget"). Empty when nothing to say. */
  reasons: string[];
  /** "allergy" = contains an allergen of this person (only offered when nothing else fits), "maybe" = may contain it. */
  warning: "allergy" | "maybe" | null;
};

/** The options for one person, best first. */
export type PersonOptions = { personId: string; options: DishOption[] };

/** What has been chosen: one dish index per person, and optionally another drink than the person's usual. */
export type Choice = { dishIndex: number | null; drink: DrinkKind | null };
export type Choices = Record<string, Choice>;
