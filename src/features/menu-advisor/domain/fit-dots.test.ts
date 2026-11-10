import { describe, expect, it } from "vitest";
import { foodFit, type FitPerson } from "./dish-fit";
import { fitDots } from "@/components/fit-dots";

const person = (name: string, own: Partial<FitPerson> = {}): FitPerson => ({ name, allergies: [], dislikes: [], likes: [], ...own });
const dots = (ingredients: string[], people: FitPerson[], max?: number) => fitDots(foodFit({ name: "Rätt", ingredients }, people), max);

describe("fitDots", () => {
  it("shows nothing for a dish that fits everyone, or without notes", () => {
    expect(dots(["2 dl ris"], [person("Anna"), person("Gunnar")])).toEqual([]);
    expect(fitDots(undefined)).toEqual([]);
    expect(fitDots([])).toEqual([]);
  });

  it("shows only the one who loves it, not the neutral", () => {
    const result = dots(["100 g fetaost"], [person("Anna", { likes: ["fetaost"] }), person("Gunnar")]);
    expect(result).toEqual([{ personId: "Anna", name: "Anna", initial: "A", kind: "love", label: "Anna älskar fetaost", words: [] }]);
  });

  it("shows the one who avoids it", () => {
    const result = dots(["2 klyftor vitlök"], [person("Anna"), person("Gunnar", { dislikes: ["vitlök"] })]);
    expect(result.map((dot) => [dot.name, dot.kind, dot.label])).toEqual([["Gunnar", "avoid", "Gunnar undviker vitlök"]]);
  });

  it("lets an allergy win over avoid and love, with the allergen as a word", () => {
    const result = dots(["300 g pasta", "vitlök"], [person("Anna", { allergies: ["gluten"], dislikes: ["vitlök"] }), person("Gunnar", { likes: ["pasta"] })]);
    expect(result.map((dot) => [dot.name, dot.kind])).toEqual([["Anna", "allergy"], ["Gunnar", "love"]]);
    expect(result[0].words).toEqual(["Gluten"]);
    expect(result[0].label).toBe("Anna: kan innehålla gluten");
  });

  it("puts allergy first, then avoid, then love", () => {
    const people = [person("Lisa", { likes: ["ost"] }), person("Kalle", { dislikes: ["ost"] }), person("Mia", { allergies: ["laktos"] })];
    expect(dots(["ost"], people).map((dot) => dot.kind)).toEqual(["allergy", "avoid", "love"]);
  });

  it("works for a household of one", () => {
    expect(dots(["2 dl grädde"], [person("Du", { allergies: ["laktos"] })]).map((dot) => [dot.initial, dot.kind])).toEqual([["D", "allergy"]]);
    expect(dots(["2 dl grädde"], [person("Du")])).toEqual([]);
  });

  it("cuts many people at max but never an allergy", () => {
    const people = ["Anna", "Bo", "Cia", "Dan", "Eva", "Fia"].map((name) => person(name, { likes: ["ost"] }));
    expect(dots(["ost"], people, 4)).toHaveLength(4);
    const cut = dots(["ost"], [...people, person("Gun", { allergies: ["laktos"] })], 2);
    expect(cut).toHaveLength(2);
    expect(cut[0].kind).toBe("allergy");
    const many = ["A1", "A2", "A3"].map((name) => person(name, { allergies: ["laktos"] }));
    expect(dots(["ost"], many, 1)).toHaveLength(3);
  });

  it("joins several people with one allergy and several allergens of one person", () => {
    const result = dots(["ost", "pasta"], [person("Anna", { allergies: ["laktos", "gluten"] }), person("Bo", { allergies: ["laktos"] })]);
    expect(result.map((dot) => [dot.name, dot.words])).toEqual([["Anna", ["Laktos", "Gluten"]], ["Bo", ["Laktos"]]]);
  });
});
