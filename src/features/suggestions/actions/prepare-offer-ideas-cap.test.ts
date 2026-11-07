import { beforeEach, describe, expect, it, vi } from "vitest";

// Tak för AI-kostnad: the scheduled job skips a household that has reached its daily AI cap quietly,
// before it claims the set, so no failed set is saved and nothing is shown to the household.

const isAiCapReached = vi.fn();
vi.mock("@/features/settings/server", () => ({ isAiCapReached: () => isAiCapReached(), listStores: vi.fn(), SettingsDataError: class extends Error {} }));
vi.mock("@/features/offers/server", () => ({ getActiveOffers: vi.fn(), OffersDataError: class extends Error {} }));
vi.mock("@/features/recipes/server", () => ({ listRecipeTitles: vi.fn(), RecipeDataError: class extends Error {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const claimSetIn = vi.fn();
vi.mock("../data/offer-idea-set", () => ({ claimSetIn: (...args: unknown[]) => claimSetIn(...args), failSetIn: vi.fn(), finishSetIn: vi.fn(), loadSetIn: vi.fn(), OfferIdeaSetError: class extends Error {} }));
vi.mock("./suggest-from-pantry", () => ({ suggestFromPantry: vi.fn() }));

const { prepareOfferIdeasNow } = await import("./offer-idea-set");

beforeEach(() => {
  isAiCapReached.mockReset();
  claimSetIn.mockReset();
});

describe("prepareOfferIdeasNow and the AI cap", () => {
  it("skips a capped household before claiming anything", async () => {
    isAiCapReached.mockResolvedValue(true);
    expect(await prepareOfferIdeasNow()).toBe("skipped");
    expect(claimSetIn).not.toHaveBeenCalled();
  });
});
