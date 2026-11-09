import { describe, expect, it } from "vitest";
import { drinkOptions, estimateTotalSek } from "./drinks";
import { dish, menuOf, person } from "./fixtures";
import { defaultChoices, optionFor, recommendOptions } from "./recommend-options";

const names = (menu: ReturnType<typeof menuOf>, who = person(), opts?: Parameters<typeof recommendOptions>[2]) =>
  recommendOptions(menu, [who], opts)[0]!.options.map((option) => option.dish.originalnamn);

describe("recommendOptions: which dishes", () => {
  const menu = menuOf([
    dish({ originalnamn: "Tapas", grupp: "Förrätt" }),
    dish({ originalnamn: "Biff", pris: 200 }),
    dish({ originalnamn: "Lax", kategori: "fisk", pris: 180 }),
    dish({ originalnamn: "Pasta", pris: 120 }),
    dish({ originalnamn: "Soppa", pris: 100 }),
    dish({ originalnamn: "Glass", grupp: "Efterrätt" }),
    dish({ originalnamn: "Cerveza", grupp: "Drycker", pris: 60 }),
    dish({ originalnamn: "Menyn", grupp: "Övrigt", pris: 300 }),
  ]);

  it("gives three main courses by default, never starters, desserts, drinks or Övrigt", () => {
    expect(names(menu)).toEqual(["Biff", "Lax", "Pasta"]);
  });

  it("respects perPerson and carries the index in menu.ratter", () => {
    const [options] = recommendOptions(menu, [person()], { perPerson: 2 });
    expect(options!.options.map((option) => option.dishIndex)).toEqual([1, 2]);
    expect(options!.options[0]).toMatchObject({ priceSek: 200, warning: null, dish: { originalnamn: "Biff" } });
  });

  it("lets taste lead, and the budget tilt the order", () => {
    expect(names(menu, person({ tastes: { fisk: 2 } }))[0]).toBe("Lax");
    expect(names(menu, person(), { budget: "billigt" })[0]).toBe("Soppa");
  });

  it("falls back to starters when the menu has no main course, and is empty for an empty menu", () => {
    expect(names(menuOf([dish({ originalnamn: "Tapas", grupp: "Förrätt" })]))).toEqual(["Tapas"]);
    expect(recommendOptions(menuOf([]), [person()])).toEqual([{ personId: "p1", options: [] }]);
    expect(recommendOptions(menuOf([dish({ originalnamn: "Cerveza", grupp: "Drycker" })]), [person()])[0]!.options).toEqual([]);
  });

  it("gives an entry per person, in order", () => {
    const result = recommendOptions(menu, [person({ id: "a" }), person({ id: "b" })]);
    expect(result.map((entry) => entry.personId)).toEqual(["a", "b"]);
  });
});

describe("recommendOptions: allergies", () => {
  it("flags a dish with an allergen in red after the safe ones instead of hiding it", () => {
    const menu = menuOf([
      dish({ originalnamn: "Räkor", kategori: "skaldjur", allergener: ["skaldjur"] }),
      dish({ originalnamn: "Biff" }),
      dish({ originalnamn: "Soppa", kan_innehalla: ["skaldjur"] }),
    ]);
    const options = recommendOptions(menu, [person({ allergies: ["skaldjur"] })])[0]!.options;
    expect(options.map((option) => option.dish.originalnamn)).toEqual(["Biff", "Soppa", "Räkor"]);
    expect(options.map((option) => option.warning)).toEqual([null, "maybe", "allergy"]);
    expect(options[1]!.reasons.join(" ")).toContain("Kan innehålla skaldjur");
    expect(options[2]!.reasons.join(" ")).toContain("Innehåller skaldjur");
  });

  it("puts may-contain last even when it is a favourite", () => {
    const menu = menuOf([dish({ originalnamn: "Soppa", kategori: "vegetariskt", kan_innehalla: ["gluten"] }), dish({ originalnamn: "Biff" })]);
    expect(names(menu, person({ allergies: ["gluten"], tastes: { vegetariskt: 2 } }))).toEqual(["Biff", "Soppa"]);
  });

  it("offers flagged options, the first saying nothing else fits, when every dish has the allergen", () => {
    const menu = menuOf([dish({ originalnamn: "Räkor", allergener: ["skaldjur"] }), dish({ originalnamn: "Paella", allergener: ["skaldjur", "gluten"] })]);
    const options = recommendOptions(menu, [person({ allergies: ["skaldjur"] })])[0]!.options;
    expect(options).toHaveLength(2);
    expect(options.every((option) => option.warning === "allergy")).toBe(true);
    expect(options[0]).toMatchObject({ dish: { originalnamn: "Räkor" } });
    expect(options[0]!.reasons[0]).toContain("Inget annat");
  });

  it("flags the allergen dish for the allergic person only", () => {
    const menu = menuOf([dish({ originalnamn: "Räkor", allergener: ["skaldjur"] }), dish({ originalnamn: "Biff" })]);
    const [anna, bo] = recommendOptions(menu, [person({ id: "a", allergies: ["skaldjur"] }), person({ id: "b" })]);
    expect(anna!.options.map((option) => [option.dish.originalnamn, option.warning])).toEqual([["Biff", null], ["Räkor", "allergy"]]);
    expect(bo!.options.map((option) => option.dish.originalnamn).sort()).toEqual(["Biff", "Räkor"]);
    expect(bo!.options.every((option) => option.warning === null)).toBe(true);
  });
});

