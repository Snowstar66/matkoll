import { describe, expect, it } from "vitest";
import { foodFit, foodPrefsOf, recipeFits } from "./dish-fit";
import { dish, menuOf, person } from "./fixtures";
import { matchPreference } from "./preferences";
import { rank, rankContext, recommend } from "./recommend";
import {
  foldLegacyTags,
  isPresetKey,
  maxOwnTastes,
  maxTastes,
  parseTastes,
  presetKeys,
  softFitFor,
  softHits,
  tasteGroups,
  tasteKeyFor,
  tasteKeyPattern,
  tasteLabel,
  tasteLists,
  tasteSummary,
  validateOwnTaste,
  withTaste,
} from "./tastes";

const d = (patch: Parameters<typeof dish>[0]) => dish({ kategori: "ej_tillampligt", forklaring: "", ...patch });

describe("the presets", () => {
  it("are grouped (Protein, Maträtter, Smaker och råvaror), each key valid and unique, the original eight among them", () => {
    expect(tasteGroups.map((group) => group.title)).toEqual(["Protein", "Maträtter", "Smaker och råvaror"]);
    expect(new Set(presetKeys).size).toBe(presetKeys.length);
    expect(presetKeys).toHaveLength(23);
    expect(presetKeys.every((key) => tasteKeyPattern.test(key))).toBe(true);
    for (const key of ["kott", "fisk", "skaldjur", "vegetariskt", "pasta", "pizza", "starkt", "sott"]) expect(isPresetKey(key)).toBe(true);
    expect(maxTastes).toBe(23 + maxOwnTastes);
  });

  it("have labels with Swedish letters, and an own key gets a capital", () => {
    expect(tasteLabel("vitlok")).toBe("Vitlök");
    expect(tasteLabel("nasi goreng")).toBe("Nasi goreng");
  });
});

describe("tasteKeyFor", () => {
  it("maps a typed text to the preset it names, else to an own key", () => {
    expect(tasteKeyFor("Vitlök")).toBe("vitlok");
    expect(tasteKeyFor(" kött ")).toBe("kott");
    expect(tasteKeyFor("Nasi  Goreng")).toBe("nasi goreng");
    expect(tasteKeyFor("Crème fraîche")).toBe("creme fraiche");
    expect(tasteKeyFor("Äpple!")).toBe("äpple");
  });

  it("gives null for markup, web addresses and texts without a letter or digit", () => {
    for (const text of ["<b>x</b>", "https://x.se", "{a}", "a`b", "!!!", ""]) expect(tasteKeyFor(text)).toBeNull();
  });

  it("is always a key the database accepts", () => {
    expect(tasteKeyFor("x".repeat(40))).toMatch(tasteKeyPattern);
    expect(tasteKeyFor("-lök")).toMatch(tasteKeyPattern);
  });
});

describe("validateOwnTaste", () => {
  const shown = ["vitlok", "ost"];
  it("accepts a new thing and says why it refuses", () => {
    expect(validateOwnTaste("Rödbetor", {}, shown)).toEqual({ key: "rödbetor", error: null });
    expect(validateOwnTaste("  ", {}, shown)).toEqual({ key: null, error: null });
    expect(validateOwnTaste("vitlök", {}, shown).error).toBe("Det finns redan i listan.");
    expect(validateOwnTaste("a".repeat(41), {}, shown).error).toBe("Max 40 tecken.");
    expect(validateOwnTaste("<script>", {}, shown).error).toContain("Skriv bara ord");
    expect(validateOwnTaste("???", {}, shown).error).toContain("minst ett ord");
  });

  it("stops at 40 own things", () => {
    const tastes = Object.fromEntries(Array.from({ length: maxOwnTastes }, (_, index) => [`sak ${index}`, 1 as const]));
    expect(validateOwnTaste("en till", tastes, shown).error).toBe("Max 40 egna saker.");
  });
});

