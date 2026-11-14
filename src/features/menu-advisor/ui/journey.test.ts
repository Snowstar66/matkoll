import { describe, expect, it } from "vitest";
import { estimateTotalSek } from "../domain/drinks";
import { dish, menuOf, person } from "../domain/fixtures";
import type { Choices, DishOption, PersonOptions } from "../domain/options";
import { addDrink, addExtra, allergyLine, approxKr, cardSek, choose, chooseDrink, clearDish, dropUsualDrink, hasDish, removeDrink, removeExtra, drinkFor, drinkPhrase, emptyReadingView, foldReading, hasProfileInfo, joinNames, listPrice, readingStatus, reasonTone, unpricedNote, withOption } from "./journey";
import { fitParts, fitSentence, maybeSentence } from "./dish-sheet";

const menu = menuOf([
  dish({ originalnamn: "Paella", pris: 200 }),
  dish({ originalnamn: "Tortilla", pris: 90 }),
  dish({ originalnamn: "Cerveza", grupp: "Drycker", forklaring: "Öl.", pris: 60 }),
]);
const anna = person({ id: "a", name: "Anna", drink: "vin" });
const du = person({ id: "me", name: "Du", drink: "ol" });

describe("choosing and counting", () => {
  it("an extra is added on top of the chosen dish and counted; twice changes nothing; a new main or drink keeps it", () => {
    let choices: Choices = { me: { dishIndex: 0, drink: null } };
    choices = addExtra(choices, "me", 1);
    expect(choices.me).toEqual({ dishIndex: 0, drink: null, extras: [1] });
    expect(addExtra(choices, "me", 1)).toBe(choices);
    expect(addExtra(choices, "me", 0)).toBe(choices);
    expect(hasDish(choices, "me", 1)).toBe(true);
    expect(hasDish(choices, "a", 1)).toBe(false);
    // Du: 200 + 90 + beer 60, counted once.
    expect(estimateTotalSek(choices, menu, [du]).totalSek).toBe(200 + 90 + 60);
    expect(chooseDrink(choices, "me", "vatten").me?.extras).toEqual([1]);
    // Choosing the extra as the main dish moves it there, not twice.
    expect(choose(choices, "me", 1).me).toEqual({ dishIndex: 1, drink: null });
    expect(removeExtra(choices, "me", 1).me).toEqual({ dishIndex: 0, drink: null });
    expect(estimateTotalSek(addExtra({}, "me", 1), menu, [du]).totalSek).toBe(90 + 60);
  });


  it("one tap changes the dish and keeps the drink; the total follows", () => {
    let choices: Choices = { me: { dishIndex: 0, drink: null }, a: { dishIndex: 0, drink: null } };
    // Du: 200 + beer 60 (the menu's price), Anna: 200 + wine (table, 95).
    expect(estimateTotalSek(choices, menu, [du, anna]).totalSek).toBe(200 + 60 + 200 + 95);
    choices = choose(choices, "a", 1);
    expect(choices.a).toEqual({ dishIndex: 1, drink: null });
    expect(estimateTotalSek(choices, menu, [du, anna]).totalSek).toBe(200 + 60 + 90 + 95);
  });

  it("changing the drink keeps the dish and counts the new drink at the menu's price before the estimate", () => {
    let choices: Choices = { me: { dishIndex: 1, drink: null } };
    choices = chooseDrink(choices, "me", "vatten");
    expect(choices.me).toEqual({ dishIndex: 1, drink: "vatten" });
    expect(estimateTotalSek(choices, menu, [du]).totalSek).toBe(90);
    choices = chooseDrink(choices, "me", "ol");
    expect(estimateTotalSek(choices, menu, [du]).totalSek).toBe(90 + 60);
    expect(drinkFor(du, choices)).toBe("ol");
    expect(drinkFor(anna, {})).toBe("vin");
  });

  it("a card shows the dish plus the person's drink, nothing without a price", () => {
    expect(cardSek(menu, menu.ratter[0]!, "ol")).toBe(260);
    expect(cardSek(menu, menu.ratter[0]!, null)).toBe(200);
    expect(cardSek(menu, dish({ pris: null }), "ol")).toBeNull();
  });

  it("adds an option last, once, and only for that person", () => {
    const option = (dishIndex: number): DishOption => ({ dish: menu.ratter[dishIndex]!, dishIndex, priceSek: null, reasons: [], warning: null });
    const list: PersonOptions[] = [
      { personId: "a", options: [option(0)] },
      { personId: "b", options: [option(0)] },
    ];
    const next = withOption(list, "a", option(1));
    expect(next[0]!.options.map((entry) => entry.dishIndex)).toEqual([0, 1]);
    expect(next[1]!.options).toHaveLength(1);
    expect(withOption(next, "a", option(1))[0]!.options).toHaveLength(2);
  });
});

