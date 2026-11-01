import "server-only";
import type { Result } from "@/lib/errors";
import { httpsFetch } from "./https-fetch";
import { OFFERS_USER_AGENT, safeFetch, type FetchImpl, type FetchedPage, type Lookup } from "./safe-fetch";

// One fetch of a store's offer page (Story 9.1, AD-25). Reads no
// environment, so the scheduled fetch (Story 17.11, scripts/fetch-offers.ts)
// uses it as it is; the app's fetchOfferPage (index.ts) adds the site source.

/**
 * What fetching a store's offer page gave: the page or safeFetch's error,
 * and the HTTP status of the last answer (`null` when none came), so the
 * caller can tell a refusal (403, 429) from other errors.
 */
export type OfferPageFetch = { page: Result<FetchedPage>; status: number | null };

/**
 * safeFetch for a store's weekly offers: exactly one call, with
 * OFFERS_USER_AGENT and the same three headers as every fetch, no cookies.
 * `lookup` and `fetchImpl` replace the network for tests and fixtures.
 * Nothing here retries.
 */
export async function fetchOfferPageWith(
  url: string,
  options: { allowedDomains: readonly string[]; signal: AbortSignal; lookup?: Lookup; fetchImpl?: FetchImpl },
): Promise<OfferPageFetch> {
  const request = options.fetchImpl ?? httpsFetch;
  let status: number | null = null;
  const fetchImpl: FetchImpl = async (target, init) => {
    const response = await request(target, init);
    status = response.status;
    return response;
  };
  const page = await safeFetch(url, {
    allowedDomains: options.allowedDomains,
    signal: options.signal,
    lookup: options.lookup,
    fetchImpl,
    userAgent: OFFERS_USER_AGENT,
  });
  return { page, status };
}