describe("parseTastes and foldLegacyTags", () => {
  it("keeps only valid keys with -2, -1, 1 or 2", () => {
    expect(parseTastes({ ris: 2, soppa: 0, tacos: 3, "Nasi": 1, "nasi goreng": -1, "<b>": 1 })).toEqual({ ris: 2, "nasi goreng": -1 });
    expect(parseTastes(null)).toEqual({});
    expect(parseTastes([1, 2])).toEqual({});
  });

  it("folds the older lists in without overwriting, Undviker before Älskar", () => {
    expect(foldLegacyTags({ ris: 1 }, ["Ris", "Koriander"], ["koriander", "Paprika", "Oliver"])).toEqual({ ris: 1, koriander: -2, paprika: 2, oliver: 2 });
    expect(foldLegacyTags({}, "nonsense", null)).toEqual({});
  });

  it("does not fold past 40 own things", () => {
    const own = Object.fromEntries(Array.from({ length: maxOwnTastes }, (_, index) => [`sak ${index}`, 1 as const]));
    expect(foldLegacyTags(own, ["en till", "vitlök"], [])).toEqual({ ...own, vitlok: -2 });
  });
});

describe("withTaste and tasteLists", () => {
  it("sets a taste and clears it with 0, so nothing filled in means eats anything", () => {
    const set = withTaste(person(), "vitlok", -2);
    expect(set.tastes).toEqual({ vitlok: -2 });
    expect(withTaste(set, "vitlok", 0).tastes).toEqual({});
  });

  it("derives the lists every caller has always had: -2 and -1 are Undviker, 1 and 2 Älskar, with the strong ends marked", () => {
    const lists = tasteLists({ vitlok: -2, ost: -1, "nasi goreng": 2, paprika: 1, kott: 1 });
    expect(lists).toEqual({ dislikes: ["ost", "vitlök"], likes: ["kött", "paprika", "nasi goreng"], strongDislikes: ["vitlök"], strongLikes: ["nasi goreng"] });
  });

  it("can leave out the original eight, which a dish's category scores directly", () => {
    expect(tasteLists({ kott: -2, vitlok: -2 }, { withOriginals: false }).dislikes).toEqual(["vitlök"]);
  });
});

describe("tasteSummary", () => {
  it("is calm: who loves what, then what is avoided, or that nothing is filled in", () => {
    expect(tasteSummary("Anna", {})).toBe("Inget ifyllt: äter allt");
    expect(tasteSummary("Anna", { fisk: 2, paprika: 2, vitlok: -2, skaldjur: -1 })).toBe("Anna älskar fisk och paprika. Undviker skaldjur och vitlök.");
    expect(tasteSummary("Anna", { ris: 1, fisk: 2 })).toBe("Anna älskar fisk. Gillar ris.");
    expect(tasteSummary("Du", { vitlok: -2 })).toBe("Du undviker vitlök.");
  });
});

describe("matching the new presets (sv, en, es)", () => {
  it.each([
    ["ris", "Arroz con pollo", true],
    ["ris", "Fried rice", true],
    ["ris", "Grisfötter", false],
    ["ris", "Risotto ai funghi", true],
    ["soppa", "Gazpacho", true],
    ["soppa", "Tomato soup", true],
    ["soppa", "Sopa de ajo", true],
    ["sallad", "Ensalada mixta", true],
    ["sallad", "Salladslök", false],
    ["tacos", "Tacos al pastor", true],
    ["burgare", "Cheeseburger", true],
    ["burgare", "Hamburguesa", true],
    ["svamp", "Risotto con setas", true],
    ["lok", "Cebolla caramelizada", true],
    ["vitlok", "Gambas al ajillo", true],
    ["koriander", "Cilantro", true],
    ["paprika", "Pimiento relleno", true],
    ["tomat", "Pomodoro", true],
    ["oliver", "Aceitunas", true],
    ["oliver", "Olivolja", false],
    ["agg", "Huevos rotos", true],
    ["agg", "Äggplanta", false],
    ["notter", "Almond cake", true],
    ["ost", "Queso manchego", true],
    ["ost", "Ostron", false],
    ["sott", "Sötpotatis", false],
    ["sott", "Chocolate cake", true],
    ["starkt", "Spicy tuna", true],
  ])("%s on %s: %s", (key, name, expected) => {
    expect(matchPreference(tasteLabel(key), d({ originalnamn: name }))).toBe(expected);
  });

  it("still finds the broad groups by the dish's category", () => {
    expect(matchPreference("Vegetariskt", dish({ kategori: "veganskt", originalnamn: "Bowl", huvudingredienser: [], forklaring: "" }))).toBe(true);
    expect(matchPreference("Fisk", dish({ kategori: "fisk", originalnamn: "Dorada" }))).toBe(true);
  });
});

