import { describe, expect, it } from "vitest";
import { dish, menuOf, person } from "./fixtures";
import { defaultSelection, dishTasteKeys, recommend } from "./recommend";
import type { Person } from "./profile";
import type { Menu } from "./types";

const names = (menu: Menu, p: Person, opts?: Parameters<typeof recommend>[2]) => recommend(menu, [p], opts)[0].picks.map((pick) => pick.dish.originalnamn);

describe("recommend: allergies", () => {
  const menu = menuOf([
    dish({ originalnamn: "Räkor", kategori: "skaldjur", allergener: ["skaldjur"] }),
    dish({ originalnamn: "Soppa", kategori: "vegetariskt", kan_innehalla: ["skaldjur"] }),
    dish({ originalnamn: "Biff", kategori: "kott" }),
  ]);

  it("never suggests a dish with an avoided allergen", () => {
    const result = recommend(menu, [person({ allergies: ["skaldjur"] })])[0];
    expect(result.picks.map((p) => p.dish.originalnamn)).not.toContain("Räkor");
    expect(result.excluded).toBe(1);
  });

  it("keeps a may-contain dish with a warning, far below clean ones", () => {
    const result = recommend(menu, [person({ allergies: ["skaldjur"], tastes: { vegetariskt: 2 } })])[0];
    expect(result.picks.map((p) => p.dish.originalnamn)).toEqual(["Biff", "Soppa"]);
    expect(result.picks[0].warning).toBeNull();
    expect(result.picks[1].warning).toContain("Kan innehålla skaldjur");
  });

  it("a default selection skips warned dishes while a clean one exists", () => {
    const selection = defaultSelection(recommend(menu, [person({ allergies: ["skaldjur"], tastes: { vegetariskt: 2 } })]));
    expect(selection.map((s) => s.dish.originalnamn)).toEqual(["Biff"]);
  });

  it("does not suggest drinks or Övrigt", () => {
    const withDrink = menuOf([dish({ originalnamn: "Cerveza", grupp: "Drycker" }), dish({ originalnamn: "Pan", grupp: "Övrigt" }), dish({ originalnamn: "Biff" })]);
    expect(names(withDrink, person())).toEqual(["Biff"]);
  });
});

describe("recommend: tastes", () => {
  const menu = menuOf([
    dish({ originalnamn: "Biff", kategori: "kott" }),
    dish({ originalnamn: "Lax", kategori: "fisk" }),
    dish({ originalnamn: "Grönsakswok", kategori: "veganskt" }),
  ]);

  it("treats missing tastes and 0 as neutral: keeps menu order", () => {
    expect(names(menu, person())).toEqual(["Biff", "Lax", "Grönsakswok"]);
    expect(names(menu, person({ tastes: { fisk: 0 } }))).toEqual(["Biff", "Lax", "Grönsakswok"]);
  });

  it("lets a liked taste lead and gives the reason", () => {
    const result = recommend(menu, [person({ tastes: { fisk: 1 } })])[0];
    expect(result.picks[0].dish.originalnamn).toBe("Lax");
    expect(result.picks[0].reasons).toContain("passar din smak för fisk");
  });

  it("pushes disliked and hated kinds down", () => {
    expect(names(menu, person({ tastes: { kott: -2, vegetariskt: 1 } }))).toEqual(["Grönsakswok", "Lax", "Biff"]);
  });

  it("maps veganskt to vegetariskt and finds pasta, pizza, hot and sweet by words", () => {
    expect(dishTasteKeys(dish({ kategori: "veganskt" }))).toContain("vegetariskt");
    expect(dishTasteKeys(dish({ originalnamn: "Spaghetti alle vongole", kategori: "skaldjur" }))).toEqual(expect.arrayContaining(["pasta", "skaldjur"]));
    expect(dishTasteKeys(dish({ originalnamn: "Pizza Diavola" }))).toContain("pizza");
    expect(dishTasteKeys(dish({ originalnamn: "Pollo picante" }))).toContain("starkt");
    expect(dishTasteKeys(dish({ originalnamn: "Brownie", grupp: "Efterrätt", kategori: "ej_tillampligt" }))).toContain("sott");
    expect(dishTasteKeys(dish({ originalnamn: "Fiskpinnar", huvudingredienser: ["chili"] }))).toContain("starkt");
    expect(dishTasteKeys(dish({ originalnamn: "Pastrami" }))).not.toContain("pasta");
  });

  it("only suggests dessert first for someone who likes sweet", () => {
    const withDessert = menuOf([dish({ originalnamn: "Tiramisu", grupp: "Efterrätt", kategori: "ej_tillampligt" }), dish({ originalnamn: "Biff" })]);
    expect(names(withDessert, person())).toEqual(["Biff", "Tiramisu"]);
    expect(names(withDessert, person({ tastes: { sott: 2 } }))[0]).toBe("Tiramisu");
  });

  it("can give the same dish to several people", () => {
    const result = recommend(menu, [person({ id: "a" }), person({ id: "b", name: "Bo" })]);
    expect(result[0].picks[0].dish).toBe(result[1].picks[0].dish);
  });

  it("returns at most three by default and respects limit", () => {
    const many = menuOf(["A", "B", "C", "D"].map((originalnamn) => dish({ originalnamn })));
    expect(names(many, person())).toHaveLength(3);
    expect(names(many, person(), { limit: 1 })).toHaveLength(1);
  });
});

