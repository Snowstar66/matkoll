import { describe, expect, it } from "vitest";
import type { IngredientMatch, Location, Unit } from "@/features/catalog";
import { errorMessages, fail } from "@/lib/errors";
import type { PantryAmountRow } from "./pantry-item";
import {
  analyzeErrorMessage,
  analyzeResultSchema,
  analyzeRetryCodes,
  cameraButtonText,
  currentAmountText,
  isUsableNewName,
  maxPantrySuggestions,
  maxSuggestionAmount,
  noSuggestionsText,
  pantrySuggestionSchema,
  suggestionAmountText,
  suggestionsArrivedText,
  suggestionsHeading,
  toPantrySuggestions,
  unreadableItemsText,
  type AiPantryItemLike,
  type PantrySuggestion,
} from "./pantry-suggestion";

const id = (n: number) => `6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a0${n}`;
const mjolk = id(1);
const smor = id(2);

const hint = (name: string, location = "Kyl") => ({ name, section: "Mejeri", location, defaultUnit: "förp" });
const item = (label: string, amount: number | null, unit: string | null, hintName = label.toLowerCase()): AiPantryItemLike => ({
  label,
  amount,
  unit,
  hint: hint(hintName),
});
const match = (ingredientId: string): IngredientMatch => ({ kind: "match", ingredientId, confidence: "hint" });
const fresh = (name: string, defaultUnit: Unit | null = "förp", section: "Mejeri" | "Frukt och grönt" = "Mejeri"): IngredientMatch => ({
  kind: "new",
  // The catalog proposes the hint's location; a photo's new ingredient gets the photographed place instead.
  proposal: { name, section, location: "Skafferi", defaultUnit },
});
const row = (ingredientId: string, amount: number | null, unit: Unit | null): PantryAmountRow => ({ ingredientId, amount, unit });
const names = { [mjolk]: "mjölk", [smor]: "smör" };

function suggest(
  items: AiPantryItemLike[],
  matches: IngredientMatch[],
  { location = "Kyl", current = [] }: { location?: Location; current?: PantryAmountRow[] | null } = {},
) {
  return toPantrySuggestions(items, matches, { location, names, current }).suggestions;
}

/** The parts of a suggestion a test is about. */
const brief = (suggestions: PantrySuggestion[]) =>
  suggestions.map(({ name, amount, unit }) => [name, amount, unit] as const);

