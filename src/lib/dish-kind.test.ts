import { describe, expect, it } from "vitest";
import { defaultDishKind, DISH_KINDS, dishKind } from "./dish-kind";

describe("dishKind from the title", () => {
  it.each([
    // Each kind from its own word.
    ["Krämig gryta med rotfrukter", "gryta"],
    ["Röd linssoppa med kokosmjölk", "soppa"],
    ["Ugnspannkaka med bacon", "ugnsratt"],
    ["Potatisgratäng", "gratang"],
    ["Ugnsbakad lax med citron", "fisk"],
    ["Kyckling med ris", "kyckling"],
    ["Biff med bearnaise", "kott"],
    ["Pasta carbonara", "pasta"],
    ["Chow mein med lövbiff", "wok"],
    ["Grekisk sallad", "sallad"],
    ["Västerbottenpaj", "paj"],
    ["Kanelbullar", "bakat"],
    // The form of the dish wins over what it is made of; the end of a compound is the dish.
    ["Krämig kycklinggryta med curry", "gryta"],
    ["Fiskgratäng med räkor", "gratang"],
    ["Laxpasta", "pasta"],
    ["Kycklingsallad", "sallad"],
    ["Pastasallad", "sallad"],
    ["Nudelsoppa", "soppa"],
    ["Kycklingwok", "wok"],
    ["Quiche Lorraine", "paj"],
    ["Thai röd curry med kyckling", "gryta"],
    ["Chili con carne", "gryta"],
    ["Spaghetti och köttbullar", "pasta"],
    ["Lasagne", "pasta"],
    ["Janssons frestelse", "gratang"],
    ["Kladdkaka", "bakat"],
    ["Surdegsbröd", "bakat"],
    ["Prinsesstårta", "bakat"],
    // Meatballs and fish cakes are not baked.
    ["Köttbullar med potatismos", "kott"],
    ["Fiskbullar i hummersås", "fisk"],
    ["Torsk i ugn", "fisk"],
    ["Laxform", "fisk"],
    ["Moussaka", "ugnsratt"],
    // The rest of the title, after "med", "i" …, when the main part names nothing.
    ["Tacos med köttfärs", "kott"],
    // A seasoning names no protein.
    ["Ris med kycklingbuljong", "tallrik"],
    ["Pannkakor", "tallrik"],
    ["", "tallrik"],
  ])("%s is %s", (title, kind) => {
    expect(dishKind(title)).toBe(kind);
  });
});

describe("dishKind from the ingredients", () => {
  it("is the protein most lines name when the title names nothing", () => {
    expect(dishKind("Fredagsmys", ["400 g köttfärs", "1 paket tacoskal", "2 dl gräddfil"])).toBe("kott");
    expect(dishKind("Sommarens favorit", ["4 laxfiléer", "1 citron", "200 g räkor", "100 g bacon"])).toBe("fisk");
  });

  it("leaves seasonings and stand-ins out", () => {
    expect(dishKind("Risotto", ["3 dl risottoris", "1 l kycklingbuljong", "1 msk fisksås"])).toBe(defaultDishKind);
    expect(dishKind("Tacos", ["400 g vegofärs", "tacokrydda"])).toBe(defaultDishKind);
  });

  it("lets the title win over the lines", () => {
    expect(dishKind("Pasta med lax", ["400 g lax", "500 g pasta"])).toBe("pasta");
  });

  it("gives a plate when nothing names a kind", () => {
    expect(dishKind("Pannkakor", ["3 dl vetemjöl", "6 dl mjölk", "3 ägg"])).toBe("tallrik");
  });
});

describe("DISH_KINDS", () => {
  it("has the twelve dishes and the plate", () => {
    expect(DISH_KINDS).toHaveLength(13);
    expect(DISH_KINDS).toContain(defaultDishKind);
  });
});