describe("recommend: budget", () => {
  const menu = menuOf([
    dish({ originalnamn: "Dyr biff", pris: 300 }),
    dish({ originalnamn: "Mellan", pris: 200, kategori: "fisk" }),
    dish({ originalnamn: "Billig", pris: 100, kategori: "vegetariskt" }),
  ]);

  it("normalt keeps menu order", () => {
    expect(names(menu, person())).toEqual(["Dyr biff", "Mellan", "Billig"]);
  });

  it("billigt ranks cheap first, with a reason", () => {
    const result = recommend(menu, [person()], { budget: "billigt" })[0];
    expect(result.picks.map((p) => p.dish.originalnamn)).toEqual(["Billig", "Mellan", "Dyr biff"]);
    expect(result.picks[0].reasons).toContain("billigast bland vegetariska");
  });

  it("unna ranks dear first", () => {
    const result = recommend(menu, [person()], { budget: "unna" })[0];
    expect(result.picks[0].dish.originalnamn).toBe("Dyr biff");
    expect(result.picks[0].reasons).toContain("något att unna sig");
  });

  it("budget does not override an allergy", () => {
    const result = recommend(menu, [person({ allergies: ["fisk"] })], { budget: "billigt" });
    expect(result[0].picks).toHaveLength(3);
    const only = menuOf([dish({ originalnamn: "Billig fisk", pris: 50, allergener: ["fisk"] }), dish({ originalnamn: "Dyr biff", pris: 300 })]);
    expect(names(only, person({ allergies: ["fisk"] }), { budget: "billigt" })).toEqual(["Dyr biff"]);
  });

  it("handles a menu without prices and without dishes", () => {
    const unpriced = menuOf([dish({ pris: null, valuta: null }), dish({ originalnamn: "Två", pris: null, valuta: null })]);
    expect(names(unpriced, person(), { budget: "billigt" })).toEqual(["Pollo", "Två"]);
    expect(recommend(menuOf([]), [person()])[0].picks).toEqual([]);
    expect(defaultSelection(recommend(menuOf([]), [person()]))).toEqual([]);
  });
});

describe("recommend: free-text likes and dislikes", () => {
  const menu = menuOf([
    dish({ originalnamn: "Pollo al ajillo", kategori: "kott", huvudingredienser: ["kyckling", "vitlök"] }),
    dish({ originalnamn: "Paprikagryta", kategori: "vegetariskt", huvudingredienser: ["paprika"] }),
    dish({ originalnamn: "Biff", kategori: "kott" }),
  ]);

  it("ranks an avoided ingredient down with a soft note, but keeps the dish", () => {
    const result = recommend(menu, [person({ tastes: { vitlok: -1 } })])[0];
    expect(result.picks.map((p) => p.dish.originalnamn)).toEqual(["Paprikagryta", "Biff", "Pollo al ajillo"]);
    expect(result.excluded).toBe(0);
    const garlic = result.picks[2];
    expect(garlic.concerns).toEqual(["Innehåller vitlök. Anna undviker det."]);
    expect(garlic.warning).toBeNull();
  });

  it("says du for the one holding the phone", () => {
    const result = recommend(menu, [person({ id: "me", name: "Du", tastes: { vitlok: -1 } })])[0];
    expect(result.picks.at(-1)?.concerns[0]).toBe("Innehåller vitlök. Du undviker det.");
  });

  it("gives a bonus and a reason for a loved ingredient", () => {
    const result = recommend(menu, [person({ tastes: { paprika: 1 } })])[0];
    expect(result.picks[0].dish.originalnamn).toBe("Paprikagryta");
    expect(result.picks[0].reasons[0]).toBe("Anna älskar paprika");
  });

  it("leads with a dish without an avoided ingredient when there is one", () => {
    const selection = defaultSelection(recommend(menu, [person({ tastes: { vitlok: -1, kyckling: 1 } })]));
    expect(selection.map((s) => s.dish.originalnamn)).toEqual(["Paprikagryta"]);
  });

  it("never excludes on a dislike when every dish has it, and allergies still exclude", () => {
    const all = menuOf([dish({ originalnamn: "A", huvudingredienser: ["vitlök"] }), dish({ originalnamn: "B", huvudingredienser: ["vitlök"], allergener: ["notter"] })]);
    const result = recommend(all, [person({ tastes: { vitlok: -1 }, allergies: ["notter"] })])[0];
    expect(result.picks.map((p) => p.dish.originalnamn)).toEqual(["A"]);
    expect(result.excluded).toBe(1);
    expect(result.picks[0].concerns).toHaveLength(1);
  });
});