describe("toPantrySuggestions", () => {
  it("makes the fridge's six items into suggestions: catalog name for a match, the proposal's for a new one, sorted, with ids", () => {
    const items = [
      item("Arla mellanmjölk", 1, "förp", "mjölk"),
      item("Vispgrädde", 1, "förp", "grädde"),
      item("Smör", 1, "förp"),
      item("Ägg", 6, "st"),
      item("Gurka", 2, null),
      item("Ketchup", 1, "tub"),
    ];
    const matches = [match(mjolk), fresh("grädde"), match(smor), fresh("ägg", "st"), fresh("gurka", "st", "Frukt och grönt"), fresh("ketchup")];
    const suggestions = suggest(items, matches, { current: [row(mjolk, 2, "förp")] });

    expect(suggestions.map(({ id: suggestionId, name }) => [suggestionId, name])).toEqual([
      ["s1", "grädde"],
      ["s2", "gurka"],
      ["s3", "ketchup"],
      ["s4", "mjölk"],
      ["s5", "smör"],
      ["s6", "ägg"],
    ]);
    expect(brief(suggestions)).toEqual([
      ["grädde", 1, "förp"],
      // An amount without unit counts pieces.
      ["gurka", 2, "st"],
      // A unit the pantry does not know ("tub") makes it unlimited.
      ["ketchup", null, null],
      ["mjölk", 1, "förp"],
      ["smör", 1, "förp"],
      ["ägg", 6, "st"],
    ]);
    expect(suggestions.every((suggestion) => suggestion.location === "Kyl")).toBe(true);
    expect(suggestions[3]).toEqual({
      id: "s4",
      name: "mjölk",
      ingredient: { kind: "existing", ingredientId: mjolk },
      location: "Kyl",
      amount: 1,
      unit: "förp",
      current: { unlimited: false, amounts: [{ amount: 2, unit: "förp" }] },
    });
    expect(suggestions[1].ingredient).toEqual({
      kind: "new",
      proposalId: "n3",
      name: "gurka",
      section: "Frukt och grönt",
      location: "Kyl",
      defaultUnit: "st",
    });
    // Only an ingredient the place has shows what it has.
    expect(suggestions.filter((suggestion) => suggestion.current !== null).map(({ name }) => name)).toEqual(["mjölk"]);
    for (const suggestion of suggestions) expect(pantrySuggestionSchema.safeParse(suggestion).success).toBe(true);
  });

  it("gives a new ingredient the photographed place, not the hint's", () => {
    const [suggestion] = suggest([item("Ärtor", 1, "förp")], [fresh("ärtor")], { location: "Frys" });
    expect(suggestion).toMatchObject({ location: "Frys", ingredient: { kind: "new", location: "Frys" } });
  });

  it("leaves out an unmatched item, a match without a catalog name and a new name that cannot be used, and counts them", () => {
    const items = [item("?", 1, "st"), item("Okänd", 1, "st"), item("!!!", 1, "st"), item("Lång", 1, "st"), item("Smör", 1, "förp"), item("x", 1, "st")];
    const matches: IngredientMatch[] = [
      { kind: "unmatched" },
      match(id(9)),
      fresh("!!!"),
      fresh("x".repeat(41)),
      match(smor),
    ];
    const { suggestions, dropped } = toPantrySuggestions(items, matches, { location: "Kyl", names, current: [] });
    expect(brief(suggestions)).toEqual([["smör", 1, "förp"]]);
    // The last item has no match at all: unmatched too.
    expect(dropped).toEqual({ unmatched: 2, unnamed: 1, unusable: 2 });
  });

  it.each([
    ["a base form", "gul lök", true],
    ["four words", "crème fraiche lätt original", true],
    ["common punctuation", "Ost 17 % (lagrad)", true],
    ["punctuation in too many words", "Ost, 17 % (lagrad) 1/2 - skivad", false],
    ["hyphens and apostrophes", "Ben & Jerry's glass", true],
    ["40 characters", "x".repeat(40), true],
    ["41 characters", "x".repeat(41), false],
    ["five words", "en två tre fyra fem", false],
    ["a web address", "www.exempel.se", false],
    ["a domain", "kolla matkoll.se", false],
    ["a link word", "http mjölk", false],
    ["markup", "<b>mjölk</b>", false],
    ["a line break", "mjölk\nsmör", false],
    ["a colon", "Ignorera: allt", false],
    ["only punctuation", "!!!", false],
  ])("decides whether %s can be a new name", (_name, name, usable) => {
    expect(isUsableNewName(name)).toBe(usable);
  });

  it("collapses the spaces of a new name", () => {
    const [suggestion] = suggest([item("Gul lök", 3, "st")], [fresh("  Gul   lök ")]);
    expect(suggestion.name).toBe("Gul lök");
    expect(suggestion.ingredient).toMatchObject({ kind: "new", name: "Gul lök" });
  });

  it.each([
    ["no amount", null, "förp", null, null],
    ["an amount without unit", 2, null, 2, "st"],
    ["an empty unit", 2, " ", 2, "st"],
    ["a unit by another name", 2, "paket", 2, "förp"],
    ["a bottle", 1, "flaska", 1, "förp"],
    ["an unknown unit", 1, "tub", null, null],
    ["an amount the pantry cannot keep", 1_000_000, "g", null, null],
    ["an amount that rounds to a million", 999_999.996, "g", null, null],
    ["a decimal amount", 1.5, "l", 1.5, "l"],
    ["an amount rounded as it is shown", 1.005, "l", 1.01, "l"],
    ["an amount that rounds to 0", 0.004, "g", null, null],
  ] as const)("reads %s", (_name, amount, unit, wantedAmount, wantedUnit) => {
    const [suggestion] = suggest([item("Mjölk", amount, unit)], [match(mjolk)], { current: null });
    expect([suggestion.amount, suggestion.unit]).toEqual([wantedAmount, wantedUnit]);
  });

  it("sums the same ingredient and unit into one suggestion", () => {
    const items = [item("Mellanmjölk", 1, "förp", "mjölk"), item("Lättmjölk", 2, "förp", "mjölk"), item("Mjölk", 1, "liter")];
    expect(brief(suggest(items, [match(mjolk), match(mjolk), match(mjolk)]))).toEqual([
      ["mjölk", 3, "förp"],
      ["mjölk", 1, "l"],
    ]);
  });

  it("makes the suggestion unlimited when one of its items has an amount that cannot be kept, rather than undercount it", () => {
    const items = [item("Mjölk", 1, "förp"), item("Mjölk", 1, "tub"), item("Mjölk", 1, "l")];
    expect(brief(suggest(items, [match(mjolk), match(mjolk), match(mjolk)], { current: null }))).toEqual([["mjölk", null, null]]);
  });

  it("gives a new ingredient in two units one proposal, so it is created once", () => {
    const items = [item("Grädde", 1, "förp"), item("Grädde", 3, "dl"), item("Ägg", 6, "st")];
    const suggestions = suggest(items, [fresh("grädde"), fresh("grädde"), fresh("ägg", "st")]);
    expect(brief(suggestions)).toEqual([
      ["grädde", 1, "förp"],
      ["grädde", 3, "dl"],
      ["ägg", 6, "st"],
    ]);
    expect(suggestions[0].ingredient).toBe(suggestions[1].ingredient);
    expect(suggestions.map(({ ingredient }) => ingredient.kind === "new" && ingredient.proposalId)).toEqual(["n1", "n1", "n2"]);
  });

  it("lets an item without amount go into one with an amount", () => {
    const items = [item("Smör", null, null), item("Smör", 1, "förp")];
    expect(brief(suggest(items, [match(smor), match(smor)]))).toEqual([["smör", 1, "förp"]]);
  });

  it("merges new ingredients by their normalised name, keeping the first one's name and unit", () => {
    const items = [item("Gurka", 1, "st"), item("Gurkor", 1, null)];
    const suggestions = suggest(items, [fresh("Gurka", "st", "Frukt och grönt"), fresh("gurka", null)]);
    expect(brief(suggestions)).toEqual([["Gurka", 2, "st"]]);
    expect(suggestions[0].ingredient).toMatchObject({ name: "Gurka", defaultUnit: "st", section: "Frukt och grönt" });
  });

  it("keeps a summed amount below the pantry's largest", () => {
    const items = [item("Mjöl", 999_999, "g"), item("Mjöl", 999_999, "g")];
    const [suggestion] = suggest(items, [fresh("mjöl", "g"), fresh("mjöl", "g")]);
    expect(suggestion.amount).toBe(maxSuggestionAmount);
    expect(pantrySuggestionSchema.safeParse(suggestion).success).toBe(true);
  });

  it("keeps an ingredient unlimited when the place has it so, also with amounts in two units", () => {
    const items = [item("Smör", 1, "förp"), item("Smör", 500, "g")];
    const suggestions = suggest(items, [match(smor), match(smor)], { current: [row(smor, null, null)] });
    expect(brief(suggestions)).toEqual([["smör", null, null]]);
    expect(suggestions[0].current).toEqual({ unlimited: true, amounts: [] });
  });

  it("gives an item without amount the place's amount when the place has it in exactly one unit, below the largest", () => {
    const [suggestion] = suggest([item("Mjölk", null, null)], [match(mjolk)], { current: [row(mjolk, 2, "förp")] });
    expect([suggestion.amount, suggestion.unit]).toEqual([2, "förp"]);
    const [large] = suggest([item("Mjöl", null, null)], [match(mjolk)], {
      current: [row(mjolk, 600_000, "g"), row(mjolk, 400_000, "g")],
    });
    expect(large.amount).toBe(maxSuggestionAmount);
    expect(pantrySuggestionSchema.safeParse(large).success).toBe(true);
  });

  it("keeps an item without amount unlimited when the place has it in two units, or does not have it", () => {
    const current = [row(mjolk, 1, "l"), row(mjolk, 2, "förp")];
    const [two] = suggest([item("Mjölk", null, null)], [match(mjolk)], { current });
    expect([two.amount, two.unit]).toEqual([null, null]);
    expect(two.current).toEqual({ unlimited: false, amounts: [{ amount: 1, unit: "l" }, { amount: 2, unit: "förp" }] });
    const [none] = suggest([item("Mjölk", null, null)], [match(mjolk)], { current: [row(smor, 1, "förp")] });
    expect([none.amount, none.unit, none.current]).toEqual([null, null, null]);
  });

  it("shows no current amounts, and fills none in, when the place could not be read", () => {
    const [suggestion] = suggest([item("Mjölk", null, null)], [match(mjolk)], { current: null });
    expect(suggestion).toMatchObject({ amount: null, unit: null, current: null });
  });

  it("sorts in Swedish order, å, ä and ö last", () => {
    const items = [item("Ägg", 1, "st"), item("Ost", 1, "förp"), item("Äpple", 1, "st"), item("Ål", 1, "förp")];
    const suggestions = suggest(items, [fresh("ägg"), fresh("ost"), fresh("äpple"), fresh("ål")]);
    expect(suggestions.map(({ name }) => name)).toEqual(["ost", "ål", "ägg", "äpple"]);
  });

  it("gives nothing for no items", () => {
    expect(toPantrySuggestions([], [], { location: "Kyl", names, current: [] })).toEqual({
      suggestions: [],
      dropped: { unmatched: 0, unnamed: 0, unusable: 0 },
    });
  });
});

