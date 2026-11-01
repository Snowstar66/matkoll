// Story 17.11: which offer pages the scheduled fetch asks for. Pure, so the
// unit tests cover it (tests/scripts/fetch-offers-plan.test.ts). Every user's
// stores with a link to an offer site, one page per link: two users (or two
// stores) with the same link share one request.

import { parseOffersLink, type StoreChain } from "@/features/settings";

/** A store row as the job reads it with the service role; `user_id` is the member the job signs in as (signerOf). */
export type StoreRow = { id: string; user_id: string; chain: string; offers_url: string | null };

/** A member of a household, as the job reads them with the service role. */
export type HouseholdMemberRow = { household_id: string; user_id: string; role: string; joined_at: string };

/**
 * Story 21.2a: who the job signs in as for a store of `householdId`: the
 * member who made it (`makerId`) while they are still in the household, or
 * else the household's owner, or else its longest-standing member. `null`
 * when the household has no member (it is about to go).
 */
export function signerOf(householdId: string, makerId: string | null, members: readonly HouseholdMemberRow[]): string | null {
  const own = members.filter((member) => member.household_id === householdId);
  if (makerId && own.some((member) => member.user_id === makerId)) return makerId;
  const sorted = [...own].sort(
    (a, b) => Number(b.role === "owner") - Number(a.role === "owner") || a.joined_at.localeCompare(b.joined_at) || a.user_id.localeCompare(b.user_id),
  );
  return sorted[0]?.user_id ?? null;
}

/** One page to fetch, the offer site's host, and every store that has its link. */
export type PagePlan = { url: string; host: string; stores: { storeId: string; userId: string }[] };

export type OffersPlan = {
  pages: PagePlan[];
  /** Stores without a link: not fetched. */
  withoutLink: number;
  /** Stores whose link is not a store page on an offer site (or whose chain has none): not fetched. */
  unsupported: number;
};

/**
 * The pages to fetch, in a stable order (by address), each once. A link is
 * the stored form parseOffersLink gives, so the same page typed twice is
 * fetched once; the in-app fetch accepts exactly the same links.
 */
export function planOfferFetches(rows: readonly StoreRow[]): OffersPlan {
  const pages = new Map<string, PagePlan>();
  let withoutLink = 0;
  let unsupported = 0;
  for (const row of rows) {
    if (!row.offers_url) {
      withoutLink++;
      continue;
    }
    const link = parseOffersLink(row.offers_url, row.chain as StoreChain);
    if (!link) {
      unsupported++;
      continue;
    }
    const page = pages.get(link.url) ?? { url: link.url, host: link.site.host, stores: [] };
    if (!page.stores.some((store) => store.storeId === row.id)) page.stores.push({ storeId: row.id, userId: row.user_id });
    pages.set(link.url, page);
  }
  const sorted = [...pages.values()].sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
  return { pages: sorted, withoutLink, unsupported };
}
