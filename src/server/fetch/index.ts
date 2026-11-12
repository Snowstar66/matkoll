import "server-only";
import type { Result } from "@/lib/errors";
import type { Env } from "@/server/env-schema";
import { env } from "@/server/env";
import { fixtureSites } from "./fixture-sites";
import { fetchImageBytes, type ImageFetchResult } from "./image-fetch";
import { fetchOfferPageWith, type OfferPageFetch } from "./offer-page";
import { safeFetch, type FetchImpl, type FetchedPage, type Lookup } from "./safe-fetch";

// Entry point of the fetch port (AD-11). The only code that fetches from
// recipe sites and store offer pages (AD-25); never imports features or
// Supabase, so the caller passes the approved domains (AD-1).

export {
  safeFetch,
  checkLinkSyntax,
  fetchLimits,
  OFFERS_USER_AGENT,
  RECIPES_USER_AGENT,
  BlockedAddressError,
  type FetchImpl,
  type FetchedPage,
  type Lookup,
  type ResolvedAddress,
  type SafeFetchOptions,
} from "./safe-fetch";
export { extractRecipePage, type ExtractedPage } from "./extract";

const localHosts = new Set(["localhost", "127.0.0.1"]);

/**
 * The saved test pages instead of the internet: only with AI_PROVIDER=mock
 * and a SITE_URL on this machine (tests, E2E and CI, and `pnpm dev` without
 * another provider). A production server that was started with the mock by
 * mistake still fetches the real sites and never serves test pages.
 */
export function siteSource(config: Pick<Env, "AI_PROVIDER" | "SITE_URL">): { lookup?: Lookup; fetchImpl?: FetchImpl } {
  if (config.AI_PROVIDER !== "mock") return {};
  let host: string;
  try {
    host = new URL(config.SITE_URL).hostname;
  } catch {
    return {};
  }
  return localHosts.has(host) ? fixtureSites() : {};
}

/** safeFetch for the import flow, with the site source above. */
export function fetchRecipePage(
  url: string,
  options: { allowedDomains: readonly string[]; signal: AbortSignal },
): Promise<Result<FetchedPage>> {
  return safeFetch(url, { ...options, ...siteSource(env) });
}

export { checkImageUrl, imageFetchLimits, type ImageFetchFailure, type ImageFetchResult } from "./image-fetch";

/**
 * A recipe's picture from its image address, for saving it in the app's own
 * storage (recipe-images): fetchImageBytes with the site source above, so the
 * test pages' hosts answer in tests and the real internet otherwise. The bytes
 * are not yet known to be a picture; src/server/images decodes them.
 */
export function fetchRecipeImage(url: string, options: { signal?: AbortSignal } = {}): Promise<ImageFetchResult> {
  return fetchImageBytes(url, { ...options, ...siteSource(env) });
}

export type { OfferPageFetch } from "./offer-page";

/**
 * safeFetch for a store's weekly offers (Story 9.1, AD-25): exactly one call,
 * with OFFERS_USER_AGENT and the site source above. The caller passes the
 * offer sites' hosts (settings' OFFER_SITE_DOMAINS) and the address stored
 * for the store; nothing here retries.
 */
export function fetchOfferPage(
  url: string,
  options: { allowedDomains: readonly string[]; signal: AbortSignal },
): Promise<OfferPageFetch> {
  return fetchOfferPageWith(url, { ...options, ...siteSource(env) });
}
