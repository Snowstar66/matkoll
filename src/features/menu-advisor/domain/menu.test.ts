import { describe, expect, it } from "vitest";
import { allergenHits } from "./allergens";
import { approxRatesDate, approxSekRates, currencyFromText, toSek } from "./currency";
import { allergyDisclaimer } from "./disclaimer";
import { normalizeMenu } from "./normalize";
import type { MenuDish, RawMenu } from "./types";

const dish = (patch: Partial<MenuDish> = {}): MenuDish => ({
  originalnamn: "Pulpo",
  grupp: "Förrätt",
  forklaring: "Bläckfisk.",
  huvudingredienser: ["bläckfisk"],
  kategori: "skaldjur",
  allergener: [],
  kan_innehalla: [],
  pris: 17.95,
  valuta: "SEK",
  ...patch,
});
const menu = (ratter: MenuDish[], symbol: string | null = null): RawMenu => ({
  restaurang: null,
  sprak: "en",
  valutasymbol_pa_menyn: symbol,
  ratter,
  osakert: [],
});

describe("normalizeMenu currency", () => {
  it("lets the symbol on the menu win over the model's currency (a menu with €17.95 read as SEK)", () => {
    const result = normalizeMenu(menu([dish({ valuta: "SEK" }), dish({ pris: 9, valuta: "USD" })], "€"));
    expect(result.ratter.map((d) => d.valuta)).toEqual(["EUR", "EUR"]);
  });

  it.each([
    ["€", "EUR"],
    ["kr", "SEK"],
    ["£", "GBP"],
    ["$", "USD"],
  ])("normalizes the symbol %s to %s", (symbol, code) => {
    expect(normalizeMenu(menu([dish({ valuta: null })], symbol)).ratter[0]!.valuta).toBe(code);
  });

  it("fills a missing currency with the menu's dominant one when there is no symbol", () => {
    const result = normalizeMenu(menu([dish({ valuta: "EUR" }), dish({ valuta: "EUR" }), dish({ valuta: null }), dish({ valuta: "SEK" })]));
    expect(result.ratter.map((d) => d.valuta)).toEqual(["EUR", "EUR", "EUR", "SEK"]);
  });

  it("leaves a priced row without any currency evidence at null, and a row without price has no currency", () => {
    const result = normalizeMenu(menu([dish({ valuta: null }), dish({ pris: null, valuta: "EUR" })]));
    expect(result.ratter.map((d) => d.valuta)).toEqual([null, null]);
  });

  it("turns prices that are not positive numbers into null", () => {
    const result = normalizeMenu(menu([dish({ pris: 0 }), dish({ pris: -3 }), dish({ pris: Number.NaN })], "kr"));
    expect(result.ratter.map((d) => [d.pris, d.valuta])).toEqual([[null, null], [null, null], [null, null]]);
  });

  it("does not repeat an allergen in kan_innehalla or in either list", () => {
    const result = normalizeMenu(menu([dish({ allergener: ["gluten", "gluten"], kan_innehalla: ["gluten", "soja"] })]));
    expect(result.ratter[0]).toMatchObject({ allergener: ["gluten"], kan_innehalla: ["soja"] });
  });
});

describe("currencyFromText", () => {
  it("knows symbols and codes in any case, and nothing else", () => {
    expect(currencyFromText(" EUR ")).toBe("EUR");
    expect(currencyFromText("Kr.")).toBe("SEK");
    expect(currencyFromText("¥")).toBeNull();
    expect(currencyFromText(null)).toBeNull();
  });
});

describe("allergenHits", () => {
  const d = dish({ allergener: ["gluten", "agg"], kan_innehalla: ["soja", "gluten"] });

  it("counts both allergener and kan_innehalla as hits and says which", () => {
    expect(allergenHits(d, ["soja", "agg", "notter"])).toEqual([
      { allergen: "soja", source: "kan_innehalla" },
      { allergen: "agg", source: "allergener" },
    ]);
  });

  it("reports an allergen in both lists once, as allergener", () => {
    expect(allergenHits(d, ["gluten", "gluten"])).toEqual([{ allergen: "gluten", source: "allergener" }]);
  });

  it("has no hits when nothing is avoided or nothing matches", () => {
    expect(allergenHits(d, [])).toEqual([]);
    expect(allergenHits(d, ["sesam"])).toEqual([]);
  });
});

describe("toSek", () => {
  it("converts at the approximate rates, rounded to whole kronor", () => {
    expect(toSek(17.95, "EUR")).toBe(Math.round(17.95 * approxSekRates.EUR));
    expect(toSek(10, "gbp")).toBe(130);
    expect(toSek(10, "USD")).toBe(100);
    expect(toSek(149, "SEK")).toBe(149);
  });

  it("is null without a price, without a currency or with an unknown one", () => {
    expect(toSek(null, "EUR")).toBeNull();
    expect(toSek(10, null)).toBeNull();
    expect(toSek(10, "JPY")).toBeNull();
    expect(toSek(Number.NaN, "EUR")).toBeNull();
  });

  it("takes its own rate table", () => {
    expect(toSek(10, "EUR", { EUR: 12 })).toBe(120);
  });

  it("says when the rates are from", () => {
    expect(approxRatesDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("allergyDisclaimer", () => {
  it("never promises safety and tells the reader to ask the staff", () => {
    expect(allergyDisclaimer).toContain("gissning");
    expect(allergyDisclaimer).toContain("personalen");
    expect(allergyDisclaimer.toLowerCase()).not.toContain("säker");
  });
});