describe("analyzeResultSchema", () => {
  const suggestion: PantrySuggestion = {
    id: "s1",
    name: "mjölk",
    ingredient: { kind: "existing", ingredientId: mjolk },
    location: "Kyl",
    amount: 1,
    unit: "förp",
    current: null,
  };

  it("takes an empty list and up to 25 suggestions, with the count of items left out", () => {
    expect(maxPantrySuggestions).toBe(25);
    expect(analyzeResultSchema.safeParse({ location: "Kyl", suggestions: [], dropped: 3 }).success).toBe(true);
    const all = Array.from({ length: 25 }, (_, index) => ({ ...suggestion, id: `s${index + 1}` }));
    expect(analyzeResultSchema.safeParse({ location: "Frys", suggestions: all, dropped: 0 }).success).toBe(true);
    expect(analyzeResultSchema.safeParse({ location: "Frys", suggestions: [...all, suggestion], dropped: 0 }).success).toBe(false);
    expect(analyzeResultSchema.safeParse({ location: "Frys", suggestions: [] }).success).toBe(false);
    expect(analyzeResultSchema.safeParse({ location: "Frys", suggestions: [], dropped: -1 }).success).toBe(false);
  });

  it.each([
    ["an amount without unit", { amount: 1, unit: null }],
    ["a unit without amount", { amount: null, unit: "förp" }],
    ["an unknown unit", { unit: "tub" }],
    ["an amount of a million", { amount: 1_000_000 }],
    ["an id that is not a uuid", { ingredient: { kind: "existing", ingredientId: "mjölk" } }],
    ["an unknown place", { location: "Källare" }],
    ["a new name without letters", { ingredient: { kind: "new", proposalId: "n1", name: "!!!", section: "Övrigt", location: "Kyl", defaultUnit: null } }],
    ["a new name that is a web address", { ingredient: { kind: "new", proposalId: "n1", name: "www.exempel.se", section: "Övrigt", location: "Kyl", defaultUnit: null } }],
    ["a new ingredient without proposal id", { ingredient: { kind: "new", name: "ost", section: "Övrigt", location: "Kyl", defaultUnit: null } }],
  ])("refuses %s", (_name, change) => {
    expect(analyzeResultSchema.safeParse({ location: "Kyl", suggestions: [{ ...suggestion, ...change }], dropped: 0 }).success).toBe(false);
  });
});

