import "server-only";
import type { Result } from "@/lib/errors";
import type { Env } from "@/server/env-schema";
import { env } from "@/server/env";
import { fixtureSites } from "./fixture-sites";
import { safeFetch, type FetchImpl, type FetchedPage, type Lookup } from "./safe-fetch";

// Entry point of the fetch port (AD-11). The only code that fetches from
// recipe sites; never imports features or Supabase, so the caller passes the
// approved domains (AD-1).

export {
  safeFetch,
  checkLinkSyntax,
  fetchLimits,
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
