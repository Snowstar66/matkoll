import { describe, expect, it } from "vitest";
import { foodFit } from "./dish-fit";
import { dish, menuOf, person } from "./fixtures";
import { matchPreference } from "./preferences";
import { dishTasteKeys, recommend } from "./recommend";
import type { Taste } from "./profile";
import { parseTastes, tasteKeyFor, tasteLabel, tasteLists, tasteSummary, tasteWord } from "./tastes";

// "Kött" was split (2026-11-13): Rött kött (the key stays "kott"), Fläskkött ("flask") and Kyckling ("kyckling"), so a
// person who avoids red meat no longer gets chicken and pork dishes marked "Undviker". The same day Köttfärs (with
// köttbullar) and Blandfärs got presets of their own, so mince is neither red meat nor pork.

const meatKeys = ["kott", "flask", "kyckling", "kottfars", "blandfars"] as const;

/** The meat presets a recipe is marked for, as a person who has every one of them at Ogillar would see it. */
function recipeMeat(name: string, ingredients: readonly string[] = []): string[] {
  return meatKeys.filter((key) => foodFit({ name, ingredients }, [{ name: "A", allergies: [], dislikes: [tasteWord(key)], likes: [] }]).length > 0);
}

describe("which meat a dish is (recipes, cook-now, Matsedel: the Undviker marks)", () => {
  // Before the split every one of the first five was "kött", and Lammgryta and Kalkonburgare were not.
  it.each([
    ["Kycklinggryta", ["kyckling"]],
    ["Fläskfilé med sås", ["flask"]],
    ["Köttbullar", ["kottfars"]],
    ["Köttfärssås", ["kottfars"]],
    ["Spaghetti och köttbullar", ["kottfars"]],
    ["Hamburgare", []],
    ["Lasagne med blandfärs", ["blandfars"]],
    ["Biff med lök", ["kott"]],
    ["Korv stroganoff", ["flask"]],
    ["Pasta med bacon", ["flask"]],
    ["Lammgryta", ["kott"]],
    ["Kalkonburgare", ["kyckling"]],
  ])("%s is %j", (name, expected) => {
    expect(recipeMeat(name)).toEqual(expected);
  });

  it("reads the ingredient lines too: blandfärs is Blandfärs only, a stock cube is no meat", () => {
    expect(recipeMeat("Köttbullar", ["500 g blandfärs", "1 ägg"])).toEqual(["blandfars"]);
    expect(recipeMeat("Köttbullar", ["500 g nötfärs", "1 ägg"])).toEqual(["kottfars"]);
    expect(recipeMeat("Bolognese", ["400 g halvfärs", "1 lök"])).toEqual(["blandfars"]);
    expect(recipeMeat("Pasta med färsk basilika")).toEqual([]);
    expect(recipeMeat("Linssoppa", ["1 köttbuljongtärning", "2 dl linser"])).toEqual([]);
    expect(recipeMeat("Pyttipanna", ["300 g skinka", "200 g nötkött"])).toEqual(["kott", "flask"]);
    expect(recipeMeat("Kycklingwok", ["400 g kycklingfilé", "2 dl ris"])).toEqual(["kyckling"]);
    expect(recipeMeat("Spaghetti", ["500 g nötfärs"])).toEqual(["kottfars"]);
    expect(recipeMeat("Revbensspjäll")).toEqual(["flask"]);
    expect(recipeMeat("Kycklingkorv med mos")).toEqual(["kyckling"]);
    expect(recipeMeat("Pollock med potatis")).toEqual([]);
  });

  it("does not mark mince for someone who only avoids red meat, and the other way round", () => {
    const fit = (tastes: Record<string, Taste>, name: string, ingredients: string[] = []) => foodFit({ name, ingredients }, [{ name: "Anna", allergies: [], ...tasteLists(tastes) }]);
    expect(fit({ kott: -2 }, "Köttfärssås", ["500 g nötfärs"])).toEqual([]);
    expect(fit({ kott: -2 }, "Lasagne med blandfärs")).toEqual([]);
    expect(fit({ flask: -2 }, "Lasagne med blandfärs")).toEqual([]);
    expect(fit({ blandfars: -2 }, "Lasagne med blandfärs")).not.toEqual([]);
    expect(fit({ kottfars: -2 }, "Lasagne med blandfärs")).toEqual([]);
    expect(fit({ kottfars: -2 }, "Köttbullar med gräddsås")).not.toEqual([]);
    expect(fit({ kottfars: -2 }, "Biff med lök")).toEqual([]);
  });

  it("does not mark a chicken dish for someone who only avoids red meat", () => {
    const notes = foodFit({ name: "Kycklinggryta", ingredients: ["600 g kycklinglårfilé"] }, [{ name: "Anna", allergies: [], ...tasteLists({ kott: -2 }) }]);
    expect(notes).toEqual([]);
  });
});