describe("recommendOptions: reasons", () => {
  const menu = menuOf([
    dish({ originalnamn: "Paprikagryta", huvudingredienser: ["paprika"], pris: 190 }),
    dish({ originalnamn: "Vitlöksbiff", huvudingredienser: ["vitlök"], pris: 150 }),
    dish({ originalnamn: "Pasta", pris: 95 }),
  ]);

  it("names what she loves, and what she avoids when it is suggested anyway, and what saves money", () => {
    const [options] = recommendOptions(menu, [person({ name: "Anna", likes: ["paprika"], dislikes: ["vitlök"] })]);
    const [first, second, third] = options!.options;
    expect(first!.dish.originalnamn).toBe("Paprikagryta");
    expect(first!.reasons).toEqual(["Anna älskar paprika"]);
    expect(third!.dish.originalnamn).toBe("Vitlöksbiff");
    expect(third!.reasons).toContain("Anna undviker vitlök");
    expect(second!.dish.originalnamn).toBe("Pasta");
    expect(second!.reasons).toEqual(["95 kr billigare än förslaget"]);
  });

  it("says du for the person me, and gives no reasons when nothing matters", () => {
    const [mine] = recommendOptions(menu, [person({ id: "me", likes: ["paprika"] })]);
    expect(mine!.options[0]!.reasons).toEqual(["Du älskar paprika"]);
    const plain = menuOf([dish({ originalnamn: "A", pris: 100 }), dish({ originalnamn: "B", pris: 105 })]);
    expect(recommendOptions(plain, [person()])[0]!.options.map((option) => option.reasons)).toEqual([[], []]);
  });
});

describe("recommendOptions: spreading", () => {
  const menu = menuOf([dish({ originalnamn: "Biff" }), dish({ originalnamn: "Lax", kategori: "fisk" }), dish({ originalnamn: "Pasta" })]);

  it("gives different leads to people who are equally well served", () => {
    const result = recommendOptions(menu, [person({ id: "a" }), person({ id: "b" }), person({ id: "c" })]);
    expect(result.map((entry) => entry.options[0]!.dish.originalnamn)).toEqual(["Biff", "Lax", "Pasta"]);
  });

  it("lets a clearly better match beat the spreading", () => {
    const veg = menuOf([dish({ originalnamn: "Biff" }), dish({ originalnamn: "Soppa", kategori: "vegetariskt" })]);
    const result = recommendOptions(veg, [person({ id: "a", tastes: { kott: 2 } }), person({ id: "b", tastes: { kott: 2 } })]);
    expect(result.map((entry) => entry.options[0]!.dish.originalnamn)).toEqual(["Biff", "Biff"]);
  });

  it("offers a dish at most once per person", () => {
    const options = recommendOptions(menu, [person()], { perPerson: 10 })[0]!.options;
    expect(new Set(options.map((option) => option.dishIndex)).size).toBe(options.length);
  });
});

describe("defaultChoices", () => {
  it("takes the best option per person, skipping a warned one when a clean one exists", () => {
    const menu = menuOf([dish({ originalnamn: "Soppa", kan_innehalla: ["gluten"] }), dish({ originalnamn: "Biff", pris: 100 })]);
    const options = recommendOptions(menu, [person({ id: "a", allergies: ["gluten"] }), person({ id: "b" })]);
    expect(defaultChoices(options)).toEqual({ a: { dishIndex: 1, drink: null }, b: { dishIndex: 0, drink: null } });
  });

  it("keeps a flagged only option, and has no dish for a person without options", () => {
    const only = recommendOptions(menuOf([dish({ allergener: ["agg"] })]), [person({ id: "a", allergies: ["agg"] })]);
    expect(defaultChoices(only)).toEqual({ a: { dishIndex: 0, drink: null } });
    expect(defaultChoices(recommendOptions(menuOf([]), [person({ id: "a" })]))).toEqual({ a: { dishIndex: null, drink: null } });
  });
});

