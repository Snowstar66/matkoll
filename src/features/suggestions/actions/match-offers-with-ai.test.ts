import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";

// matchOffersWithAi with stubbed modules and an in-memory store of the offers'
// ai_matched_at (Story 9.10): an offer the AI answered "none" for is not asked
// about again, a failed call gives the claim back, and a second claim at the
// same time gets nothing.

vi.mock("@/features/auth/server", () => ({ requireUser: async () => ({ ok: true, data: { id: "u" } }) }));
vi.mock("@/lib/revalidate", () => ({ revalidateFor: vi.fn() }));
const { Boom } = vi.hoisted(() => ({
  Boom: class Boom extends Error {
    detail = "x";
  },
}));

type Offer = { id: string; storeId: string; label: string; name: string; ingredientId: string | null; source: string; aiMatchedAt: string | null };
let offers: Offer[] = [];
const matchOffers = vi.fn();

vi.mock("@/features/settings/server", () => ({
  SettingsDataError: Boom,
  listStores: async () => [{ id: "s1" }],
  getAiServiceForUser: async () => ({ matchOffers }),
}));
vi.mock("@/features/catalog/server", () => ({
  CatalogDataError: Boom,
  listIngredients: async () => [{ id: "cheese", name: "ost" }],
  getIngredientSummaries: async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { name: "ost", section: "Mejeri" }])),
}));
vi.mock("@/features/recipes/server", () => ({ RecipeDataError: Boom, listRecipeRows: async () => [] }));
vi.mock("@/features/offers/server", () => ({
  OffersDataError: Boom,
  getActiveOffers: async () => offers.map((offer) => ({ ...offer })),
  claimOffersForAi: async (ids: string[]) => {
    const claimed = offers.filter((offer) => ids.includes(offer.id) && !offer.aiMatchedAt);
    for (const offer of claimed) offer.aiMatchedAt = "2026-11-05T10:00:00Z";
    return claimed.map((offer) => offer.id);
  },
  releaseOffersForAi: async (ids: string[]) => {
    for (const offer of offers) if (ids.includes(offer.id)) offer.aiMatchedAt = null;
  },
  linkOffersToIngredient: async ({ offerIds, ingredientId }: { offerIds: string[]; ingredientId: string }) => {
    for (const offer of offers) if (offerIds.includes(offer.id)) offer.ingredientId = ingredientId;
    return ok(offerIds.length);
  },
}));

const { matchOffersWithAi } = await import("./match-offers-with-ai");

const offer = (id: string, name: string): Offer => ({ id, storeId: "s1", label: name, name, ingredientId: null, source: "link", aiMatchedAt: null });

beforeEach(() => {
  offers = [offer("1", "herrgård"), offer("2", "diskmedel")];
  matchOffers.mockReset().mockResolvedValue(ok({ pairs: [{ offer: 0, ingredient: 0 }] }));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("matchOffersWithAi", () => {
  it("links what the AI found and does not ask again about an offer it found nothing for", async () => {
    expect(await matchOffersWithAi()).toEqual(ok({ linked: 1, open: 1 }));
    expect(matchOffers).toHaveBeenCalledTimes(1);
    expect(matchOffers.mock.calls[0][0].offers).toEqual(["herrgård", "diskmedel"]);
    expect(offers.map((entry) => entry.ingredientId)).toEqual(["cheese", null]);
    // The second visit: "diskmedel" was answered "none" and is stamped, so no call at all.
    expect(await matchOffersWithAi()).toEqual(ok({ linked: 0, open: 0 }));
    expect(matchOffers).toHaveBeenCalledTimes(1);
  });

  it("gives the claim back when the AI does not answer, so the next visit asks again", async () => {
    matchOffers.mockResolvedValueOnce(fail("ai_unavailable"));
    expect(await matchOffersWithAi()).toEqual(ok({ linked: 0, open: 2 }));
    expect(offers.map((entry) => entry.aiMatchedAt)).toEqual([null, null]);
    await matchOffersWithAi();
    expect(matchOffers).toHaveBeenCalledTimes(2);
    matchOffers.mockRejectedValueOnce(new Error("down"));
    offers = [offer("3", "smör")];
    expect(await matchOffersWithAi()).toEqual(ok({ linked: 0, open: 1 }));
    expect(offers[0].aiMatchedAt).toBeNull();
  });

  it("asks once when two visits run at the same time", async () => {
    const [a, b] = await Promise.all([matchOffersWithAi(), matchOffersWithAi()]);
    expect(matchOffers).toHaveBeenCalledTimes(1);
    expect([a, b].filter((result) => result.ok && result.data.linked === 1)).toHaveLength(1);
  });
});
