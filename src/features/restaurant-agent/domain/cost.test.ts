import { describe, expect, it } from "vitest";
import { checkCap, costSek, maxSearchesPerRun, mayStartSearch, noUsage, runCapSek, usdPerPlacesRequest, usdPerSearch } from "./cost";

const haiku = { usdPerMTokIn: 0.1, usdPerMTokOut: 0.5 };
const sonnet = { usdPerMTokIn: 2, usdPerMTokOut: 10 };

describe("costSek", () => {
  it("is 0 for nothing", () => {
    expect(costSek(haiku, noUsage)).toBe(0);
  });
  it("uses the list prices: 10 USD per 1000 searches, 35 USD per 1000 Places requests, 10 kr per USD", () => {
    expect(usdPerSearch).toBeCloseTo(0.01);
    expect(usdPerPlacesRequest).toBeCloseTo(0.035);
    expect(costSek(haiku, { ...noUsage, searches: 1 })).toBeCloseTo(0.1);
    expect(costSek(haiku, { ...noUsage, placesRequests: 1 })).toBeCloseTo(0.35);
    expect(costSek(haiku, { ...noUsage, placesRequests: 2, searches: 2 })).toBeCloseTo(0.9);
  });
  it("counts tokens by model", () => {
    const usage = { ...noUsage, tokensIn: 20_000, tokensOut: 2_000 };
    expect(costSek(haiku, usage)).toBeCloseTo(0.03);
    expect(costSek(sonnet, usage)).toBeCloseTo(0.6);
  });
  it("a typical run (1 Places, 2 searches, 20k in, 2k out) fits the 2 kr cap on Haiku, and on Sonnet", () => {
    const run = { tokensIn: 20_000, tokensOut: 2_000, searches: maxSearchesPerRun, placesRequests: 1 };
    expect(costSek(haiku, run)).toBeCloseTo(0.58, 2);
    expect(costSek(sonnet, run)).toBeCloseTo(1.15, 2);
    expect(costSek(sonnet, run)).toBeLessThan(runCapSek);
  });
});

describe("checkCap", () => {
  it("allows a step within both caps", () => {
    expect(checkCap(0.5, 0.5, 10)).toEqual({ ok: true });
    expect(checkCap(1.5, 0.5, 10)).toEqual({ ok: true });
  });
  it("stops at the run cap of 2 kr", () => {
    expect(checkCap(1.8, 0.3, 10)).toEqual({ ok: false, cap: "run" });
  });
  it("stops at what is left of the day, which wins over the run cap", () => {
    expect(checkCap(0, 0.5, 0.2)).toEqual({ ok: false, cap: "day" });
    expect(checkCap(1.9, 0.5, 0.2)).toEqual({ ok: false, cap: "day" });
  });
});

describe("mayStartSearch", () => {
  it("allows two searches, not a third", () => {
    expect(mayStartSearch(0, 0, 10)).toEqual({ ok: true });
    expect(mayStartSearch(1, 0.4, 10)).toEqual({ ok: true });
    expect(mayStartSearch(2, 0.4, 10)).toEqual({ ok: false, cap: "searches" });
  });
  it("respects the caps", () => {
    expect(mayStartSearch(0, 1.95, 10)).toEqual({ ok: false, cap: "run" });
    expect(mayStartSearch(0, 0, 0.05)).toEqual({ ok: false, cap: "day" });
  });
});
