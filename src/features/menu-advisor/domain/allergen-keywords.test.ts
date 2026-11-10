import { describe, expect, it } from "vitest";
import { foodFit, lineHasAllergen } from "./dish-fit";
import type { MenuAllergen } from "./types";

// Allergy matching in ingredient text is a HARD rule (the week agent and the advisor never propose a dish that may hold
// a household allergen): prefer a false "kan innehålla" over a silent miss. Swedish compounds put the allergen word at
// the END ("matlagningsgrädde") or in the middle ("jordnötssmör"), so these are checked as well as word starts.
// [allergen, ingredient line, whether it must be flagged]
type Row = readonly [MenuAllergen, string, boolean];

const gluten: Row[] = [
  ["gluten", "2 dl vetemjöl", true],
  ["gluten", "2 dl rågmjöl", true],
  ["gluten", "4 vetetortillas", true],
  ["gluten", "4 stora tortillabröd", true],
  ["gluten", "2 dl couscous", true],
  ["gluten", "300 g fullkornspasta", true],
  ["gluten", "2 dl bulgur", true],
  ["gluten", "1 dl ströbröd", true],
  ["gluten", "400 g falukorv", true],
  ["gluten", "2 pitabröd", true],
  ["gluten", "1 dl smörgåsmjöl", true],
  ["gluten", "2 msk sojasås", true],
  ["gluten", "2 dl havregryn", true],
  ["gluten", "4 dl dinkelmjöl", true],
  ["gluten", "2 dl majsmjöl", false],
  ["gluten", "2 dl rismjöl", false],
  ["gluten", "1 dl potatismjöl", false],
  ["gluten", "2 dl bovetemjöl", false],
  ["gluten", "3 dl kikärtsmjöl", false],
  ["gluten", "400 g glutenfri pasta", false],
  ["gluten", "1 rågad tsk salt", false],
  ["gluten", "1 tsk pepparkorn", false],
  ["gluten", "3 dl mjölk", false],
];

const laktos: Row[] = [
  ["laktos", "2 dl matlagningsgrädde", true],
  ["laktos", "2 dl vispgrädde", true],
  ["laktos", "1 dl creme fraiche", true],
  ["laktos", "2 dl crème fraîche", true],
  ["laktos", "2 dl turkisk yoghurt", true],
  ["laktos", "2 dl matyoghurt", true],
  ["laktos", "50 g smör", true],
  ["laktos", "2 msk margarin", true],
  ["laktos", "100 g getost", true],
  ["laktos", "200 g färskost", true],
  ["laktos", "1 dl mjölkchoklad", true],
  ["laktos", "5 dl standardmjölk", true],
  ["laktos", "5 dl filmjölk", true],
  ["laktos", "2 dl havregrädde", false],
  ["laktos", "4 dl kokosmjölk", false],
  ["laktos", "4 dl havremjölk", false],
  ["laktos", "4 dl sojamjölk", false],
  ["laktos", "4 dl mandelmjölk", false],
  ["laktos", "4 dl rismjölk", false],
  ["laktos", "3 dl sojayoghurt", false],
  ["laktos", "2 msk jordnötssmör", false],
  ["laktos", "2 msk kakaosmör", false],
  ["laktos", "3 dl laktosfri mjölk", false],
  ["laktos", "3 dl mjölkfri grädde", false],
  ["laktos", "12 ostron", false],
  ["laktos", "2 smörgåsar", false],
  ["laktos", "1 dl kost", false],
  ["laktos", "grillrost", false],
];

const notter: Row[] = [
  ["notter", "1 dl hackade valnötter", true],
  ["notter", "2 msk jordnötssmör", true],
  ["notter", "2 dl mandelmjöl", true],
  ["notter", "1 dl mandelmassa", true],
  ["notter", "2 msk hasselnötsolja", true],
  ["notter", "50 g cashewnötter", true],
  ["notter", "1 dl rostade cashew", true],
  ["notter", "1 dl pekannötter", true],
  ["notter", "2 dl mandelmjölk", true],
  ["notter", "1 dl pistagenötter", true],
  ["notter", "50 g pinjenötter", true],
  ["notter", "200 g marsipan", true],
  ["notter", "500 g nötfärs", false],
  ["notter", "400 g nötkött", false],
  ["notter", "1 nötbiff", false],
  ["notter", "1 krm muskotnöt", false],
  ["notter", "2 dl kokosnöt", false],
  ["notter", "500 g mandelpotatis", false],
];

