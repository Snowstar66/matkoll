import { describe, expect, it } from "vitest";
import { recipeStatus, toSnapshot } from "@/features/pantry";
import {
  buyConfirmText,
  buyKey,
  itemsToBuy,
  lineOffers,
  lineStates,
  namesText,
  offerChipText,
  offerLineText,
  offerTagText,
  plannedChipText,
  plannedToastText,
  whenText,
  staplesNote,
  summarizeLines,
  type LineOffer,
} from "./line-status";
import type { SavedRecipeLine } from "./saved-recipe";

const ids = {
  korv: "11111111-1111-4111-8111-111111111111",
  gradde: "22222222-2222-4222-8222-222222222222",
  ris: "33333333-3333-4333-8333-333333333333",
  lok: "44444444-4444-4444-8444-444444444444",
  salt: "55555555-5555-4555-8555-555555555555",
};

let position = 0;
const line = (ingredientId: string | null, name: string | null, amount: number | null, unit: SavedRecipeLine["unit"], extra: Partial<SavedRecipeLine> = {}): SavedRecipeLine => ({
  id: `line-${position}`,
  position: position++,
  originalText: name ?? "text",
  amount,
  unit,
  isVague: amount === null,
  ingredientId,
  ingredientName: name,
  stepId: null,
  ...extra,
});

const lines = [
  line(ids.korv, "Falukorv", 400, "g"),
  line(ids.gradde, "Grädde", 2, "dl"),
  line(ids.ris, "Ris", 4, "dl"),
  line(ids.lok, "Gul lök", 1, "st"),
  line(ids.salt, "Salt", null, null),
];
const home = toSnapshot([
  { ingredientId: ids.lok, amount: 2, unit: "st" },
  { ingredientId: ids.salt, amount: null, unit: null },
]);
const status = recipeStatus({ servings: 4, lines: lines.map((l) => ({ ...l })) }, 4, home);
const korvOffer: LineOffer = { store: "ICA Maxi", price: "29 kr/st", savingKr: 12, savingPercent: null };
const grGradde: LineOffer = { store: "Coop", price: null, savingKr: null, savingPercent: 20 };

describe("lineOffers", () => {
  const stores = new Map([["s1", "ICA Maxi"], ["s2", "Coop"]]);
  const offer = (over: Partial<Parameters<typeof lineOffers>[0][number]>) => ({
    ingredientId: ids.korv,
    storeId: "s1",
    price: "29 kr/st",
    regularPrice: 41,
    savingPercent: 29,
    ...over,
  });

  it("counts the saving in whole kronor from the regular price and the price in the offer's text", () => {
    expect(lineOffers([offer({})], stores)[ids.korv]).toEqual({ store: "ICA Maxi", price: "29 kr/st", savingKr: 12, savingPercent: null });
  });

  it("falls back to percent when the price cannot be read or there is no regular price", () => {
    expect(lineOffers([offer({ price: "89 kr +pant" })], stores)[ids.korv]).toMatchObject({ savingKr: null, savingPercent: 29 });
    expect(lineOffers([offer({ regularPrice: null })], stores)[ids.korv]).toMatchObject({ savingKr: null, savingPercent: 29 });
    expect(lineOffers([offer({ regularPrice: null, savingPercent: null })], stores)[ids.korv]).toMatchObject({ savingKr: null, savingPercent: null });
  });

  it("reads a multi-buy offer per item", () => {
    expect(lineOffers([offer({ price: "2 för 50 kr", regularPrice: 30 })], stores)[ids.korv]).toMatchObject({ savingKr: 5 });
  });

  it("keeps the offer that saves most kronor, and skips offers without a catalog ingredient", () => {
    const best = lineOffers(
      [offer({ price: "35 kr/st" }), offer({ storeId: "s2", price: "25 kr/st" }), offer({ ingredientId: null, price: "1 kr/st" })],
      stores,
    );
    expect(Object.keys(best)).toEqual([ids.korv]);
    expect(best[ids.korv]).toMatchObject({ store: "Coop", savingKr: 16 });
  });
});

describe("lineStates", () => {
  const offers = { [ids.korv]: korvOffer, [ids.gradde]: grGradde, [ids.lok]: korvOffer };

  it("says home for what is at home (a Basvara too), missing for the rest, and nothing for a vague line", () => {
    const states = lineStates(lines, status, new Set(), offers);
    expect(lines.map((l) => states[l.id].kind)).toEqual(["missing", "missing", "missing", "home", "home"]);
    // The offer follows a missing line; a line at home has none even if the ingredient is on offer.
    expect(states[lines[0].id].offer).toEqual(korvOffer);
    expect(states[lines[3].id].offer).toBeNull();
    expect(states[lines[2].id].offer).toBeNull();
  });

  it("says listed for a missing ingredient on the shopping list, and leaves the others missing", () => {
    const states = lineStates(lines, status, new Set([ids.korv, ids.lok]), offers);
    expect(lines.map((l) => states[l.id].kind)).toEqual(["listed", "missing", "missing", "home", "home"]);
    expect(states[lines[0].id].offer).toEqual(korvOffer);
  });

  it("is none for a line without a catalog ingredient, and ringed for a vague line that is not at home but never bought", () => {
    const extra = [...lines, line(null, null, 2, null), line(ids.ris, "Ris", null, null)];
    const withExtra = recipeStatus({ servings: 4, lines: extra.map((l) => ({ ...l })) }, 4, home);
    const states = lineStates(extra, withExtra, new Set(), offers);
    expect(states[extra[5].id].kind).toBe("none");
    expect(states[extra[6].id].kind).toBe("missing");
    expect(itemsToBuy(extra, states).map((item) => item.name)).toEqual(["Falukorv", "Grädde", "Ris"]);
  });
});

