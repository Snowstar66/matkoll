import { describe, expect, it } from "vitest";
import { dropSavedIdeas, maxOfferIdeas, parseSavedIdeas, staleSetMs, toOfferIdeasView } from "./offer-idea-set";

const now = new Date("2026-11-06T12:00:00Z");
const saved = (n: number, title: string) => ({
  draft: { title, servings: 4, totalMinutes: 30, imageUrl: null, sourceKind: "ai", sourceUrl: null, steps: [], lines: [] },
  ingredientNames: {},
  why: "Billig.",
  onOffer: [],
  atHome: null,
  toBuy: [],
  oldUsed: [],
  recipeId: `00000000-0000-4000-8000-00000000000${n}`,
});
const row = (overrides: Partial<{ status: string; claimedAt: string; intro: string; ideas: unknown; errorCode: string | null }> = {}) => ({
  status: "ready",
  claimedAt: now.toISOString(),
  intro: "Billigt i veckan.",
  ideas: [saved(1, "Falukorv med potatismos"), saved(2, "Broccolisoppa")],
  errorCode: null,
  ...overrides,
});

describe("parseSavedIdeas", () => {
  it("keeps the ideas that pass the schema and leaves out the rest", () => {
    expect(parseSavedIdeas([saved(1, "A"), { draft: "nej" }, null]).map((idea) => idea.draft.title)).toEqual(["A"]);
    expect(parseSavedIdeas("inte en lista")).toEqual([]);
  });

  it("refuses an idea without a recipe id", () => {
    expect(parseSavedIdeas([{ ...saved(1, "A"), recipeId: "x" }])).toEqual([]);
  });
});

describe("dropSavedIdeas", () => {
  it("drops an idea whose title is a recipe already, ignoring case and spacing, and keeps at most three", () => {
    const ideas = ["A", "B", "C", "D", "E"].map((title) => ({ draft: { title } }));
    expect(dropSavedIdeas(ideas, [" b "]).map((idea) => idea.draft.title)).toEqual(["A", "C", "D"]);
    expect(dropSavedIdeas(ideas, [])).toHaveLength(maxOfferIdeas);
  });
});

describe("toOfferIdeasView", () => {
  it("is none without a row, and the first view then starts one", () => {
    expect(toOfferIdeasView(null, [], now)).toMatchObject({ hasOffers: true, state: "none", ideas: [] });
  });

  it("is pending while a run holds the set, and none again when its claim is stale", () => {
    expect(toOfferIdeasView(row({ status: "pending" }), [], now).state).toBe("pending");
    const old = new Date(now.getTime() - staleSetMs - 1000).toISOString();
    expect(toOfferIdeasView(row({ status: "pending", claimedAt: old }), [], now).state).toBe("none");
  });

  it("is failed with the error code, and no ideas", () => {
    expect(toOfferIdeasView(row({ status: "failed", errorCode: "ai_invalid", ideas: [] }), [], now)).toMatchObject({
      state: "failed",
      errorCode: "ai_invalid",
      ideas: [],
    });
  });

  it("is ready with the intro and the ideas that are not recipes yet", () => {
    const view = toOfferIdeasView(row(), ["Falukorv med potatismos"], now);
    expect(view.state).toBe("ready");
    expect(view.intro).toBe("Billigt i veckan.");
    expect(view.ideas.map((idea) => idea.draft.title)).toEqual(["Broccolisoppa"]);
  });

  it("drops the intro when every idea is saved already", () => {
    const view = toOfferIdeasView(row(), ["Falukorv med potatismos", "Broccolisoppa"], now);
    expect(view).toMatchObject({ state: "ready", intro: "", ideas: [] });
  });

  it("is none for a status it does not know", () => {
    expect(toOfferIdeasView(row({ status: "weird" }), [], now).state).toBe("none");
  });
});
