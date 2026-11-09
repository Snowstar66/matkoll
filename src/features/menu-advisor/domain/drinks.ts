// The cost of the drinks and a total for the evening. Drink prices are ESTIMATES in kronor, used only when the
// menu has no matching drink with a price.
import type { Choices } from "./options";
import { drinkKinds, type DrinkKind, type Person } from "./profile";
import type { Selection } from "./recommend";
import type { Menu, MenuDish } from "./types";
import { dishSek } from "./view";

/** UPPSKATTNING, approximate kronor per glass or cup in a Swedish restaurant, as of 2026-11-09. Not real prices. */
export const approxDrinkSek: Readonly<Record<DrinkKind, number>> = { vatten: 0, lask: 35, ol: 75, vin: 95, cocktail: 140, kaffe: 40, ingen: 0 };
export const approxDrinksDate = "2026-11-09";

// Swedish, English and Spanish words for each drink, matched on the start of a word of the dish name.
const drinkWords: Readonly<Record<Exclude<DrinkKind, "ingen">, readonly string[]>> = {
  vatten: ["vatten", "water", "agua"],
  lask: ["läsk", "cola", "soda", "refresco", "lemonad", "lemonade", "sprite", "fanta"],
  ol: ["öl", "beer", "cerveza", "lager", "pilsner", "ipa"],
  vin: ["vin", "wine", "vino", "prosecco", "cava", "champagne"],
  cocktail: ["cocktail", "mojito", "margarita", "spritz", "gin", "sangria", "negroni"],
  kaffe: ["kaffe", "coffee", "café", "cafe", "espresso", "cappuccino", "latte"],
};
const bottleWords = ["flaska", "flask", "bottle", "botella", "karaff", "carafe"];

function words(text: string): string[] {
  return text
    .toLocaleLowerCase("sv-SE")
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
}

function hasWord(tokens: string[], list: readonly string[]): boolean {
  return tokens.some((token) => list.some((word) => token === word || (word.length >= 4 && token.startsWith(word))));
}

export type DrinkPrice = { sek: number; source: "meny" | "uppskattning" };

/**
 * The price of one drink of this kind in kronor: the cheapest matching drink with a price in the menu's Drycker
 * (bottles and carafes skipped, as the price is per glass), else the rough table.
 */
export function drinkPrice(menu: Menu, kind: DrinkKind): DrinkPrice {
  if (kind !== "ingen") {
    const prices = menu.ratter
      .filter((dish) => dish.grupp === "Drycker")
      .filter((dish) => {
        const tokens = words(`${dish.originalnamn} ${dish.forklaring}`);
        return hasWord(tokens, drinkWords[kind]) && !hasWord(tokens, bottleWords);
      })
      .map((dish) => dishSek(dish))
      .filter((sek): sek is number => sek !== null && sek > 0);
    if (prices.length > 0) return { sek: Math.min(...prices), source: "meny" };
  }
  return { sek: approxDrinkSek[kind], source: "uppskattning" };
}

/** One drink a person can pick instead of their usual, with its price in kronor. `estimated` = from the rough table, not the menu. */
export type DrinkOption = { kind: DrinkKind; sek: number; estimated: boolean };

/** Every drink kind with its price: the menu's cheapest matching drink per glass before the table (see drinkPrice). */
export function drinkOptions(menu: Menu): DrinkOption[] {
  return drinkKinds.map((kind) => {
    const price = drinkPrice(menu, kind);
    return { kind, sek: price.sek, estimated: price.source === "uppskattning" && price.sek > 0 };
  });
}

export type PersonTotal = {
  personId: string;
  name: string;
  dishesSek: number;
  /** Chosen dishes without a price, left out of the sum. */
  unpriced: number;
  drink: DrinkKind | null;
  drinkSek: number;
  totalSek: number;
};

export type Totals = {
  perPerson: PersonTotal[];
  dishesSek: number;
  drinksSek: number;
  totalSek: number;
  unpriced: number;
  /** True when some drink is counted at the rough table price rather than a price on the menu. */
  drinksEstimated: boolean;
};

/**
 * The dishes (converted to kronor) plus each eating person's drink, itemised per person. Takes the old `Selection`, or
 * `Choices` (the dish is menu.ratter[dishIndex]; the drink is the choice's own or else the person's usual). A person
 * without a chosen dish is not counted and has no drink.
 */
export function estimateTotalSek(selection: Selection | Choices, menu: Menu, people: readonly Person[]): Totals {
  let drinksEstimated = false;
  const perPerson = people.map((person): PersonTotal => {
    const mine = chosenFor(selection, menu, person.id);
    const choice = Array.isArray(selection) ? undefined : selection[person.id];
    const drink = choice?.drink ?? person.drink;
    let dishesSek = 0;
    let unpriced = 0;
    for (const { dish } of mine) {
      const sek = dishSek(dish);
      if (sek === null) unpriced += 1;
      else dishesSek += sek;
    }
    let drinkSek = 0;
    if (drink !== null && mine.length > 0) {
      const price = drinkPrice(menu, drink);
      drinkSek = price.sek;
      if (price.source === "uppskattning" && price.sek > 0) drinksEstimated = true;
    }
    return { personId: person.id, name: person.name, dishesSek, unpriced, drink, drinkSek, totalSek: dishesSek + drinkSek };
  });
  const sum = (pick: (p: PersonTotal) => number) => perPerson.reduce((total, p) => total + pick(p), 0);
  return {
    perPerson,
    dishesSek: sum((p) => p.dishesSek),
    drinksSek: sum((p) => p.drinkSek),
    totalSek: sum((p) => p.totalSek),
    unpriced: sum((p) => p.unpriced),
    drinksEstimated,
  };
}

function chosenFor(selection: Selection | Choices, menu: Menu, personId: string): { dish: MenuDish }[] {
  if (Array.isArray(selection)) return selection.filter((entry) => entry.personId === personId);
  const index = selection[personId]?.dishIndex ?? null;
  const dish = index === null ? undefined : menu.ratter[index];
  return dish ? [{ dish }] : [];
}
