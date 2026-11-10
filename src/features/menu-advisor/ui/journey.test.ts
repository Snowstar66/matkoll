import { describe, expect, it } from "vitest";
import { estimateTotalSek } from "../domain/drinks";
import { dish, menuOf, person } from "../domain/fixtures";
import type { Choices, DishOption, PersonOptions } from "../domain/options";
import { allergyLine, approxKr, cardSek, choose, chooseDrink, companyLine, drinkFor, drinkPhrase, emptyReadingView, foldReading, hasProfileInfo, joinNames, listPrice, readingStatus, reasonTone, withOption } from "./journey";
import { fitParts, fitSentence, maybeSentence } from "./dish-sheet";

const menu = menuOf([
  dish({ originalnamn: "Paella", pris: 200 }),
  dish({ originalnamn: "Tortilla", pris: 90 }),
  dish({ originalnamn: "Cerveza", grupp: "Drycker", forklaring: "Öl.", pris: 60 }),
]);
const anna = person({ id: "a", name: "Anna", drink: "vin" });
const du = person({ id: "me", name: "Du", drink: "ol" });

describe("choosing and counting", () => {
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

describe("words", () => {
  it("prices", () => {
    expect(approxKr(253.4)).toBe("ca 253 kr");
    expect(approxKr(null)).toBe("");
    expect(listPrice({ pris: 88, valuta: "SEK" })).toBe("88 kr");
    expect(listPrice({ pris: 10, valuta: "EUR" })).toMatch(/^ca \d+ kr$/);
    expect(listPrice({ pris: null, valuta: null })).toBe("");
  });

  it("the company line", () => {
    expect(companyLine([du])).toBe("Bara du");
    expect(companyLine([anna])).toBe("Bara Anna");
    expect(companyLine([du, anna, person({ id: "g", name: "Gunnar" })])).toBe("Ni är tre · Du, Anna, Gunnar");
    expect(companyLine([du, anna, anna, anna, anna])).toBe("Ni är fem · Du, Anna +3");
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
