import { cx } from "@/components/cx";
import { allergenLabels, categoryTags } from "../domain/labels";
import { priceText } from "../domain/view";
import type { DishMatch } from "../domain/view";
import type { MenuAllergen, MenuDish } from "../domain/types";

const tag = "rounded-pill bg-fill px-2 text-meta text-ink-2";
const veganTag = "rounded-pill bg-mint px-2 text-meta text-mint-ink";
const dangerTag = "rounded-pill border border-danger bg-surface px-2 text-meta font-semibold text-danger";

/**
 * One dish: the name as printed, the price (in the menu's currency and about so many kronor), the Swedish explanation,
 * the main ingredients and tags. With a `match` (Hjälp mig välja) the allergens to avoid are marked and said in words;
 * without one every allergen of the dish is a tag. A dish with no mark is never called safe.
 */
export function MenuDishRow({
  dish,
  match,
  starred,
  onStar,
}: {
  dish: MenuDish;
  match: DishMatch | null;
  starred: boolean;
  onStar: () => void;
}) {
  const price = priceText(dish);
  // "skaldjur" as category and as allergen is one tag, the allergen's.
  const category = categoryTags[dish.kategori] && !dish.allergener.some((allergen) => allergenLabels[allergen].toLowerCase() === categoryTags[dish.kategori]) ? categoryTags[dish.kategori] : null;
  const hitAllergens = new Set<MenuAllergen>(match?.hits.map((hit) => hit.allergen));
  const contains = match?.hits.filter((hit) => hit.source === "allergener").map((hit) => allergenLabels[hit.allergen].toLowerCase()) ?? [];
  const mayContain = match?.hits.filter((hit) => hit.source === "kan_innehalla").map((hit) => allergenLabels[hit.allergen].toLowerCase()) ?? [];
  const flagged = match !== null && (match.hits.length > 0 || match.disliked.length > 0);
  return (
    <li data-testid="menu-dish" data-flagged={flagged ? "true" : undefined} className="flex items-start gap-1 py-2 pr-1 pl-4">
      <div className="min-w-0 flex-1 py-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 text-row-title">{dish.originalnamn}</span>
          {price ? <span className="shrink-0 text-control text-ink">{price}</span> : null}
        </div>
        <p className="text-body text-ink">{dish.forklaring}</p>
        {dish.huvudingredienser.length > 0 ? <p className="text-meta text-ink-3">{dish.huvudingredienser.join(", ")}</p> : null}
        {contains.length > 0 ? <p className="mt-1 text-meta font-semibold text-danger">Innehåller {contains.join(", ")}</p> : null}
        {mayContain.length > 0 ? <p className="mt-1 text-meta font-semibold text-danger">Kan innehålla {mayContain.join(", ")}</p> : null}
        {match && match.disliked.length > 0 ? <p className="mt-1 text-meta text-ink-2">Du undviker: {match.disliked.join(", ")}</p> : null}
        <div className="mt-1 flex flex-wrap gap-1">
          {category ? <span className={category.startsWith("veg") ? veganTag : tag}>{category}</span> : null}
          {dish.allergener.map((allergen) => (
            <span key={allergen} className={match === null || hitAllergens.has(allergen) ? dangerTag : tag}>
              {allergenLabels[allergen].toLowerCase()}
            </span>
          ))}
          {dish.kan_innehalla
            .filter((allergen) => !dish.allergener.includes(allergen))
            .map((allergen) => (
              <span key={allergen} className={match === null || hitAllergens.has(allergen) ? dangerTag : tag}>
                kan: {allergenLabels[allergen].toLowerCase()}
              </span>
            ))}
        </div>
      </div>
      <button
        type="button"
        aria-pressed={starred}
        aria-label={`Stjärnmärk ${dish.originalnamn}`}
        data-testid="menu-star"
        onClick={onStar}
        className={cx("flex size-tap shrink-0 items-center justify-center rounded-md text-headline", starred ? "text-accent" : "text-ink-3")}
      >
        <span aria-hidden="true">{starred ? "★" : "☆"}</span>
      </button>
    </li>
  );
}
