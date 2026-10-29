import { z } from "zod";

// How good an offer is (Story 9.11): the regular price and the saving, read
// from the page's `parsedMechanics` and `stores[].regularPrice`. Never a
// guess: an offer whose units cannot be compared has no saving. Pure.

/** ICA's `parsedMechanics`, with only the fields used. Anything else is dropped. */
export const mechanicsSchema = z.object({
  benefitType: z.string().nullish(),
  quantity: z.number().nullish(),
  unitSign: z.string().nullish(),
  value1: z.string().nullish(),
  value2: z.string().nullish(),
});
export type IcaMechanics = z.infer<typeof mechanicsSchema>;

/** A saving of at least this many percent is a "Toppklipp". */
export const topDealPercent = 30;

/** "111,90" → 111.9; `null` for anything that is not a plain positive price. */
export function parsePrice(text: string | null | undefined): number | null {
  const value = (text ?? "").trim();
  if (!/^\d{1,5}(?:[.,]\d{1,2})?$/.test(value)) return null;
  const price = Number(value.replace(",", "."));
  return price > 0 ? price : null;
}

/** The price per item or kg in a FIXED offer ("89 kr/kg", "25 kr/st", "2 för 30 kr"), or `null`. */
function offerUnitPrice(mechanics: IcaMechanics): number | null {
  const quantity = mechanics.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1) return null;
  if (quantity === 1) {
    return mechanics.unitSign === "kr/kg" || mechanics.unitSign === "kr/st" ? parsePrice(mechanics.value1) : null;
  }
  // "2 för 50": quantity 2, value2 the total.
  const total =
    mechanics.unitSign === ":-" && /^\d+\s*för$/i.test((mechanics.value1 ?? "").trim()) ? parsePrice(mechanics.value2) : null;
  return total === null ? null : total / quantity;
}

/** The saving in whole percent from two prices, or `null` when the offer is not cheaper by at least 1 %. */
export function percentBelow(regular: number, offer: number): number | null {
  const percent = Math.round(((regular - offer) / regular) * 100);
  return percent >= 1 && percent <= 99 ? percent : null;
}

/** The saving in kronor per item or kg (two decimals at most), or `null` when the offer is not cheaper. */
export function savingKronor(regular: number, offer: number): number | null {
  const saving = Math.round((regular - offer) * 100) / 100;
  return saving > 0 ? saving : null;
}

/**
 * The regular price and the saving of an offer. The saving is `null` unless
 * it can be stated: a percent mechanic ("25% rabatt"), "Köp 3 betala för 2"
 * (1 - 2/3), or a FIXED price per kg, item or "2 för 50" against the regular
 * price (taken to be in the same unit, the store's own "Ord.pris").
 */
export function offerSaving(
  mechanics: IcaMechanics | null | undefined,
  regularPriceText: string | null | undefined,
): { regularPrice: number | null; savingPercent: number | null } {
  const regularPrice = parsePrice(regularPriceText);
  let savingPercent: number | null = null;
  if (mechanics) {
    if (mechanics.benefitType === "PERCENT" && mechanics.unitSign === "%") {
      const percent = /^\d{1,2}$/.test((mechanics.value1 ?? "").trim()) ? Number(mechanics.value1) : 0;
      savingPercent = percent >= 1 ? percent : null;
    } else if (mechanics.benefitType === "MULTI") {
      const buy = /^Köp (\d+)$/.exec((mechanics.value1 ?? "").trim());
      const pay = /^betala för (\d+)$/.exec((mechanics.value2 ?? "").trim());
      if (buy && pay && Number(pay[1]) >= 1 && Number(pay[1]) < Number(buy[1])) {
        savingPercent = percentBelow(Number(buy[1]), Number(pay[1]));
      }
    } else if (mechanics.benefitType === "FIXED" && regularPrice !== null) {
      const unitPrice = offerUnitPrice(mechanics);
      savingPercent = unitPrice === null ? null : percentBelow(regularPrice, unitPrice);
    }
  }
  return { regularPrice, savingPercent };
}

/** 111.9 → "Ord. 111,90 kr"; a whole price has no decimals. */
export function regularPriceText(price: number): string {
  return `Ord. ${Number.isInteger(price) ? price : price.toFixed(2).replace(".", ",")} kr`;
}

/** "Ord. 111,90 kr · spara 20 %", with what is known, or "" when nothing is. */
export function savingText(offer: { regularPrice: number | null; savingPercent: number | null }): string {
  return [
    offer.regularPrice === null ? null : regularPriceText(offer.regularPrice),
    offer.savingPercent === null ? null : `spara ${offer.savingPercent} %`,
  ]
    .filter(Boolean)
    .join(" · ");
}