describe("a menu that only grows", () => {
  const menu = menuOf([dish({ originalnamn: "Soppa", pris: 100 }), dish({ originalnamn: "Biff", pris: 200 }), dish({ originalnamn: "Fika", grupp: "Efterrätt", pris: 50 })]);
  const me = person({ id: "me", drink: "ol" });
  const start: Choices = { me: { dishIndex: 1, drink: null } };

  it("a second dish is added, never replacing; the proposed one can be cleared; nothing else is lost", () => {
    const two = addExtra(addExtra(start, "me", 0), "me", 2);
    expect(two.me).toEqual({ dishIndex: 1, drink: null, extras: [0, 2] });
    const cleared = clearDish(two, "me");
    expect(cleared.me).toEqual({ dishIndex: null, drink: null, extras: [0, 2] });
    expect(estimateTotalSek(cleared, menu, [me]).dishesSek).toBe(150);
  });

  it("drinks: the usual one counts, can be dropped, and added ones come on top and count", () => {
    const usual = estimateTotalSek(start, menu, [me]);
    const more = addDrink(start, "me", "vin");
    expect(estimateTotalSek(more, menu, [me]).drinksSek).toBe(usual.drinksSek + 95);
    expect(addDrink(more, "me", "vin")).toBe(more);
    const dropped = dropUsualDrink(more, "me");
    expect(estimateTotalSek(dropped, menu, [me]).drinksSek).toBe(95);
    expect(estimateTotalSek(removeDrink(dropped, "me", "vin"), menu, [me]).drinksSek).toBe(0);
    expect(removeDrink(dropped, "me", "vin").me?.drinks).toBeUndefined();
  });
});

describe("words", () => {
  it("prices", () => {
    expect(approxKr(253.4)).toBe("ca 253 kr");
    expect(approxKr(null)).toBe("");
    expect(listPrice({ pris: 88, valuta: "SEK" })).toBe("88 kr");
    expect(listPrice({ pris: 10, valuta: "EUR" })).toMatch(/^ca \d+ kr$/);
    expect(listPrice({ pris: null, valuta: null })).toBe("");
  });

  it("names, and dishes without a price", () => {
    expect(unpricedNote({ unpriced: 0 })).toBeNull();
    expect(unpricedNote({ unpriced: 1 })).toBe("1 rätt saknar pris och räknas inte med");
    expect(unpricedNote({ unpriced: 2 })).toBe("2 rätter saknar pris och räknas inte med");
    expect(joinNames(["Du", "Anna", "Gunnar"])).toBe("Du, Anna och Gunnar");
    expect(joinNames(["Du", "Anna"])).toBe("Du och Anna");
  });

  it("the drink and what is filled in", () => {
    expect(drinkPhrase("ol")).toBe("med öl");
    expect(drinkPhrase("ingen")).toBe("utan dryck");
    expect(drinkPhrase(null)).toBe("");
    expect(hasProfileInfo(person())).toBe(false);
    expect(hasProfileInfo(person({ tastes: { paprika: 1 } }))).toBe(true);
    expect(hasProfileInfo(person({ tastes: { fisk: 2 } }))).toBe(true);
  });

  it("the tone of a reason: love mint, avoid and maybe sand, an allergen red, a price gap plain", () => {
    expect(reasonTone("Anna älskar paprika", null)).toBe("mint");
    expect(reasonTone("Anna undviker vitlök", null)).toBe("sand");
    expect(reasonTone("Kan innehålla gluten. Fråga personalen.", "maybe")).toBe("sand");
    expect(reasonTone("44 kr billigare än förslaget", null)).toBe("plain");
    expect(reasonTone("Inget annat på menyn passar.", "allergy")).toBe("danger");
  });

  it("the allergy line names each person's allergies, and nothing when there are none", () => {
    expect(allergyLine([du, anna])).toBe("");
    expect(allergyLine([du, person({ id: "g", name: "Gunnar", allergies: ["notter", "gluten"] })])).toBe("Gunnar: nötter, gluten.");
  });
});