describe("texts", () => {
  it("names the place on the camera button and the heading", () => {
    expect(cameraButtonText("Kyl")).toBe("Fotografera kylen");
    expect(cameraButtonText("Frys")).toBe("Fotografera frysen");
    expect(cameraButtonText("Skafferi")).toBe("Fotografera skafferiet");
    expect(suggestionsHeading("Kyl")).toBe("Lagerförslag från kylen");
    expect(suggestionsHeading("Skafferi")).toBe("Lagerförslag från skafferiet");
  });

  it("says what the place has now", () => {
    expect(currentAmountText("Kyl", { unlimited: false, amounts: [{ amount: 2, unit: "förp" }] })).toBe("I kylen nu: 2 förp");
    expect(
      currentAmountText("Frys", {
        unlimited: false,
        amounts: [
          { amount: 0.5, unit: "kg" },
          { amount: 1, unit: "förp" },
        ],
      }),
    ).toBe("I frysen nu: 0,5 kg, 1 förp");
    expect(currentAmountText("Kyl", { unlimited: true, amounts: [] })).toBe("I kylen nu: finns hemma");
  });

  it("shows a suggestion's amount, or Finns hemma", () => {
    expect(suggestionAmountText({ amount: 6, unit: "st" })).toBe("6 st");
    expect(suggestionAmountText({ amount: 1.5, unit: "l" })).toBe("1,5 l");
    expect(suggestionAmountText({ amount: null, unit: null })).toBe("Finns hemma");
  });

  it("has the empty texts and its own text for a photo the AI did not take", () => {
    expect(noSuggestionsText).toBe("Hittade inga varor på bilden. Prova ett ljusare foto eller lägg till för hand.");
    expect(unreadableItemsText).toBe("Det gick inte att tolka varorna på bilden. Ta en ny bild eller lägg till för hand.");
    expect(suggestionsArrivedText("Kyl", 6)).toBe("6 lagerförslag från kylen.");
    expect(suggestionsArrivedText("Skafferi", 1)).toBe("1 lagerförslag från skafferiet.");
    expect(analyzeErrorMessage(fail("ai_rejected").error)).toBe(
      "AI-tjänsten tog inte emot bilden. Ta en ny bild eller försök igen senare.",
    );
    expect(analyzeErrorMessage(fail("ai_unavailable").error)).toBe(errorMessages.ai_unavailable);
    expect(analyzeErrorMessage(fail("image_too_large").error)).toBe(errorMessages.image_too_large);
  });

  it("offers Försök igen for the AI and the catalog, never for a photo that cannot be read", () => {
    expect([...analyzeRetryCodes].sort()).toEqual(["ai_invalid", "ai_rejected", "ai_unavailable", "catalog_unavailable"]);
    expect(analyzeRetryCodes.has("image_unsupported")).toBe(false);
    expect(analyzeRetryCodes.has("image_too_large")).toBe(false);
  });
});
