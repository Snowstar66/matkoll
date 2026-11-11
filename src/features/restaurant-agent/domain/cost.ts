// What one run costs, in kronor, and the caps. Prices are passed in (the route layer hands over the app's price table,
// settings/domain/ai-choice.ts: AD-1 forbids importing it here); the rest are Google's and Anthropic's list prices.

export type ModelPrice = { usdPerMTokIn: number; usdPerMTokOut: number };

/** Kronor per US dollar, as the rest of the app estimates (settings/domain/ai-choice.ts sekPerUsd). */
export const sekPerUsd = 10;
/** Anthropic web search: 10 USD per 1000 searches. */
export const usdPerSearch = 10 / 1000;
/** Google Places Text Search, Enterprise tier: 35 USD per 1000 requests. */
export const usdPerPlacesRequest = 35 / 1000;

/** At most this many web searches per run (d5). */
export const maxSearchesPerRun = 2;
/** The cap of one run in kronor (d6), on top of the household's existing daily cap. */
export const runCapSek = 2;
/** The existing daily AI cap in kronor (10 kr/day); the real figure is read by the server and passed in. */
export const defaultDayCapSek = 10;

export type Usage = { tokensIn: number; tokensOut: number; searches: number; placesRequests: number };
export const noUsage: Usage = { tokensIn: 0, tokensOut: 0, searches: 0, placesRequests: 0 };

/** The cost of a usage in kronor: tokens, searches and Places requests all counted. */
export function costSek(model: ModelPrice, usage: Usage): number {
  const usd =
    (usage.tokensIn * model.usdPerMTokIn + usage.tokensOut * model.usdPerMTokOut) / 1_000_000 +
    usage.searches * usdPerSearch +
    usage.placesRequests * usdPerPlacesRequest;
  return usd * sekPerUsd;
}

export type CapCheck = { ok: true } | { ok: false; cap: "run" | "day" };

/**
 * Whether a step that would cost `nextSek` may start: the run must stay within the run cap and the household within
 * what is left of the day. The day wins when both are exceeded, since it is the harder stop.
 */
export function checkCap(spentSek: number, nextSek: number, dayRemainingSek: number, runCap: number = runCapSek): CapCheck {
  if (nextSek > dayRemainingSek) return { ok: false, cap: "day" };
  if (spentSek + nextSek > runCap) return { ok: false, cap: "run" };
  return { ok: true };
}

/** Whether another web search may start: at most two per run, and the cap check on its price. */
export function mayStartSearch(searchesDone: number, spentSek: number, dayRemainingSek: number): CapCheck | { ok: false; cap: "searches" } {
  if (searchesDone >= maxSearchesPerRun) return { ok: false, cap: "searches" };
  return checkCap(spentSek, usdPerSearch * sekPerUsd, dayRemainingSek);
}