describe("the live reading", () => {
  const first = dish({ originalnamn: "Pulpo" });
  const second = dish({ originalnamn: "Paella" });

  it("starts empty and says it reads", () => {
    expect(readingStatus(emptyReadingView, false)).toBe("Läser menyn…");
    expect(readingStatus(emptyReadingView, true)).toBe("Läser menyn noggrannare…");
  });

  it("says who reads, translates, and lists the dishes as they come", () => {
    let view = foldReading(emptyReadingView, { type: "reading", quality: "standard", restart: false, model: "Haiku 5.5", effort: "låg" });
    expect(view.reader).toEqual({ model: "Haiku 5.5", effort: "låg" });
    view = foldReading(view, { type: "language", sprak: "es" });
    expect(readingStatus(view, false)).toBe("Översätter från spanska…");
    view = foldReading(view, { type: "dish", index: 0, dish: first });
    expect(readingStatus(view, false)).toBe("Hittade 1 rätt");
    view = foldReading(view, { type: "dish", index: 1, dish: second });
    expect(readingStatus(view, false)).toBe("Hittade 2 rätter");
    expect(view.dishes.map((entry) => entry.originalnamn)).toEqual(["Pulpo", "Paella"]);
  });

  it("a swedish menu is not translated", () => {
    expect(readingStatus(foldReading(emptyReadingView, { type: "language", sprak: "sv" }), false)).toBe("Läser menyn…");
  });

  it("a restart empties the list; done replaces it with the whole menu", () => {
    let view = foldReading(emptyReadingView, { type: "dish", index: 0, dish: first });
    view = foldReading(view, { type: "reading", quality: "careful", restart: true, model: "Sonnet 5.5", effort: "medel" });
    expect(view.dishes).toEqual([]);
    expect(view.reader).toEqual({ model: "Sonnet 5.5", effort: "medel" });
    view = foldReading(view, { type: "done", menu: menuOf([second]), quality: "careful", escalated: false, model: "Sonnet 5.5", effort: "medel" });
    expect(view.dishes).toEqual([second]);
  });

  it("an error line changes nothing", () => {
    const view = foldReading(emptyReadingView, { type: "dish", index: 0, dish: first });
    expect(foldReading(view, { type: "error", code: "ai_unavailable" })).toBe(view);
  });
});

describe("who a dish suits", () => {
  const nuts = dish({ originalnamn: "Tarta", allergener: ["notter"] });
  const gunnar = person({ id: "g", name: "Gunnar", allergies: ["notter"] });
  const maybeGluten = dish({ kan_innehalla: ["gluten"] });

  it("says who it suits and who cannot eat it, in parts", () => {
    expect(fitSentence(nuts, [du, anna, gunnar])).toBe("Passar Du och Anna. Gunnar kan inte (nötter).");
    expect(fitParts(nuts, [du, anna, gunnar]).map((part) => part.bad)).toEqual([false, true]);
    expect(fitSentence(dish(), [du, anna])).toBe("Passar alla.");
    expect(fitSentence(dish(), [du])).toBe("Passar dig.");
    expect(fitSentence(nuts, [gunnar])).toBe("Gunnar kan inte (nötter).");
    expect(fitSentence(nuts, [])).toBe("");
  });

  it("a 'may contain' is a separate, calm sentence", () => {
    expect(maybeSentence(maybeGluten, [person({ id: "a", name: "Anna", allergies: ["gluten"] }), du])).toBe("Anna: kan innehålla gluten. Fråga personalen.");
    expect(fitSentence(maybeGluten, [person({ name: "Anna", allergies: ["gluten"] })])).toBe("Passar Anna.");
  });
});
