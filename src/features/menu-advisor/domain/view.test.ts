import { describe, expect, it } from "vitest";
import { pickId, parsePicks, summarizePicks, togglePick, type TonightPick } from "./tonight";
import type { MenuDish } from "./types";
import { currencySymbols, dishSek, filterDishes, groupDishes, matchDish, noFilter, parseDislikes, priceText } from "./view";

const dish = (patch: Partial<MenuDish> = {}): MenuDish => ({
  originalnamn: "Pollo a la plancha",
  grupp: "Varmrätt",
  forklaring: "Grillad kyckling.",
  huvudingredienser: ["kyckling", "citron"],
  kategori: "kott",
  allergener: [],
  kan_innehalla: [],
  pris: 15,
  valuta: "EUR",
  ...patch,
});

describe("groupDishes", () => {
  it("orders the groups as on a menu, skips empty ones and keeps the dishes' order", () => {
    const groups = groupDishes([
      dish({ originalnamn: "A", grupp: "Drycker" }),
      dish({ originalnamn: "B", grupp: "Förrätt" }),
      dish({ originalnamn: "C", grupp: "Drycker" }),
      dish({ originalnamn: "D", grupp: "Efterrätt" }),
    ]);
    expect(groups.map((entry) => entry.group)).toEqual(["Förrätt", "Efterrätt", "Drycker"]);
    expect(groups[2].dishes.map((entry) => entry.originalnamn)).toEqual(["A", "C"]);
  });
});

describe("priceText", () => {
  it("shows the menu's currency and about so many kronor", () => {
    expect(priceText(dish({ pris: 14.5, valuta: "EUR" }))).toBe("14,50 € · ca 160 kr");
    expect(priceText(dish({ pris: 15, valuta: "EUR" }))).toBe("15 € · ca 165 kr");
  });
  it("shows kronor as they are, and nothing without a price", () => {
    expect(priceText(dish({ pris: 185, valuta: "SEK" }))).toBe("185 kr");
    expect(priceText(dish({ pris: null, valuta: null }))).toBe("");
  });
  it("shows an unknown currency by its code, without a conversion", () => {
    expect(priceText(dish({ pris: 90, valuta: "NOK" }))).toBe("90 NOK");
    expect(dishSek(dish({ pris: 90, valuta: "NOK" }))).toBeNull();
  });
  it("names the currencies the prices are in", () => {
    expect(currencySymbols([dish(), dish({ valuta: "GBP" }), dish({ pris: null }), dish()])).toEqual(["€", "£"]);
  });
});

describe("filterDishes", () => {
  const dishes = [
    dish({ originalnamn: "Paella de verduras", kategori: "vegetariskt", pris: 15 }),
    dish({ originalnamn: "Gambas", kategori: "skaldjur", allergener: ["skaldjur"], pris: 12 }),
    dish({ originalnamn: "Solomillo", pris: 24 }),
    dish({ originalnamn: "Pan", pris: null }),
  ];
  it("keeps everything without a filter", () => {
    expect(filterDishes(dishes, noFilter)).toHaveLength(4);
  });
  it("searches names, explanations and ingredients, ignoring case", () => {
    expect(filterDishes(dishes, { ...noFilter, query: "GAMB" }).map((entry) => entry.originalnamn)).toEqual(["Gambas"]);
    expect(filterDishes(dishes, { ...noFilter, query: "citron" })).toHaveLength(4);
  });
  it("filters vegetarian, without shellfish and under a price in kronor", () => {
    expect(filterDishes(dishes, { ...noFilter, vegetarian: true }).map((entry) => entry.originalnamn)).toEqual(["Paella de verduras"]);
    expect(filterDishes(dishes, { ...noFilter, noShellfish: true }).map((entry) => entry.originalnamn)).not.toContain("Gambas");
    // 15 € is about 165 kr, 12 € about 132 kr, 24 € about 264 kr, and no price is never "under".
    expect(filterDishes(dishes, { ...noFilter, underSek: 200 }).map((entry) => entry.originalnamn)).toEqual(["Paella de verduras", "Gambas"]);
  });
});

describe("matchDish", () => {
  it("reports both 'contains' and 'may contain' hits, and the disliked words found", () => {
    const match = matchDish(
      dish({ originalnamn: "Paella", allergener: ["skaldjur"], kan_innehalla: ["notter"], huvudingredienser: ["ris", "svamp"] }),
      ["skaldjur", "notter", "soja"],
      ["Svamp", "koriander"],
    );
    expect(match.hits).toEqual([
      { allergen: "skaldjur", source: "allergener" },
      { allergen: "notter", source: "kan_innehalla" },
    ]);
    expect(match.disliked).toEqual(["Svamp"]);
  });
  it("splits typed dislikes on commas and line breaks", () => {
    expect(parseDislikes(" svamp, koriander;\nlever ,, svamp")).toEqual(["svamp", "koriander", "lever"]);
  });
});

describe("Ikväll", () => {
  const pick = (name: string, sek: number | null): TonightPick => ({ id: pickId("Taverna", name), name, explanation: "", restaurant: "Taverna", sek });
  it("stars and unstars a dish", () => {
    const one = pick("A", 100);
    expect(togglePick([], one)).toEqual([one]);
    expect(togglePick([one], one)).toEqual([]);
  });
  it("sums the priced dishes and counts those without a price", () => {
    expect(summarizePicks([pick("A", 165), pick("B", 90), pick("C", null)])).toEqual({ count: 3, totalSek: 255, unpriced: 1 });
    expect(summarizePicks([])).toEqual({ count: 0, totalSek: 0, unpriced: 0 });
  });
  it("reads stored picks, and gives none for junk", () => {
    const one = pick("A", 100);
    expect(parsePicks(JSON.stringify([one, { id: 1 }]))).toEqual([one]);
    expect(parsePicks("{not json")).toEqual([]);
    expect(parsePicks(null)).toEqual([]);
  });
});
