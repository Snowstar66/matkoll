import { describe, expect, it } from "vitest";
import type { IngredientMatch, Location, Unit } from "@/features/catalog";
import { errorMessages, fail } from "@/lib/errors";
import type { PantryAmountRow } from "./pantry-item";
import {
  allUnchangedText,
  analyzedPhotoNoteText,
  analyzeErrorMessage,
  analyzeResultSchema,
  changeSpokenText,
  changeText,
  incompleteComparisonText,
  inventoryConfirmSchema,
  unchangedCountText,
  unreadPlaceText,
  withoutPlace,
  withRestoredPlace,
  changedPlaceText,
  partlyUnchangedText,
  changesLeftText,
  undoRemovalLabel,
  analyzeRetryCodes,
  cameraButtonText,
  confirmItemFromForm,
  confirmItemFromSuggestion,
  confirmSuggestionsSchema,
  currentAmountText,
  isUsableNewName,
  maxPantrySuggestions,
  maxSuggestionAmount,
  isConfirmable,
  mergeConfirmations,
  mergePantrySets,
  noSuggestionsText,
  withConfirmedStock,
  withoutStock,
  withRestoredStock,
  pantrySuggestionSchema,
  suggestionAmountText,
  suggestionsArrivedText,
  suggestionsHeading,
  isPhotoOfSite,
  photoSiteId,
  suggestionsSiteText,
  toPantrySuggestions,
  unreadableItemsText,
  isBulkConfirmable,
  maxSuggestionLabels,
  savedAsText,
  suggestionTitle,
  uncertainBadgeText,
  uncertainLeftText,
  uncertainSuggestionText,
  type AiPantryItemLike,
  type ConfirmItem,
  type ConfirmItemInput,
  type PantrySuggestion,
} from "./pantry-suggestion";
import { pantryItemFormSchema, type PantryItemFormInput } from "./pantry-item-form";