describe("itemsToBuy and summarizeLines", () => {
  const offers = { [ids.korv]: korvOffer, [ids.gradde]: grGradde };

  it("lists each missing ingredient once, in the recipe's order, not those on the list", () => {
    const doubled = [...lines, line(ids.korv, "Falukorv", 100, "g")];
    const st = recipeStatus({ servings: 4, lines: doubled.map((l) => ({ ...l })) }, 4, home);
    const states = lineStates(doubled, st, new Set([ids.gradde]), offers);
    expect(itemsToBuy(doubled, states).map((item) => item.name)).toEqual(["Falukorv", "Ris"]);
  });

  it("counts what is on the list and what is on offer with the saving in kronor that can be counted", () => {
    const states = lineStates(lines, status, new Set([ids.ris]), offers);
    expect(summarizeLines(lines, states)).toEqual({ listed: 1, onOffer: 2, savingKr: 12 });
  });
});

describe("texts", () => {
  it("says the offer on a row and in the sheet", () => {
    expect(offerLineText(korvOffer)).toBe("Erbjudande ICA Maxi · 29 kr/st, spara 12 kr");
    expect(offerLineText(grGradde)).toBe("Erbjudande Coop, spara 20 %");
    expect(offerLineText({ store: "", price: null, savingKr: null, savingPercent: null })).toBe("Erbjudande");
    expect(offerTagText(korvOffer)).toBe("Erbjudande · spara 12 kr");
    expect(offerTagText(grGradde)).toBe("Erbjudande · spara 20 %");
  });

  it("says the chips", () => {
    expect(offerChipText({ onOffer: 2, savingKr: 21 })).toBe("2 på erbjudande · spara 21 kr");
    expect(offerChipText({ onOffer: 1, savingKr: 0 })).toBe("1 på erbjudande");
    expect(plannedChipText(null)).toBe("På matsedeln denna vecka");
    expect(plannedChipText("onsdag")).toBe("På matsedeln på onsdag");
  });

  it("says the toast after Lägg på matsedeln, with at most three names", () => {
    expect(plannedToastText("Pasta", "torsdag", ["Falukorv", "grädde", "ris"])).toBe("Pasta på torsdag. Falukorv, grädde och ris står på inköpslistan.");
    expect(plannedToastText("Pasta", "måndag", ["falukorv"])).toBe("Pasta på måndag. Falukorv står på inköpslistan.");
    expect(plannedToastText("Pasta", "söndag", ["a", "b", "c", "d", "e"])).toBe("Pasta på söndag. A, b, c och 2 till står på inköpslistan.");
    expect(plannedToastText("Pasta", "fredag", [])).toBe("Pasta på fredag.");
    expect(plannedToastText("Pasta", null, [])).toBe("Pasta på veckan. Alla dagar har en rätt.");
    expect(namesText([])).toBe("");
    expect(plannedToastText("Pasta", "måndag", ["falukorv"], "nästa vecka")).toBe("Pasta på måndag nästa vecka. Falukorv står på inköpslistan.");
    expect(plannedToastText("Pasta", null, [], "om 2 veckor")).toBe("Pasta om 2 veckor. Alla dagar har en rätt.");
    expect(plannedChipText("onsdag", "nästa vecka")).toBe("På matsedeln på onsdag nästa vecka");
    expect(plannedChipText(null, "nästa vecka")).toBe("På matsedeln nästa vecka");
    expect(whenText(0)).toBeNull();
    expect(whenText(1)).toBe("nästa vecka");
    expect(whenText(2)).toBe("om 2 veckor");
  });

  it("says the sheet's button and the key of an item", () => {
    expect(buyConfirmText(0)).toBe("Välj minst en vara");
    expect(buyConfirmText(1)).toBe("Lägg 1 vara på listan");
    expect(buyConfirmText(3)).toBe("Lägg 3 varor på listan");
    expect(buyKey("r", "i")).toBe("recipe:r:i");
    expect(buyKey("a".repeat(36), "b".repeat(36)).length).toBeLessThanOrEqual(100);
  });

  it("names up to three Basvaror at home, and nothing without any", () => {
    const rows = [line(ids.salt, "Salt", 1, "tsk"), line(ids.korv, "Peppar", 1, "krm"), line(ids.gradde, "Smör", 1, "msk"), line(ids.ris, "Olja", 1, "msk")];
    const states = Object.fromEntries(rows.map((row) => [row.id, { kind: "home" as const, staple: true, offer: null }]));
    expect(staplesNote(rows.slice(0, 3), states)).toBe("Salt, peppar och smör är Basvaror och räknas som hemma.");
    expect(staplesNote(rows.slice(0, 1), states)).toBe("Salt är en Basvara och räknas som hemma.");
    expect(staplesNote(rows, states)).toBe("Salt, peppar, smör m.fl. är Basvaror och räknas som hemma.");
    expect(staplesNote(rows, {})).toBeNull();
  });
});
