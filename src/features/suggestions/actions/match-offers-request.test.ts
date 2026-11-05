import { describe, expect, it } from "vitest";
import { buildOfferMatchRequest, offerLinks } from "./match-offers-request";

const offer = (id: string, label: string, name = label.toLowerCase(), ingredientId: string | null = null) => ({ id, label, name, ingredientId });
const catalog = [
  { id: "cheese", name: "ost" },
  { id: "butter", name: "smör" },
  { id: "rice", name: "ris" },
];

describe("buildOfferMatchRequest", () => {
  it("asks only about offers without an ingredient, one line per name, the labels as the store writes them", () => {
    const request = buildOfferMatchRequest(
      [offer("1", "Herrgård, Präst"), offer("2", "Bregott"), offer("3", "Herrgård, Präst"), offer("4", "Laxfilé", "laxfilé", "salmon")],
      catalog,
      new Set(),
    );
    expect(request?.input.offers).toEqual(["Herrgård, Präst", "Bregott"]);
    expect(request?.offerGroups).toEqual([["1", "3"], ["2"]]);
  });

  it("puts the ingredients the recipes use first", () => {
    const request = buildOfferMatchRequest([offer("1", "Bregott")], catalog, new Set(["rice"]));
    expect(request?.input.ingredients).toEqual(["ris", "ost", "smör"]);
    expect(request?.ingredientIds).toEqual(["rice", "cheese", "butter"]);
  });

  it("has nothing to ask without open offers or without ingredients", () => {
    expect(buildOfferMatchRequest([offer("1", "Laxfilé", "laxfilé", "salmon")], catalog, new Set())).toBeNull();
    expect(buildOfferMatchRequest([offer("1", "Bregott")], [], new Set())).toBeNull();
  });

  it("keeps at most 60 offers and cleans a label to one line", () => {
    const many = Array.from({ length: 80 }, (_, index) => offer(String(index), `Vara ${index}`));
    expect(buildOfferMatchRequest(many, catalog, new Set())?.input.offers).toHaveLength(60);
    expect(buildOfferMatchRequest([offer("1", "Bre\ngott")], catalog, new Set())?.input.offers).toEqual(["Bre gott"]);
  });
});

describe("offerLinks", () => {
  const request = { offerGroups: [["1", "3"], ["2"], ["4"]], ingredientIds: ["cheese", "butter"] };

  it("gives the offers of each ingredient, a name in several stores together", () => {
    expect(
      offerLinks(request, [
        { offer: 0, ingredient: 0 },
        { offer: 1, ingredient: 1 },
        { offer: 2, ingredient: 0 },
      ]),
    ).toEqual([
      { ingredientId: "cheese", offerIds: ["1", "3", "4"] },
      { ingredientId: "butter", offerIds: ["2"] },
    ]);
  });

  it("leaves out a pair outside the lists", () => {
    expect(offerLinks(request, [{ offer: 5, ingredient: 0 }, { offer: 0, ingredient: 9 }])).toEqual([]);
  });
});
