import { describe, expect, it } from "vitest";
import { approxDrinkSek, drinkPrice, estimateTotalSek } from "./drinks";
import { dish, menuOf, person } from "./fixtures";

const drinks = menuOf([
  dish({ originalnamn: "Biff", pris: 15, valuta: "EUR" }),
  dish({ originalnamn: "Fiskgryta", pris: 100, valuta: "SEK", kategori: "fisk" }),
  dish({ originalnamn: "Cerveza", grupp: "Drycker", pris: 4, valuta: "EUR" }),
  dish({ originalnamn: "Vino tinto copa", grupp: "Drycker", pris: 5, valuta: "EUR" }),
  dish({ originalnamn: "Vino tinto botella", grupp: "Drycker", pris: 20, valuta: "EUR" }),
]);

describe("drinkPrice", () => {
  it("uses the menu's price before the table, converted to kronor", () => {
    expect(drinkPrice(drinks, "ol")).toEqual({ sek: 44, source: "meny" });
  });

  it("takes the glass price, not the bottle", () => {
    expect(drinkPrice(drinks, "vin")).toEqual({ sek: 55, source: "meny" });
  });

  it("falls back to the rough table", () => {
    expect(drinkPrice(drinks, "cocktail")).toEqual({ sek: approxDrinkSek.cocktail, source: "uppskattning" });
    expect(drinkPrice(drinks, "ingen")).toEqual({ sek: 0, source: "uppskattning" });
  });

  it("does not take a word that merely starts with the keyword", () => {
    const menu = menuOf([dish({ originalnamn: "Vinägrett", grupp: "Drycker", pris: 9, valuta: "SEK" })]);
    expect(drinkPrice(menu, "vin").source).toBe("uppskattning");
  });
});

describe("estimateTotalSek", () => {
  const anna = person({ id: "a", name: "Anna", drink: "ol" });
  const bo = person({ id: "b", name: "Bo", drink: "cocktail" });
  const cia = person({ id: "c", name: "Cia", drink: null });
  const selection = [
    { personId: "a", dish: drinks.ratter[0] },
    { personId: "b", dish: drinks.ratter[1] },
    { personId: "c", dish: drinks.ratter[1] },
  ];

  it("adds dishes and each person's drink, itemised, and flags estimated drinks", () => {
    const totals = estimateTotalSek(selection, drinks, [anna, bo, cia]);
    expect(totals.perPerson.map((p) => [p.name, p.dishesSek, p.drinkSek, p.totalSek])).toEqual([
      ["Anna", 165, 44, 209],
      ["Bo", 100, 140, 240],
      ["Cia", 100, 0, 100],
    ]);
    expect(totals).toMatchObject({ dishesSek: 365, drinksSek: 184, totalSek: 549, unpriced: 0, drinksEstimated: true });
  });

  it("is not estimated when every drink comes from the menu", () => {
    const totals = estimateTotalSek(selection.slice(0, 1), drinks, [anna]);
    expect(totals.drinksEstimated).toBe(false);
  });

  it("counts unpriced dishes apart and skips the drink of someone not eating", () => {
    const unpriced = { personId: "a", dish: dish({ pris: null, valuta: null }) };
    const totals = estimateTotalSek([unpriced], drinks, [anna, bo]);
    expect(totals).toMatchObject({ unpriced: 1, dishesSek: 0, drinksSek: 44, totalSek: 44 });
  });

  it("a dish in an unknown currency has no price", () => {
    const totals = estimateTotalSek([{ personId: "a", dish: dish({ pris: 10, valuta: "JPY" }) }], drinks, [anna]);
    expect(totals.unpriced).toBe(1);
  });
});
