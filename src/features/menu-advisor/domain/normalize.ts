import { currencyFromText } from "./currency";
import { menuAllergens, type Menu, type MenuAllergen, type MenuDish, type RawMenu } from "./types";

const knownAllergens: readonly string[] = menuAllergens;

function allergenList(list: readonly MenuAllergen[]): MenuAllergen[] {
  return [...new Set(list)].filter((allergen) => knownAllergens.includes(allergen));
}

/** The currency most rows with a price name (known codes only), or null. Ties go to the first seen. */
function dominantCurrency(dishes: readonly MenuDish[]): string | null {
  const counts = new Map<string, number>();
  for (const dish of dishes) {
    if (dish.pris === null) continue;
    const code = currencyFromText(dish.valuta) ?? dish.valuta?.trim().toUpperCase() ?? null;
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [code, count] of counts) {
    if (count > bestCount) {
      best = code;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Cleans a reading: the currency comes from the symbol printed on the menu when the model saw one (the symbol
 * wins over a row's own currency: a menu with €17.95 has been read as SEK), else from the row, else from the
 * menu's most common one; a row without a price has no currency. Prices that are not finite and positive become
 * null. Allergens are deduplicated, and one in `allergener` is not repeated in `kan_innehalla`.
 */
export function normalizeMenu(raw: RawMenu): Menu {
  const symbolCurrency = currencyFromText(raw.valutasymbol_pa_menyn);
  const fallback = dominantCurrency(raw.ratter);
  const ratter = raw.ratter.map((dish): MenuDish => {
    const pris = dish.pris !== null && Number.isFinite(dish.pris) && dish.pris > 0 ? dish.pris : null;
    const own = currencyFromText(dish.valuta) ?? dish.valuta?.trim().toUpperCase() ?? null;
    const allergener = allergenList(dish.allergener);
    return {
      ...dish,
      allergener,
      kan_innehalla: allergenList(dish.kan_innehalla).filter((allergen) => !allergener.includes(allergen)),
      pris,
      valuta: pris === null ? null : (symbolCurrency ?? own ?? fallback),
    };
  });
  return { restaurang: raw.restaurang, sprak: raw.sprak, ratter, osakert: raw.osakert };
}