const skaldjur: Row[] = [
  ["skaldjur", "300 g räkor", true],
  ["skaldjur", "300 g jätteräkor", true],
  ["skaldjur", "300 g kungsräkor", true],
  ["skaldjur", "1 räkcocktail", true],
  ["skaldjur", "2 dl skaldjurssås", true],
  ["skaldjur", "500 g skaldjursfond", true],
  ["skaldjur", "200 g krabbstick", true],
  ["skaldjur", "1 kg blåmusslor", true],
  ["skaldjur", "1 hummer", true],
  ["skaldjur", "20 kräftor", true],
  ["skaldjur", "200 g scampi", true],
  ["skaldjur", "200 g calamari", true],
  ["skaldjur", "räkna med 4 portioner", false],
];

const agg: Row[] = [
  ["agg", "4 ägg", true],
  ["agg", "2 äggulor", true],
  ["agg", "1 äggula", true],
  ["agg", "3 äggvitor", true],
  ["agg", "12 vaktelägg", true],
  ["agg", "2 hönsägg", true],
  ["agg", "2 msk majonnäs", true],
  ["agg", "2 msk vitlöksmajonnäs", true],
  ["agg", "2 msk aioli", true],
  ["agg", "2 msk remoulad", true],
  ["agg", "250 g äggnudlar", true],
  ["agg", "1 äggplanta", false],
  ["agg", "2 msk äggfri majonnäs", false],
];

const fisk: Row[] = [
  ["fisk", "400 g laxfilé", true],
  ["fisk", "400 g torskfilé", true],
  ["fisk", "400 g gravlax", true],
  ["fisk", "2 msk fisksås", true],
  ["fisk", "4 ansjovisfiléer", true],
  ["fisk", "2 dl fiskbuljong", true],
  ["fisk", "1 burk tonfisk", true],
  ["fisk", "100 g löjrom", true],
  ["fisk", "1 msk worcestersås", true],
  ["fisk", "400 g sejfilé", true],
  ["fisk", "400 g rödspättafilé", true],
  ["fisk", "300 g bläckfisk", false],
];

const soja: Row[] = [
  ["soja", "2 msk soja", true],
  ["soja", "2 msk sojasås", true],
  ["soja", "2 dl sojamjölk", true],
  ["soja", "200 g tofu", true],
  ["soja", "200 g rökt tofu", true],
  ["soja", "200 g silkestofu", true],
  ["soja", "1 dl edamame", true],
  ["soja", "1 msk misopasta", true],
  ["soja", "2 msk tamari", true],
  ["soja", "200 g tempeh", true],
  ["soja", "1 dl sojafärs", true],
  ["soja", "2 msk teriyakisås", true],
  ["soja", "2 dl mjölk", false],
];

const sesam: Row[] = [
  ["sesam", "1 msk sesam", true],
  ["sesam", "1 msk sesamfrön", true],
  ["sesam", "1 msk rostade sesamfrön", true],
  ["sesam", "1 msk sesamolja", true],
  ["sesam", "1 msk svartsesam", true],
  ["sesam", "2 msk tahini", true],
  ["sesam", "2 msk tahin", true],
  ["sesam", "200 g hummus", true],
  ["sesam", "1 dl solrosfrön", false],
];

describe("allergen keywords in ingredient lines (compounds included)", () => {
  it.each([...gluten, ...laktos, ...notter, ...skaldjur, ...agg, ...fisk, ...soja, ...sesam])("%s in '%s' -> %s", (allergen, line, expected) => {
    expect(lineHasAllergen(allergen, line)).toBe(expected);
  });
});

describe("recipes with compounds raise the allergy note", () => {
  it("says kan innehålla laktos for a gryta with matlagningsgrädde", () => {
    const notes = foodFit({ name: "Pastagryta", ingredients: ["2 dl matlagningsgrädde"] }, [{ name: "Anna", allergies: ["laktos"], dislikes: [], likes: [] }]);
    expect(notes).toMatchObject([{ kind: "allergy", text: "Kan innehålla laktos (Anna)" }]);
  });
  it("does not flag a coconut curry for laktos", () => {
    expect(foodFit({ name: "Curry", ingredients: ["4 dl kokosmjölk", "2 msk jordnötssmör"] }, [{ name: "Anna", allergies: ["laktos"], dislikes: [], likes: [] }])).toEqual([]);
  });
});

// Allergens the app does not track (senap, selleri, lupin, sulfit, ...) are not detected: the list is the eight in labels.ts.
