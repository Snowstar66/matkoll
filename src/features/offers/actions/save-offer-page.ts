import "server-only";
import type { IngredientMatch, IngredientSummary, MatchItem } from "@/features/catalog";
import { fail, ok, type Result } from "@/lib/errors";
import type { OffersDb } from "../data/client";
import { saveOffersIn } from "../data/save";
import { foodSection } from "../domain/ica-offer-page";
import { toOfferDraft } from "../domain/offer";
import type { OfferName } from "../domain/offer-name";
import type { OfferPageRead, OfferWeek } from "../domain/offer-page-read";

// The second half of fetching a store's offers (Story 9.1, AD-25): a page
// that has been read is matched against the user's catalog and saved for the
// store. Not a server action: the in-app fetch (fetch-store-offers.ts) calls
// it with the session client and the catalog's session functions, and the
// scheduled fetch (Story 17.11, scripts/fetch-offers.ts) with a client signed
// in as each user who has the store. The catalog is passed in, so the same
// code runs outside a request (AD-1).

/** The catalog functions the matching needs, bound to the user whose store it is. They throw on failure. */
export type OfferCatalog = {
  match: (items: readonly MatchItem[]) => Promise<IngredientMatch[]>;
  summaries: (ids: readonly string[]) => Promise<Record<string, IngredientSummary>>;
};

/** What was saved for a week: the offers the store now has for it, how many matched an ingredient and how many had a regular price. */
export type SavedOfferWeek = { weekStart: string; saved: number; matched: number; withRegularPrice: number };

/** The catalog ingredient for each offer: its first name that matched exactly or as a synonym. */
async function matchOffers(names: readonly OfferName[], catalog: OfferCatalog) {
  const items = names.flatMap((name) => name.candidates.map((text) => ({ text })));
  const matches: IngredientMatch[] = items.length > 0 ? await catalog.match(items) : [];
  let at = 0;
  const found = names.map((name) => {
    let hit: { name: string; ingredientId: string } | null = null;
    for (const candidate of name.candidates) {
      const match = matches[at++];
      if (!hit && match?.kind === "match" && match.confidence !== "hint") hit = { name: candidate, ingredientId: match.ingredientId };
    }
    return { label: name.label, name: hit?.name ?? name.fallback, ingredientId: hit?.ingredientId ?? null };
  });
  const ids = [...new Set(found.flatMap((entry) => (entry.ingredientId ? [entry.ingredientId] : [])))];
  const summaries = ids.length > 0 ? await catalog.summaries(ids) : {};
  return found.map((entry) => ({
    ...entry,
    section: (entry.ingredientId ? summaries[entry.ingredientId]?.section : undefined) ?? null,
  }));
}

/**
 * Matches one week's offers against the catalog and saves them for the store,
 * replacing that week's earlier link offers (so a new run updates, never
 * duplicates). Gives the counts, or `offers_page_old` (the database refused
 * the week), `offers_limit`, `offers_store_missing` or `offers_failed`.
 * Throws what `catalog` throws.
 */
export async function saveOfferWeekIn(
  db: OffersDb,
  input: { storeId: string; week: OfferWeek },
  catalog: OfferCatalog,
): Promise<Result<SavedOfferWeek>> {
  const { storeId, week } = input;
  const matches = await matchOffers(
    week.entries.map((entry) => entry.name),
    catalog,
  );
  const drafts = week.entries.map((entry, index) =>
    toOfferDraft(entry.offer, { ...matches[index], icaSection: foodSection(entry.offer.category) }),
  );
  const saved = await saveOffersIn(db, { storeId, weekStart: week.weekStart, items: drafts, replaceSource: "link" });
  if (!saved.ok) {
    if (saved.error.code !== "offers_week_invalid") return saved;
    console.error("offers_page_old", { reason: "week_refused" });
    return fail("offers_page_old");
  }
  return ok({
    weekStart: week.weekStart,
    saved: saved.data,
    matched: drafts.filter((draft) => draft.ingredientId !== null).length,
    withRegularPrice: drafts.filter((draft) => draft.regularPrice !== null).length,
  });
}

/**
 * Saves every week the page gave (Story 17.11: on a Sunday also next week),
 * oldest first, and gives the newest week's counts, the week the sheet shows.
 * Stops at the first week that fails and gives its error; a week saved
 * before it stays saved. Throws what `catalog` throws.
 */
export async function saveOfferPageIn(
  db: OffersDb,
  input: { storeId: string; read: OfferPageRead },
  catalog: OfferCatalog,
): Promise<Result<SavedOfferWeek>> {
  let last: Result<SavedOfferWeek> = fail("offers_none");
  for (const week of input.read.weeks) {
    last = await saveOfferWeekIn(db, { storeId: input.storeId, week }, catalog);
    if (!last.ok) return last;
  }
  return last;
}