describe("which meat a restaurant dish is (Menyrådgivaren)", () => {
  const meat = (originalnamn: string, huvudingredienser: string[]) => dish({ originalnamn, huvudingredienser, forklaring: "", kategori: "kott" });

  it("counts a dish in the category kött as red meat only when it is not pork or poultry", () => {
    expect(dishTasteKeys(meat("Albóndigas", ["nötkött", "tomat"]))).toContain("kott");
    expect(dishTasteKeys(meat("Pollo asado", ["kyckling"]))).not.toContain("kott");
    expect(dishTasteKeys(meat("Croquetas de jamón", ["skinka", "mjölk"]))).not.toContain("kott");
    // Nothing tells what meat it is: the category stands, as before.
    expect(dishTasteKeys(meat("Plato del día", []))).toContain("kott");
    expect(matchPreference(tasteWord("kott"), meat("Plato del día", []))).toBe(true);
    expect(matchPreference(tasteWord("kyckling"), meat("Pollo asado", ["kyckling"]))).toBe(true);
    expect(matchPreference(tasteWord("flask"), meat("Croquetas de jamón", ["skinka"]))).toBe(true);
  });

  it("counts a restaurant dish with mince as Köttfärs or Blandfärs, not red meat", () => {
    expect(dishTasteKeys(meat("Albóndigas", ["köttfärs", "tomat"]))).not.toContain("kott");
    expect(matchPreference(tasteWord("kottfars"), meat("Albóndigas", ["köttfärs"]))).toBe(true);
    expect(matchPreference(tasteWord("blandfars"), meat("Lasagne", ["blandfärs"]))).toBe(true);
    expect(matchPreference(tasteWord("flask"), meat("Lasagne", ["blandfärs"]))).toBe(false);
    expect(matchPreference(tasteWord("kott"), meat("Lasagne", ["blandfärs"]))).toBe(false);
  });

  it("does not rank chicken down for someone who avoids red meat, and does for someone who avoids chicken", () => {
    const menu = menuOf([meat("Pollo asado", ["kyckling"]), meat("Entrecot", ["nötkött"])]);
    const noRed = recommend(menu, [person({ tastes: { kott: -2 } })])[0]!.picks;
    expect(noRed[0]!.dish.originalnamn).toBe("Pollo asado");
    expect(noRed[0]!.concerns).toEqual([]);
    const noChicken = recommend(menu, [person({ tastes: { kyckling: -2 } })])[0]!.picks;
    expect(noChicken[0]!.dish.originalnamn).toBe("Entrecot");
    expect(noChicken.find((pick) => pick.dish.originalnamn === "Pollo asado")!.concerns[0]).toMatch(/kyckling/);
  });
});

describe("what was saved before the split", () => {
  it("keeps the key: a saved Kött at Ogillar is Rött kött at Ogillar, pork and chicken are Okej", () => {
    const tastes = parseTastes({ kott: -2 });
    expect(tastes).toEqual({ kott: -2 });
    expect(tasteLabel("kott")).toBe("Rött kött");
    expect(tasteSummary("Anna", tastes)).toBe("Anna undviker rött kött.");
  });

  it("reads the old name and short names as the presets", () => {
    expect(tasteKeyFor("Kött")).toBe("kott");
    expect(tasteKeyFor("Rött kött")).toBe("kott");
    expect(tasteKeyFor("fläsk")).toBe("flask");
    expect(tasteKeyFor("Fläskkött")).toBe("flask");
    expect(tasteKeyFor("Kyckling")).toBe("kyckling");
    // Typed by hand as an own thing before the presets existed: now the preset.
    expect(tasteKeyFor("köttfärs")).toBe("kottfars");
    expect(tasteKeyFor("Blandfärs")).toBe("blandfars");
    expect(tasteKeyFor("nötfärs")).toBe("kottfars");
  });
});
