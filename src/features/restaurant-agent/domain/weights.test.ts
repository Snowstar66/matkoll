import { describe, expect, it } from "vitest";
import type { Candidate, RestaurantSettings } from "./types";
import { defaultRestaurantSettings } from "./types";
import { distanceScore, householdFit, rankCandidates, sugenPaBonus, sugenPaWeight } from "./weights";

const place = (placeId: string, kind: Candidate["kind"], distanceM: number): Candidate => ({ placeId, kind, distanceM });
const settings = (patch: Partial<RestaurantSettings> = {}): RestaurantSettings => ({ ...defaultRestaurantSettings, cuisines: [], priorities: [], ...patch });

describe("sugenPaWeight", () => {
  it("favours a picked niche only", () => {
    expect(sugenPaWeight("pizza", ["pizza"])).toBe(sugenPaBonus);
    expect(sugenPaWeight("sushi", ["pizza"])).toBe(0);
    expect(sugenPaWeight("restaurant", ["pizza"])).toBe(0);
    expect(sugenPaWeight("pizza", [])).toBe(0);
  });
});

describe("householdFit", () => {
  it("is 0 with nobody or no opinion", () => {
    expect(householdFit("pizza", [])).toBe(0);
    expect(householdFit("pizza", [{ tastes: {} }])).toBe(0);
    expect(householdFit("other", [{ tastes: { pizza: 2 } }])).toBe(0);
  });
  it("averages over people and counts a hated key harder", () => {
    expect(householdFit("pizza", [{ tastes: { pizza: 2 } }, { tastes: { pizza: 0 } }])).toBe(1);
    expect(householdFit("pizza", [{ tastes: { pizza: -2 } }])).toBe(-4);
    expect(householdFit("pizza", [{ tastes: { pizza: -1 } }])).toBe(-1);
  });
  it("averages over a cuisine's keys", () => {
    expect(householdFit("fisk", [{ tastes: { fisk: 2 } }])).toBe(1);
    expect(householdFit("fisk", [{ tastes: { fisk: 2, skaldjur: 2 } }])).toBe(2);
  });
});

describe("distanceScore", () => {
  it("falls from 2 to 0 over the radius", () => {
    expect(distanceScore(0, 1000)).toBe(2);
    expect(distanceScore(500, 1000)).toBe(1);
    expect(distanceScore(1000, 1000)).toBe(0);
    expect(distanceScore(5000, 1000)).toBe(0);
    expect(distanceScore(NaN, 1000)).toBe(0);
  });
});

describe("rankCandidates", () => {
  const near = place("a", "restaurant", 100);
  const pizza = place("b", "pizza", 800);
  const far = place("c", "sushi", 4000);

  it("puts the picked niche first despite distance", () => {
    expect(rankCandidates([near, pizza], settings({ cuisines: ["pizza"] }), []).map((r) => r.candidate.placeId)).toEqual(["b", "a"]);
  });
  it("orders by distance when nothing else counts, and drops those outside the radius", () => {
    expect(rankCandidates([pizza, near, far], settings(), []).map((r) => r.candidate.placeId)).toEqual(["a", "b"]);
    expect(rankCandidates([far], settings({ radiusM: 5000 }), []).map((r) => r.candidate.placeId)).toEqual(["c"]);
  });
  it("lets the household's taste lift or lower a cuisine, never hide it", () => {
    const people = [{ tastes: { pizza: -2 } }];
    const ranked = rankCandidates([pizza, near], settings(), people);
    expect(ranked.map((r) => r.candidate.placeId)).toEqual(["a", "b"]);
    const loved = rankCandidates([pizza, near], settings(), [{ tastes: { pizza: 2 } }]);
    expect(loved.map((r) => r.candidate.placeId)).toEqual(["b", "a"]);
  });
  it("keeps the finder's order on ties", () => {
    const x = place("x", "restaurant", 500);
    const y = place("y", "restaurant", 500);
    expect(rankCandidates([x, y], settings(), []).map((r) => r.candidate.placeId)).toEqual(["x", "y"]);
  });
});