describe("drinkOptions and estimateTotalSek with Choices", () => {
  const menu = menuOf([
    dish({ originalnamn: "Biff", pris: 200 }),
    dish({ originalnamn: "Lax", pris: 150 }),
    dish({ originalnamn: "Cerveza", grupp: "Drycker", pris: 50 }),
    dish({ originalnamn: "Cerveza grande", grupp: "Drycker", pris: 70 }),
  ]);
  const people = [person({ id: "a", name: "Anna", drink: "ol" }), person({ id: "b", name: "Bo", drink: "vatten" }), person({ id: "c", name: "Cia", drink: "vin" })];

  it("lists every drink with the menu's cheapest glass first, flagged when estimated", () => {
    const options = drinkOptions(menu);
    expect(options.find((option) => option.kind === "ol")).toEqual({ kind: "ol", sek: 50, estimated: false });
    expect(options.find((option) => option.kind === "vin")).toMatchObject({ estimated: true });
    expect(options.find((option) => option.kind === "vatten")).toEqual({ kind: "vatten", sek: 0, estimated: false });
    expect(options.map((option) => option.kind)).toEqual(["vatten", "lask", "ol", "vin", "cocktail", "kaffe", "ingen"]);
  });

  it("sums chosen dishes and the usual drink, and a changed drink replaces it", () => {
    const usual = estimateTotalSek({ a: { dishIndex: 0, drink: null }, b: { dishIndex: 1, drink: null } }, menu, people);
    expect(usual).toMatchObject({ dishesSek: 350, drinksSek: 50, totalSek: 400, drinksEstimated: false });
    const swapped = estimateTotalSek({ a: { dishIndex: 0, drink: "vatten" }, b: { dishIndex: 1, drink: "vin" } }, menu, people);
    expect(swapped.perPerson.map((entry) => entry.drink)).toEqual(["vatten", "vin", "vin"]);
    expect(swapped.drinksSek).toBe(95);
    expect(swapped.drinksEstimated).toBe(true);
    expect(swapped.perPerson[0]).toMatchObject({ dishesSek: 200, drinkSek: 0, totalSek: 200 });
  });

  it("does not count a person without a chosen dish, or with a dish that is not there", () => {
    const totals = estimateTotalSek({ a: { dishIndex: 0, drink: null }, b: { dishIndex: null, drink: "vin" }, c: { dishIndex: 99, drink: null } }, menu, people);
    expect(totals).toMatchObject({ dishesSek: 200, drinksSek: 50, totalSek: 250 });
    expect(estimateTotalSek({}, menu, people)).toMatchObject({ totalSek: 0, drinksEstimated: false });
  });

  it("counts a dish without a price as unpriced", () => {
    const unpriced = menuOf([dish({ pris: null, valuta: null })]);
    expect(estimateTotalSek({ a: { dishIndex: 0, drink: "ingen" } }, unpriced, people)).toMatchObject({ unpriced: 1, totalSek: 0 });
  });
});

describe("optionFor: a dish added from the whole menu", () => {
  const menu = menuOf([
    dish({ originalnamn: "Biff", pris: 200 }),
    dish({ originalnamn: "Tarta", grupp: "Efterrätt", allergener: ["notter"], pris: 66 }),
    dish({ originalnamn: "Pasta", kan_innehalla: ["gluten"], pris: 120 }),
    dish({ originalnamn: "Paprikagryta", huvudingredienser: ["paprika"], pris: 110 }),
  ]);

  it("gives any dish, also a dessert, with its price and no reasons when nothing changes", () => {
    expect(optionFor(menu, 1, person())).toMatchObject({ dishIndex: 1, priceSek: 66, reasons: [], warning: null });
    expect(optionFor(menu, 9, person())).toBeNull();
  });

  it("says in words that a dish has an allergen of the person, never silently", () => {
    const option = optionFor(menu, 1, person({ allergies: ["notter"] }));
    expect(option?.warning).toBe("allergy");
    expect(option?.reasons).toEqual(["Innehåller nötter. Fråga personalen."]);
  });

  it("'may contain' is a calm warning and love is named", () => {
    expect(optionFor(menu, 2, person({ allergies: ["gluten"] }))).toMatchObject({ warning: "maybe", reasons: ["Kan innehålla gluten. Fråga personalen."] });
    expect(optionFor(menu, 3, person({ likes: ["paprika"] }))?.reasons).toEqual(["Anna älskar paprika"]);
  });
});