const id = (n: number) => `6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a0${n}`;
const mjolk = id(1);
const smor = id(2);
/** The place a photo was taken for (Story 8.4). */
const photoSite = { id: "55555555-5555-4555-8555-555555555555", name: "Stugan" };

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
      // Compared with the place later (compareWithPlace).
      change: null,
      replaces: [],
      labels: ["Arla mellanmjölk"],
      uncertain: false,
      itemNumbers: [1],
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

  it("gives each suggestion the numbers of its items in reading order, and each unit's card only its own (Story 6.6)", () => {
    const items = [
      item("Arla mellanmjölk", 1, "förp", "mjölk"),
      item("?", 1, "st"),
      item("Smör", 1, "förp"),
      item("ICA mellanmjölk", 1, "l", "mjölk"),
      item("Mjölk", null, null, "mjölk"),
      item("Garant mjölk", 1, "förp", "mjölk"),
    ];
    const suggestions = suggest(items, [match(mjolk), { kind: "unmatched" }, match(smor), match(mjolk), match(mjolk), match(mjolk)]);
    // The item without amount goes with the first unit's card, as its amount does; no number is on two cards.
    expect(suggestions.map(({ name, unit, itemNumbers }) => [name, unit, itemNumbers])).toEqual([
      ["mjölk", "förp", [1, 5, 6]],
      ["mjölk", "l", [4]],
      ["smör", "förp", [3]],
    ]);
    const all = suggestions.flatMap(({ itemNumbers }) => itemNumbers ?? []);
    expect(new Set(all).size).toBe(all.length);
    // Unlimited: one card with every number.
    const [unlimited] = suggest([item("Smör", 1, "förp"), item("Smör", 1, "tub")], [match(smor), match(smor)]);
    expect(unlimited).toMatchObject({ amount: null, itemNumbers: [1, 2] });
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

  it("keeps the items' different labels in order, at most three, for the card's title (Story 6.5)", () => {
    const items = [
      item("Arla mellanmjölk 1,5 l", 1, "förp", "mjölk"),
      item("ICA mellanmjölk", 1, "förp", "mjölk"),
      item("arla  MELLANMJÖLK 1,5 l", 1, "förp", "mjölk"),
      item("Garant mellanmjölk", 1, "förp", "mjölk"),
      item("Skånemejerier mellanmjölk", 1, "förp", "mjölk"),
    ];
    const [suggestion] = suggest(items, items.map(() => match(mjolk)));
    expect(maxSuggestionLabels).toBe(3);
    expect(suggestion.labels).toEqual(["Arla mellanmjölk 1,5 l", "ICA mellanmjölk", "Garant mellanmjölk"]);
    // Different labels are different packages: the amounts are summed as before.
    expect(brief([suggestion])).toEqual([["mjölk", 5, "förp"]]);
    expect(pantrySuggestionSchema.safeParse(suggestion).success).toBe(true);
  });

  it("marks a suggestion unsure when any of its items was the model's guess, and sure without confidence (Story 6.5)", () => {
    const sure = { ...item("Johnny's senap", 1, "förp", "senap"), confidence: "säker" as const };
    const guess = { ...item("Gul flaska, troligen senap", 1, "förp", "senap"), confidence: "osäker" as const };
    const plain = item("Smör", 1, "förp");
    const suggestions = suggest([sure, guess, plain], [fresh("senap"), fresh("senap"), match(smor)]);
    expect(suggestions.map(({ name, uncertain, amount }) => [name, uncertain, amount])).toEqual([
      ["senap", true, 2],
      ["smör", false, 1],
    ]);
    expect(isBulkConfirmable(suggestions[0])).toBe(false);
    expect(isBulkConfirmable(suggestions[1])).toBe(true);
    // A suggestion without the field (before Story 6.5) is sure.
    expect(isBulkConfirmable({})).toBe(true);
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
    change: null,
    replaces: [],
  };

  it("takes an empty list and up to 25 suggestions, with the count of items left out", () => {
    expect(maxPantrySuggestions).toBe(25);
    expect(analyzeResultSchema.safeParse({ site: null, location: "Kyl", suggestions: [], dropped: 3, inventory: { kind: "unread" } }).success).toBe(true);
    const all = Array.from({ length: 25 }, (_, index) => ({ ...suggestion, id: `s${index + 1}` }));
    expect(analyzeResultSchema.safeParse({ site: photoSite, location: "Frys", suggestions: all, dropped: 0, inventory: { kind: "empty" } }).success).toBe(true);
    expect(analyzeResultSchema.safeParse({ location: "Frys", suggestions: [...all, suggestion], dropped: 0 }).success).toBe(false);
    expect(analyzeResultSchema.safeParse({ location: "Frys", suggestions: [] }).success).toBe(false);
    expect(analyzeResultSchema.safeParse({ location: "Frys", suggestions: [], dropped: -1 }).success).toBe(false);
  });

  it("has the photo's place, or null for a user without places (Story 8.4)", () => {
    const empty = { location: "Kyl", suggestions: [], dropped: 0, inventory: { kind: "empty" } };
    expect(analyzeResultSchema.safeParse({ ...empty, site: photoSite }).success).toBe(true);
    expect(analyzeResultSchema.safeParse({ ...empty, site: { ...photoSite, name: "s".repeat(40) } }).success).toBe(true);
    // An answer without a place (a server of before Story 8.4) reads as null; the client puts the place it sent.
    expect(analyzeResultSchema.parse(empty).site).toBeNull();
    expect(analyzeResultSchema.safeParse({ ...empty, site: { ...photoSite, id: "stugan" } }).success).toBe(false);
    expect(analyzeResultSchema.safeParse({ ...empty, site: { ...photoSite, name: "" } }).success).toBe(false);
    expect(analyzeResultSchema.safeParse({ ...empty, site: { ...photoSite, name: "s".repeat(41) } }).success).toBe(false);
    expect(suggestionsSiteText("Stugan")).toBe("Förslagen gäller Stugan.");
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

describe("pantrySuggestionSchema labels and uncertain (Story 6.5)", () => {
  const suggestion = {
    id: "s1",
    name: "mjölk",
    ingredient: { kind: "existing", ingredientId: mjolk },
    location: "Kyl",
    amount: 1,
    unit: "förp",
    current: null,
    change: null,
    replaces: [],
  };

  it("takes up to three labels and the flag, and a suggestion without them", () => {
    expect(pantrySuggestionSchema.safeParse(suggestion).success).toBe(true);
    expect(pantrySuggestionSchema.safeParse({ ...suggestion, labels: ["a", "b", "c"], uncertain: true }).success).toBe(true);
  });

  it.each([
    ["four labels", { labels: ["a", "b", "c", "d"] }],
    ["an empty label", { labels: [" "] }],
    ["a label over 200 characters", { labels: ["x".repeat(201)] }],
    ["a flag that is not a boolean", { uncertain: "osäker" }],
  ])("refuses %s", (_name, change) => {
    expect(pantrySuggestionSchema.safeParse({ ...suggestion, ...change }).success).toBe(false);
  });
});

describe("item numbers and the reading (Story 6.6)", () => {
  const suggestion = {
    id: "s1",
    name: "mjölk",
    ingredient: { kind: "existing", ingredientId: mjolk },
    location: "Kyl",
    amount: 1,
    unit: "förp",
    current: null,
    change: null,
    replaces: [],
  };
  const result = { site: null, location: "Kyl", suggestions: [], dropped: 0, inventory: { kind: "empty" } };

  it("takes a suggestion's item numbers 1 to 25, and none", () => {
    expect(pantrySuggestionSchema.safeParse({ ...suggestion, itemNumbers: [1, 25] }).success).toBe(true);
    expect(pantrySuggestionSchema.safeParse({ ...suggestion, itemNumbers: [] }).success).toBe(true);
  });

  it.each([
    ["number 0", [0]],
    ["number 26", [26]],
    ["a fraction", [1.5]],
    ["26 numbers", Array.from({ length: 26 }, () => 1)],
  ])("refuses item numbers with %s", (_name, itemNumbers) => {
    expect(pantrySuggestionSchema.safeParse({ ...suggestion, itemNumbers }).success).toBe(false);
  });

  it("takes a reading of up to 25 one-line labels, and an answer without one", () => {
    expect(analyzeResultSchema.safeParse(result).success).toBe(true);
    expect(analyzeResultSchema.safeParse({ ...result, reading: Array.from({ length: 25 }, () => "Mjölk") }).success).toBe(true);
  });

  it.each([
    ["26 labels", Array.from({ length: 26 }, () => "Mjölk")],
    ["an empty label", [""]],
    ["a line break", ["Arla\nmjölk"]],
    ["spaces around", [" Mjölk"]],
    ["a label over 200 characters", ["x".repeat(201)]],
  ])("refuses a reading with %s", (_name, reading) => {
    expect(analyzeResultSchema.safeParse({ ...result, reading }).success).toBe(false);
  });
});

describe("texts", () => {
  it("titles a card with the labels and the catalog name under them, or the name alone (Story 6.5)", () => {
    expect(suggestionTitle({ name: "vispgrädde", labels: ["ICA vispgrädde 36 %"] })).toEqual({
      title: "ICA vispgrädde 36 %",
      ingredientName: "vispgrädde",
    });
    expect(suggestionTitle({ name: "mjölk", labels: ["Arla mellanmjölk", "ICA mellanmjölk"] })).toEqual({
      title: "Arla mellanmjölk, ICA mellanmjölk",
      ingredientName: "mjölk",
    });
    expect(suggestionTitle({ name: "ägg", labels: ["Ägg"] })).toEqual({ title: "ägg", ingredientName: null });
    expect(suggestionTitle({ name: "ägg", labels: [] })).toEqual({ title: "ägg", ingredientName: null });
    expect(suggestionTitle({ name: "ägg" })).toEqual({ title: "ägg", ingredientName: null });
    // Story 10.4: a label that is the catalog name in other case is the name; no "Sparas som".
    expect(suggestionTitle({ name: "Gurka", labels: ["gurka"] })).toEqual({ title: "Gurka", ingredientName: null });
    expect(savedAsText("vispgrädde")).toBe("Sparas som: Vispgrädde");
  });

  it("says when the AI was unsure, and how many unsure suggestions are left (Story 6.5)", () => {
    expect(uncertainBadgeText).toBe("Osäker");
    expect(uncertainSuggestionText).toBe("AI:n är osäker på varan, så Bekräfta alla tar inte med den.");
    expect(uncertainLeftText(1)).toBe("1 osäker vara är kvar att bekräfta eller rätta.");
    expect(uncertainLeftText(2)).toBe("2 osäkra varor är kvar att bekräfta eller rätta.");
  });

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
    expect([...analyzeRetryCodes].sort()).toEqual(["ai_invalid", "ai_rejected", "ai_unavailable", "catalog_unavailable", "pantry_unavailable"]);
    // Story 8.4: a place that is gone fails again.
    expect(analyzeRetryCodes.has("pantry_site_gone")).toBe(false);
    expect(analyzeRetryCodes.has("image_unsupported")).toBe(false);
    expect(analyzeRetryCodes.has("image_too_large")).toBe(false);
  });
});

describe("confirmSuggestionsSchema", () => {
  const existing = (change: Partial<ConfirmItemInput> = {}): ConfirmItemInput => ({
    ingredient: { kind: "existing", ingredientId: mjolk },
    location: "Kyl",
    amount: 1,
    unit: "förp",
    ...change,
  });
  const fresh = (name: string): ConfirmItemInput => ({
    ingredient: { kind: "new", proposalId: "n1", name, section: "Mejeri", location: "Kyl", defaultUnit: "st" },
    location: "Kyl",
    amount: 6,
    unit: "st",
  });
  const parse = (items: unknown) => confirmSuggestionsSchema.safeParse({ siteId: photoSite.id, items });

  it("takes 1 to 40 items, unlimited ones and amounts just below 1 000 000", () => {
    expect(parse([existing()]).success).toBe(true);
    expect(parse(Array.from({ length: 40 }, () => existing())).success).toBe(true);
    expect(parse([existing({ amount: null, unit: null })]).success).toBe(true);
    expect(parse([existing({ amount: 999_999.999 })]).success).toBe(true);
    expect(parse([]).success).toBe(false);
    expect(parse(Array.from({ length: 41 }, () => existing())).success).toBe(false);
  });

  it("takes a new ingredient with or without its proposal id, and collapses its name", () => {
    const parsed = parse([fresh("  gul   lök ")]);
    expect(parsed.success && parsed.data.items[0].ingredient).toEqual({
      kind: "new",
      proposalId: "n1",
      name: "gul lök",
      section: "Mejeri",
      location: "Kyl",
      defaultUnit: "st",
    });
    const withoutId = { ...(fresh("ägg").ingredient as Extract<ConfirmItemInput["ingredient"], { kind: "new" }>), proposalId: undefined };
    expect(parse([{ ...fresh("ägg"), ingredient: withoutId }]).success).toBe(true);
    expect(parse([fresh("a".repeat(100))]).success).toBe(true);
  });

  it.each([
    ["an amount without unit", existing({ unit: null })],
    ["a unit without amount", existing({ amount: null })],
    ["a zero amount", existing({ amount: 0 })],
    ["a negative amount", existing({ amount: -2 })],
    ["an amount of 1 000 000", existing({ amount: 1_000_000 })],
    ["an unknown unit", existing({ unit: "tub" as never })],
    ["an unknown place", existing({ location: "Källare" as never })],
    ["an id that is not a uuid", existing({ ingredient: { kind: "existing", ingredientId: "mjölk" } })],
    ["a new name with nothing to store", fresh("!!!")],
    ["a new name over 100 characters", fresh("a".repeat(101))],
    ["an empty new name", fresh("   ")],
  ])("refuses %s", (_name, item) => {
    expect(parse([item]).success).toBe(false);
  });
});

describe("mergeConfirmations", () => {
  const fresh = (name: string, section: "Mejeri" | "Övrigt" = "Mejeri", defaultUnit: "st" | "förp" | null = "st") =>
    ({ kind: "new", name, section, location: "Kyl", defaultUnit }) as const;
  const at = (ingredient: ConfirmItem["ingredient"], amount: number | null, unit: ConfirmItem["unit"], location: ConfirmItem["location"] = "Kyl"): ConfirmItem => ({
    ingredient,
    location,
    amount,
    unit,
  });
  const mjolkIngredient = { kind: "existing", ingredientId: mjolk } as const;
  const smorIngredient = { kind: "existing", ingredientId: smor } as const;

  it("keeps items that differ in ingredient, place or unit, in their order", () => {
    const items = [
      at(smorIngredient, null, null),
      at(mjolkIngredient, 1, "förp"),
      at(mjolkIngredient, 1, "l"),
      at(mjolkIngredient, 2, "förp", "Frys"),
      at(fresh("ägg"), 6, "st"),
    ];
    expect(mergeConfirmations(items)).toEqual(items);
  });

  it("sums the same ingredient, place and unit, below 1 000 000", () => {
    expect(mergeConfirmations([at(mjolkIngredient, 1, "förp"), at(mjolkIngredient, 1.5, "förp")])).toEqual([
      at(mjolkIngredient, 2.5, "förp"),
    ]);
    expect(mergeConfirmations([at(mjolkIngredient, 0.1, "l"), at(mjolkIngredient, 0.2, "l")])).toEqual([at(mjolkIngredient, 0.3, "l")]);
    expect(mergeConfirmations([at(mjolkIngredient, 999_999, "förp"), at(mjolkIngredient, 999_999, "förp")])).toEqual([
      at(mjolkIngredient, maxSuggestionAmount, "förp"),
    ]);
  });

  it("never mixes unlimited and amounts for an ingredient in a place: the amounts win", () => {
    expect(
      mergeConfirmations([at(mjolkIngredient, null, null), at(mjolkIngredient, 2, "förp"), at(mjolkIngredient, null, null)]),
    ).toEqual([at(mjolkIngredient, 2, "förp")]);
    // In another place the unlimited item stays.
    expect(mergeConfirmations([at(mjolkIngredient, null, null, "Frys"), at(mjolkIngredient, 2, "förp")])).toEqual([
      at(mjolkIngredient, null, null, "Frys"),
      at(mjolkIngredient, 2, "förp"),
    ]);
    expect(mergeConfirmations([at(smorIngredient, null, null), at(smorIngredient, null, null)])).toEqual([at(smorIngredient, null, null)]);
  });

  it("makes new ingredients with the same normalised name one, keeping the first one's name, section and unit", () => {
    expect(
      mergeConfirmations([at(fresh("Ägg", "Mejeri", "st"), 6, "st"), at(fresh("ägg", "Övrigt", null), 4, "st"), at(fresh("ägg", "Övrigt", null), 1, "förp")]),
    ).toEqual([at(fresh("Ägg", "Mejeri", "st"), 10, "st"), at(fresh("Ägg", "Mejeri", "st"), 1, "förp")]);
  });

  it("gives nothing for nothing", () => {
    expect(mergeConfirmations([])).toEqual([]);
  });
});

describe("confirmItemFromSuggestion and confirmItemFromForm", () => {
  it("confirms a suggestion as it is: ingredient, place, amount and unit", () => {
    const suggestion: PantrySuggestion = {
      id: "s1",
      name: "ägg",
      ingredient: { kind: "new", proposalId: "n1", name: "ägg", section: "Mejeri", location: "Kyl", defaultUnit: "st" },
      location: "Kyl",
      amount: 6,
      unit: "st",
      current: null,
      change: null,
      replaces: [],
    };
    expect(confirmItemFromSuggestion(suggestion)).toEqual({
      ingredient: suggestion.ingredient,
      location: "Kyl",
      amount: 6,
      unit: "st",
    });
    expect(confirmSuggestionsSchema.safeParse({ siteId: null, items: [confirmItemFromSuggestion(suggestion)] }).success).toBe(true);
  });

  // The place does not reach a confirmation: confirmPantrySuggestions sends none until Story 8.4.
  const form = (input: Omit<PantryItemFormInput, "siteId">) =>
    pantryItemFormSchema.parse({ ...input, siteId: "44444444-4444-4444-8444-444444444444" });

  it("confirms the sheet's form, a new ingredient with the form's place as its default place", () => {
    const corrected = form({
      ingredient: { kind: "new", name: "matlagningsgrädde", section: "Mejeri", location: "Kyl" },
      amount: "2",
      unit: "dl",
      location: "Frys",
      replaceId: null,
    });
    expect(confirmItemFromForm(corrected)).toEqual({
      ingredient: { kind: "new", name: "matlagningsgrädde", section: "Mejeri", location: "Frys", defaultUnit: "dl" },
      location: "Frys",
      amount: 2,
      unit: "dl",
    });
  });

  it("confirms an existing ingredient from the form, unlimited without an amount and in st without a unit", () => {
    const base = { ingredient: { kind: "existing", ingredientId: mjolk }, location: "Kyl", replaceId: null } as const;
    expect(confirmItemFromForm(form({ ...base, amount: "", unit: "förp" }))).toEqual({
      ingredient: { kind: "existing", ingredientId: mjolk },
      location: "Kyl",
      amount: null,
      unit: null,
    });
    expect(confirmItemFromForm(form({ ...base, amount: "1,5", unit: "" }))).toMatchObject({ amount: 1.5, unit: "st" });
  });

  describe("the label (Story 11.2)", () => {
    const mellanmjolk: PantrySuggestion = {
      id: "s1",
      name: "Mellanmjölk",
      ingredient: { kind: "existing", ingredientId: mjolk },
      location: "Kyl",
      amount: 1,
      unit: "förp",
      current: null,
      change: null,
      replaces: [],
      labels: ["Arla Mellanmjölk laktosfri 1,5 l", "Mjölk"],
    };

    it("confirms a suggestion with its first label as a photo label, which fills only an item without one", () => {
      expect(confirmItemFromSuggestion(mellanmjolk)).toMatchObject({ photoLabel: "Arla Mellanmjölk laktosfri 1,5 l" });
      expect("label" in confirmItemFromSuggestion(mellanmjolk)).toBe(false);
      expect(confirmSuggestionsSchema.safeParse({ siteId: null, items: [confirmItemFromSuggestion(mellanmjolk)] }).success).toBe(
        true,
      );
    });

    it("cuts a long label to 60 characters at a word", () => {
      const long = { ...mellanmjolk, labels: [`Arla ${"mellanmjölk ".repeat(10)}`] };
      expect(confirmItemFromSuggestion(long).photoLabel).toBe("Arla mellanmjölk mellanmjölk mellanmjölk mellanmjölk");
      expect(confirmSuggestionsSchema.safeParse({ siteId: null, items: [confirmItemFromSuggestion(long)] }).success).toBe(true);
    });

    it("takes the first label that is more than the name", () => {
      expect(confirmItemFromSuggestion({ ...mellanmjolk, labels: ["mellanmjölk", "Arla"] })).toMatchObject({ photoLabel: "Arla" });
    });

    it("leaves the label out without labels, so the item keeps its own", () => {
      expect("photoLabel" in confirmItemFromSuggestion({ ...mellanmjolk, labels: undefined })).toBe(false);
      expect("photoLabel" in confirmItemFromSuggestion({ ...mellanmjolk, labels: ["mellanmjölk"] })).toBe(false);
    });

    it("confirms the sheet's label after Rätta, with the photo's label as well", () => {
      const base = { ingredient: { kind: "existing", ingredientId: mjolk }, location: "Kyl", replaceId: null, amount: "1", unit: "förp" } as const;
      expect(confirmItemFromForm(form({ ...base, label: "Arla" }), mellanmjolk)).toMatchObject({
        label: "Arla",
        photoLabel: "Arla Mellanmjölk laktosfri 1,5 l",
      });
      const asFilledIn = confirmItemFromForm(form(base), mellanmjolk);
      expect("label" in asFilledIn).toBe(false);
      expect(asFilledIn.photoLabel).toBe("Arla Mellanmjölk laktosfri 1,5 l");
    });

    const item = (labels: Pick<ConfirmItem, "label" | "photoLabel"> = {}, amount: number | null = 1): ConfirmItem => ({
      ingredient: { kind: "existing", ingredientId: mjolk },
      location: "Kyl",
      amount,
      unit: amount === null ? null : "förp",
      ...labels,
    });

    it("keeps the first item's label when items merge, also an explicit null, or the first a later item has", () => {
      expect(mergeConfirmations([item({ label: "Arla" }), item({ label: "Garant" })])).toEqual([{ ...item({ label: "Arla" }), amount: 2 }]);
      expect(mergeConfirmations([item(), item({ label: "Garant" })])).toEqual([{ ...item({ label: "Garant" }), amount: 2 }]);
      expect(mergeConfirmations([item({ label: null }), item({ label: "Garant" })])).toEqual([{ ...item({ label: null }), amount: 2 }]);
      expect(mergeConfirmations([item(), item({ photoLabel: "Arla" })])).toEqual([{ ...item({ photoLabel: "Arla" }), amount: 2 }]);
      expect(mergeConfirmations([item(), item()])).toEqual([{ ...item(), amount: 2 }]);
    });

    it("gives a dropped item without amount's label to the kept item when it has none", () => {
      expect(mergeConfirmations([item({ photoLabel: "Arla" }, null), item()])).toEqual([item({ photoLabel: "Arla" })]);
      expect(mergeConfirmations([item({ photoLabel: "Arla" }, null), item({ label: "Garant" })])).toEqual([item({ label: "Garant" })]);
    });

    it("keeps both labels through mergePantrySets", () => {
      expect(mergePantrySets([{ ingredientId: mjolk, location: "Kyl", amount: 1, unit: "l", label: "Arla", photoLabel: "Arla ko" }])).toEqual([
        { ingredientId: mjolk, location: "Kyl", amount: 1, unit: "l", label: "Arla", photoLabel: "Arla ko" },
      ]);
    });
  });

  describe("the place's own label (Story 11.2)", () => {
    const items: AiPantryItemLike[] = [
      { label: "Arla mellanmjölk", amount: 1, unit: "förp", hint: { name: "mjölk", section: "Mejeri", location: "Kyl", defaultUnit: "förp" } },
    ];
    const matches: IngredientMatch[] = [{ kind: "match", ingredientId: mjolk, confidence: "exact" }];

    it("gives a suggestion the label its row has, for Rätta", () => {
      const current = [{ ingredientId: mjolk, amount: 2, unit: "förp" as const, label: "Garant" }];
      const [suggestion] = toPantrySuggestions(items, matches, { location: "Kyl", names: { [mjolk]: "Mjölk" }, current }).suggestions;
      expect(suggestion.currentLabel).toBe("Garant");
      expect(pantrySuggestionSchema.safeParse({ ...suggestion, id: "s1" }).success).toBe(true);
    });

    it("gives none when the row has no label or the place could not be read", () => {
      const current = [{ ingredientId: mjolk, amount: 2, unit: "förp" as const, label: null }];
      expect("currentLabel" in toPantrySuggestions(items, matches, { location: "Kyl", names: { [mjolk]: "Mjölk" }, current }).suggestions[0]).toBe(false);
      expect("currentLabel" in toPantrySuggestions(items, matches, { location: "Kyl", names: { [mjolk]: "Mjölk" }, current: null }).suggestions[0]).toBe(false);
    });
  });
});

describe("review patches", () => {
  // The place does not reach a confirmation: confirmPantrySuggestions sends none until Story 8.4.
  const form = (input: Omit<PantryItemFormInput, "siteId">) =>
    pantryItemFormSchema.parse({ ...input, siteId: "44444444-4444-4444-8444-444444444444" });
  const gurka: PantrySuggestion = {
    id: "s1",
    name: "gurka",
    ingredient: { kind: "new", proposalId: "n1", name: "gurka", section: "Frukt och grönt", location: "Kyl", defaultUnit: "st" },
    location: "Kyl",
    amount: 2,
    unit: "st",
    current: null,
    change: null,
    replaces: [],
  };
  const mjolkSuggestion = (id: string, amount: number | null, unit: Unit | null): PantrySuggestion => ({
    id,
    name: "mjölk",
    ingredient: { kind: "existing", ingredientId: mjolk },
    location: "Kyl",
    amount,
    unit,
    current: { unlimited: false, amounts: [{ amount: 2, unit: "förp" }, { amount: 1, unit: "l" }] },
    change: null,
    replaces: [],
  });

  it("keeps a new suggestion's proposal, default place and unit through the sheet while its name is the same", () => {
    const corrected = form({
      ingredient: { kind: "new", name: "gurka", section: "Övrigt", location: "Frys" },
      amount: "3",
      unit: "",
      location: "Frys",
      replaceId: null,
    });
    expect(confirmItemFromForm(corrected, gurka)).toEqual({
      ingredient: { ...gurka.ingredient, section: "Övrigt" },
      location: "Frys",
      amount: 3,
      unit: "st",
    });
    // Another new ingredient is the form's own.
    const other = form({ ingredient: { kind: "new", name: "slanggurka", section: "Övrigt", location: "Frys" }, amount: "1", unit: "st", location: "Frys", replaceId: null });
    expect(confirmItemFromForm(other, gurka).ingredient).toEqual({
      kind: "new",
      name: "slanggurka",
      section: "Övrigt",
      location: "Frys",
      defaultUnit: "st",
    });
  });

  it("merges again on resolved ids", () => {
    expect(
      mergePantrySets([
        { ingredientId: mjolk, location: "Kyl", amount: 2, unit: "st" },
        { ingredientId: mjolk, location: "Kyl", amount: null, unit: null },
        { ingredientId: mjolk, location: "Kyl", amount: 1, unit: "st" },
        { ingredientId: smor, location: "Kyl", amount: null, unit: null },
      ]),
    ).toEqual([
      { ingredientId: mjolk, location: "Kyl", amount: 3, unit: "st" },
      { ingredientId: smor, location: "Kyl", amount: null, unit: null },
    ]);
  });

  it("updates what the place has now on the suggestions left, by ingredient and place", () => {
    const left = [mjolkSuggestion("s2", 1, "l"), { ...mjolkSuggestion("s3", 1, "l"), location: "Frys" as const }, gurka];
    const after = withConfirmedStock(left, [
      { ingredient: { kind: "existing", ingredientId: mjolk }, location: "Kyl", amount: 3, unit: "förp" },
    ]);
    expect(after[0].current).toEqual({ unlimited: false, amounts: [{ amount: 1, unit: "l" }, { amount: 3, unit: "förp" }] });
    // Another place, another ingredient: as they were.
    expect(after[1]).toEqual(left[1]);
    expect(after[2]).toEqual(gurka);

    expect(
      withConfirmedStock(left, [{ ingredient: { kind: "existing", ingredientId: mjolk }, location: "Kyl", amount: null, unit: null }])[0].current,
    ).toEqual({ unlimited: true, amounts: [] });
    // A new ingredient by its name; the first stock it has.
    const gurkaInLiters = { ...gurka, id: "s9", amount: 1, unit: "l" as const };
    expect(withConfirmedStock([gurkaInLiters], [confirmItemFromSuggestion(gurka)])[0].current).toEqual({
      unlimited: false,
      amounts: [{ amount: 2, unit: "st" }],
    });
    expect(withConfirmedStock(left, [])).toEqual(left);
  });

  it("tells a suggestion that can be confirmed as it is", () => {
    expect(isConfirmable(gurka)).toBe(true);
    expect(isConfirmable({ ...gurka, amount: 1_000_000 })).toBe(false);
    expect(isConfirmable({ ...gurka, unit: null })).toBe(false);
  });
});

describe("withoutStock and withRestoredStock (Töm en plats)", () => {
  const mjolk = "11111111-1111-4111-8111-111111111111";
  const smor = "22222222-2222-4222-8222-222222222222";
  const base = {
    amount: 1,
    unit: "förp" as const,
    current: { unlimited: false, amounts: [{ amount: 2, unit: "förp" as const }] },
    change: null,
    replaces: [] as string[],
  };
  const inKyl = (id: string, ingredientId: string, current: PantrySuggestionLike["current"] = base.current) =>
    ({ ...base, id, name: id, location: "Kyl" as const, ingredient: { kind: "existing" as const, ingredientId }, current });
  type PantrySuggestionLike = Parameters<typeof withoutStock>[0][number];
  const fresh = (id: string): PantrySuggestionLike => ({
    ...base,
    id,
    name: id,
    location: "Kyl",
    ingredient: { kind: "new", proposalId: "n1", name: id, section: "Mejeri", location: "Kyl", defaultUnit: "förp" },
    current: null,
  });

  it("takes I kylen nu away from the emptied location only", () => {
    const frys = { ...inKyl("s2", smor), location: "Frys" as const };
    expect(withoutStock([inKyl("s1", mjolk), frys], "Kyl")).toEqual([inKyl("s1", mjolk, null), frys]);
  });

  it("gives the location's suggestions the rows put back", () => {
    const rows = [
      { ingredientId: mjolk, location: "Kyl" as const, amount: 2, unit: "förp" as const },
      { ingredientId: mjolk, location: "Kyl" as const, amount: 5, unit: "dl" as const },
      { ingredientId: smor, location: "Kyl" as const, amount: null, unit: null },
      { ingredientId: smor, location: "Frys" as const, amount: 1, unit: "förp" as const },
    ];
    const restored = withRestoredStock([inKyl("s1", mjolk, null), inKyl("s2", smor, null), fresh("s3")], "Kyl", rows);
    expect(restored.map((suggestion) => suggestion.current)).toEqual([
      { unlimited: false, amounts: [{ amount: 5, unit: "dl" }, { amount: 2, unit: "förp" }] },
      { unlimited: true, amounts: [] },
      null,
    ]);
  });

  it("keeps what was confirmed since next to the rows put back", () => {
    const confirmed = inKyl("s1", mjolk, { unlimited: false, amounts: [{ amount: 1, unit: "l" }] });
    const [restored] = withRestoredStock([confirmed], "Kyl", [
      { ingredientId: mjolk, location: "Kyl", amount: 2, unit: "förp" },
    ]);
    expect(restored.current).toEqual({ unlimited: false, amounts: [{ amount: 1, unit: "l" }, { amount: 2, unit: "förp" }] });
    expect(withRestoredStock([confirmed], "Kyl", [])).toEqual([confirmed]);
  });
});

describe("Inventera en plats med foto: texts, schema and Töm", () => {
  const mjolk = "11111111-1111-4111-8111-111111111111";
  const rowId = "22222222-2222-4222-8222-222222222222";
  const operation = "33333333-3333-4333-8333-333333333333";

  it("shows what changed, with the arrow only for the eye", () => {
    const now = { unlimited: false, amounts: [{ amount: 2, unit: "förp" as const }] };
    expect(changeText(now, { amount: 1, unit: "förp" })).toBe("nu: 2 förp → bilden: 1 förp");
    expect(changeText({ unlimited: true, amounts: [] }, { amount: 1, unit: "förp" })).toBe("nu: finns hemma → bilden: 1 förp");
    expect(changeText(now, { amount: null, unit: null })).toBe("nu: 2 förp → bilden: finns hemma");
    expect(changeSpokenText("Kyl", now, { amount: 1, unit: "l" })).toBe("I kylen nu: 2 förp. På bilden: 1 l.");
  });

  it("counts the suggestions that match, and says when everything does or the place could not be read", () => {
    expect(unchangedCountText(1)).toBe("1 vara stämmer med lagret.");
    expect(unchangedCountText(2)).toBe("2 varor stämmer med lagret.");
    expect(allUnchangedText("Kyl")).toBe("Allt i kylen stämmer med bilden.");
    expect(unreadPlaceText("Skafferi")).toBe("Det gick inte att jämföra med lagret i skafferiet.");
    expect(incompleteComparisonText).toBe("Några varor på bilden gick inte att tolka. Kontrollera innan du tar bort.");
  });

  it("takes 0–40 items, at most 50 rows to replace and 1 000 to remove, something to do, and an operation id with removals", () => {
    const item = { ingredient: { kind: "existing" as const, ingredientId: mjolk }, location: "Kyl" as const, amount: 1, unit: "förp" as const };
    const base = { siteId: photoSite.id, location: "Kyl" as const, items: [item], replaceRowIds: [], removeRowIds: [], operationId: null };
    expect(inventoryConfirmSchema.safeParse(base).success).toBe(true);
    expect(inventoryConfirmSchema.safeParse({ ...base, items: [], removeRowIds: [rowId], operationId: operation }).success).toBe(true);
    for (const wrong of [
      { ...base, items: [] },
      { ...base, items: Array.from({ length: 41 }, () => item) },
      { ...base, replaceRowIds: Array.from({ length: 51 }, () => rowId) },
      { ...base, removeRowIds: Array.from({ length: 1001 }, () => rowId), operationId: operation },
      { ...base, removeRowIds: [rowId] },
      { ...base, removeRowIds: ["yoghurt"], operationId: operation },
      { ...base, location: "Källare" },
      { ...base, siteId: "stugan" },
      { ...base, siteId: undefined },
    ]) {
      expect(inventoryConfirmSchema.safeParse(wrong).success).toBe(false);
    }
  });

  it("makes a comparison with an emptied place a plain list, and leaves another place's alone", () => {
    const suggestion = {
      id: "s1",
      name: "mjölk",
      ingredient: { kind: "existing" as const, ingredientId: mjolk },
      location: "Kyl" as const,
      amount: 1,
      unit: "förp" as const,
      current: { unlimited: false, amounts: [{ amount: 2, unit: "förp" as const }] },
      change: "changed" as const,
      replaces: [rowId],
    };
    const result = {
      site: photoSite,
      location: "Kyl" as const,
      dropped: 0,
      suggestions: [suggestion],
      inventory: { kind: "compared" as const, incomplete: false, missing: [] },
    };
    expect(withoutPlace(result, photoSite.id, "Kyl")).toEqual({
      ...result,
      suggestions: [{ ...suggestion, current: null, change: null, replaces: [] }],
      inventory: { kind: "empty" },
    });
    expect(withoutPlace(result, photoSite.id, "Frys")).toEqual(result);
    // Story 8.4: emptying another place's location changes nothing.
    expect(withoutPlace(result, mjolk, "Kyl")).toEqual(result);
    expect(withRestoredPlace(result, mjolk, "Kyl")).toEqual(result);
    // A photo without a place is of no place: emptying a place never changes it.
    expect(withoutPlace({ ...result, site: null }, mjolk, "Kyl")).toEqual({ ...result, site: null });
    expect(isPhotoOfSite({ site: null }, mjolk)).toBe(false);
    expect(isPhotoOfSite(result, photoSite.id)).toBe(true);
    expect(photoSiteId(result)).toBe(photoSite.id);
    expect(photoSiteId({ site: null })).toBeNull();
    // After "Ångra" for the emptied place, the photo no longer matches it.
    expect(withRestoredPlace(withoutPlace(result, photoSite.id, "Kyl"), photoSite.id, "Kyl").inventory).toEqual({ kind: "unread", changed: true });
    expect(withRestoredPlace(result, photoSite.id, "Frys")).toEqual(result);
  });

  it("has texts for a changed place, a partial match, changes left and the removals' undo", () => {
    expect(changedPlaceText("Kyl")).toBe("Lagret i kylen har ändrats sedan bilden togs.");
    expect(partlyUnchangedText("Frys")).toBe(
      "Det som syns på bilden stämmer med lagret i frysen, men några varor gick inte att tolka.",
    );
    expect(changesLeftText(1)).toBe("1 ändring är kvar att bekräfta.");
    expect(changesLeftText(3)).toBe("3 ändringar är kvar att bekräfta.");
    expect(undoRemovalLabel).toBe("Ångra borttagning");
  });
});

describe("the photo during review (Story 10.1)", () => {
  it("says the photo is kept as the latest photo once something is confirmed", () => {
    expect(analyzedPhotoNoteText).toBe("Jämför förslagen med fotot. Det sparas som senaste foto när du bekräftar något.");
  });
});
