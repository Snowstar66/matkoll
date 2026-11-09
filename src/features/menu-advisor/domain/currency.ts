// Currency handling for a read menu: symbol to code, and a rough conversion to kronor. No network calls.

/** Currency codes the app converts. */
export type KnownCurrency = "SEK" | "EUR" | "GBP" | "USD";

/**
 * APPROXIMATE rates, kronor per unit, as of `approxRatesDate`. For a rough "about X kr" only, never for exact
 * prices. Change here (or pass your own table to toSek) when they drift.
 */
export const approxSekRates: Readonly<Record<KnownCurrency, number>> = { SEK: 1, EUR: 11, GBP: 13, USD: 10 };
export const approxRatesDate = "2026-11-09";

const codeByText: Readonly<Record<string, KnownCurrency>> = {
  "€": "EUR",
  eur: "EUR",
  euro: "EUR",
  euros: "EUR",
  kr: "SEK",
  "kr.": "SEK",
  sek: "SEK",
  kronor: "SEK",
  ":-": "SEK",
  "£": "GBP",
  gbp: "GBP",
  "$": "USD",
  usd: "USD",
};

/** The known currency a symbol or code stands for ("€" and "eur" are EUR, "kr" is SEK), or null. */
export function currencyFromText(text: string | null | undefined): KnownCurrency | null {
  if (!text) return null;
  return codeByText[text.trim().toLowerCase()] ?? null;
}

/**
 * The price in kronor at the approximate rates, rounded to whole kronor; null when there is no price or the
 * currency is missing or not in the table.
 */
export function toSek(
  price: number | null,
  currency: string | null,
  rates: Readonly<Record<string, number>> = approxSekRates,
): number | null {
  if (price === null || !Number.isFinite(price) || price < 0 || !currency) return null;
  const rate = rates[currency.trim().toUpperCase()];
  return rate === undefined ? null : Math.round(price * rate);
}