describe("softFitFor and softHits", () => {
  it("names what each person avoids and loves in a dish, the original eight included for softFitFor", () => {
    const anna = person({ id: "a", name: "Anna", tastes: { vitlok: -2, paprika: 1, kott: -1 } });
    const bo = person({ id: "b", name: "Bo" });
    const food = d({ originalnamn: "Paprikagryta", huvudingredienser: ["vitlök", "kyckling"] });
    expect(softFitFor(food, [anna, bo])).toEqual([{ person: anna, dislikes: ["kött", "vitlök"], likes: ["paprika"] }]);
  });

  it("leaves the original eight out of softHits (rank scores them by category) and counts the strong ones", () => {
    const anna = person({ tastes: { vitlok: -2, lok: -1, paprika: 2, kott: -2 } });
    const hits = softHits(anna, d({ originalnamn: "Gryta", huvudingredienser: ["vitlök", "lök", "paprika", "kyckling"] }));
    expect(hits).toEqual({ avoided: ["lök", "vitlök"], loved: ["paprika"], strongAvoided: 1, strongLoved: 1 });
  });
});

describe("ranking with strength", () => {
  const menu = menuOf([
    d({ originalnamn: "Vitlöksbiff", huvudingredienser: ["vitlök"] }),
    d({ originalnamn: "Lökbiff", huvudingredienser: ["lök"] }),
    d({ originalnamn: "Paprikagryta", huvudingredienser: ["paprika"] }),
    d({ originalnamn: "Ris med kyckling", huvudingredienser: ["ris"] }),
    d({ originalnamn: "Soppa", huvudingredienser: [] }),
  ]);
  const score = (tastes: Record<string, -2 | -1 | 1 | 2>, name: string) => {
    const dishes = menu.ratter;
    const target = dishes.find((entry) => entry.originalnamn === name)!;
    return rank(target, person({ tastes }), rankContext(dishes, "normalt")).score;
  };

  it("takes more off for Ogillar than for Hellre inte, and gives more for Älskar than Gillar", () => {
    expect(score({ vitlok: -2 }, "Vitlöksbiff")).toBeLessThan(score({ vitlok: -1 }, "Vitlöksbiff"));
    expect(score({ vitlok: -1 }, "Vitlöksbiff")).toBeLessThan(score({}, "Vitlöksbiff"));
    expect(score({ paprika: 2 }, "Paprikagryta")).toBeGreaterThan(score({ paprika: 1 }, "Paprikagryta"));
    expect(score({ paprika: 1 }, "Paprikagryta")).toBeGreaterThan(score({}, "Paprikagryta"));
  });

  it("matches the new presets in the advisor, and leads with what is loved", () => {
    const top = recommend(menu, [person({ tastes: { ris: 2, vitlok: -2 } })])[0].picks.map((pick) => pick.dish.originalnamn);
    expect(top[0]).toBe("Ris med kyckling");
    expect(top.at(-1)).not.toBe("Ris med kyckling");
  });
});

describe("what the callers get (recipes, notes, the AI prompt)", () => {
  const anna = (tastes: Record<string, -2 | -1 | 1 | 2>) => {
    const lists = tasteLists(tastes);
    return { name: "Anna", allergies: [] as never[], ...lists };
  };
  const gryta = { name: "Risotto", ingredients: ["2 dl ris", "2 vitlöksklyftor", "1 röd paprika", "1 knippe koriander"] };

  it("makes the same notes as before from the derived lists, and marks the strong end", () => {
    expect(foodFit(gryta, [anna({ vitlok: -2, koriander: -1, paprika: 1 })])).toEqual([
      { kind: "dislike", text: "Anna undviker vitlök och koriander", strong: true },
      { kind: "like", text: "Anna älskar paprika" },
    ]);
    expect(recipeFits([{ id: "r", title: "Risotto", lines: gryta.ingredients.map((originalText) => ({ originalText })) }], [anna({ ris: -1 })])).toEqual({
      r: [{ kind: "dislike", text: "Anna undviker ris" }],
    });
  });

  it("gives the AI prompt the avoid and love words in Swedish, without names", () => {
    expect(foodPrefsOf([anna({ vitlok: -2, skaldjur: -1, fisk: 2, "nasi goreng": 1 })])).toEqual({ allergies: [], avoid: ["skaldjur", "vitlök"], love: ["fisk", "nasi goreng"] });
  });
});
