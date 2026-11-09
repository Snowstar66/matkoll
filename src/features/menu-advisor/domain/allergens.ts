import type { MenuAllergen, MenuDish } from "./types";

export type AllergenHit = {
  allergen: MenuAllergen;
  /** `allergener`: follows from the dish. `kan_innehalla`: cannot be ruled out. Both count as a hit. */
  source: "allergener" | "kan_innehalla";
};

/**
 * The allergens in `avoid` that the dish has or may have. A "may contain" counts as a hit, flagged by source;
 * an allergen in both lists is reported once, as `allergener`.
 */
export function allergenHits(dish: Pick<MenuDish, "allergener" | "kan_innehalla">, avoid: readonly MenuAllergen[]): AllergenHit[] {
  const hits: AllergenHit[] = [];
  for (const allergen of new Set(avoid)) {
    if (dish.allergener.includes(allergen)) hits.push({ allergen, source: "allergener" });
    else if (dish.kan_innehalla.includes(allergen)) hits.push({ allergen, source: "kan_innehalla" });
  }
  return hits;
}
