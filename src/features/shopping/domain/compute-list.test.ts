import { describe, expect, it } from "vitest";
import type { Section, Unit } from "@/features/catalog";
import { toSnapshot, type PantryAmountRow } from "@/features/pantry";
import {
  computeList,
  countedDishIds,
  emptyOverlay,
  type ListDish,
  type ListRecipe,
  type ListRecipeLine,
  type ShoppingListInput,
} from "./compute-list";

// Ingredient ids are uuids in the database; here short names keep the tests readable.
const names: Record<string, string> = {
  gradde: "Grädde",
  mjol: "Mjöl",
  salt: "Salt",
  lok: "Purjolök",
  paprika: "Paprika",
  dill: "Dill",
  kassler: "Kassler",
};
const sections: Record<string, Section> = {
  gradde: "Mejeri",
  mjol: "Skafferi",
  salt: "Skafferi",
  lok: "Frukt och grönt",
  paprika: "Frukt och grönt",
  dill: "Frukt och grönt",
  kassler: "Chark",
};

const amount = (ingredientId: string | null, value: number, unit: Unit | null, text = "rad"): ListRecipeLine => ({
  ingredientId,
  amount: value,
  unit,
  isVague: false,
  originalText: text,
});
const vague = (ingredientId: string | null, text = "salt efter smak"): ListRecipeLine => ({
  ingredientId,
  amount: null,
  unit: null,
  isVague: true,
  originalText: text,
});
const recipe = (id: string, lines: ListRecipeLine[], originalServings = 4): ListRecipe => ({ id, originalServings, lines });
const dish = (id: string, recipeId: string | null, servings = 4): ListDish => ({ id, recipeId, servings });

function list(
  dishes: ListDish[],
  recipes: ListRecipe[],
  pantry: PantryAmountRow[] = [],
  overrides: Partial<ShoppingListInput> = {},
) {
  return computeList({
    plan: { recipes: dishes },
    recipes,
    snapshot: toSnapshot(pantry),
    catalog: {
      names,
      defaults: Object.fromEntries(Object.entries(sections).map(([id, section]) => [id, { section }])),
    },
    overlay: emptyOverlay,
    ...overrides,
  });
}

/** "Grädde 3 dl" per line, for short expectations. */
const shown = (lines: ReturnType<typeof computeList>) =>
  lines.map((line) => [line.label, line.amount, line.unit, line.pantryNote ?? null, line.isVague]);

describe("computeList", () => {
  it("scales each dish by its servings over the recipe's own", () => {
    const lines = list([dish("d1", "gryta", 6)], [recipe("gryta", [amount("gradde", 2, "dl")])]);
    expect(shown(lines)).toEqual([["Grädde", 3, "dl", null, false]]);
    expect(lines[0]).toMatchObject({ key: "r:gradde:dl", ingredientId: "gradde", coverage: { kind: "missing" } });
  });

  it("merges the same ingredient and unit over the dishes, with every dish as an origin", () => {
    const lines = list(
      [dish("d1", "gryta"), dish("d2", "soppa")],
      [recipe("gryta", [amount("gradde", 2, "dl")]), recipe("soppa", [amount("gradde", 1, "dl")])],
    );
    expect(shown(lines)).toEqual([["Grädde", 3, "dl", null, false]]);
    expect(lines[0].origins).toEqual(["d1", "d2"]);
  });

  it("counts the same recipe twice on the plan twice", () => {
    const lines = list([dish("d1", "gryta"), dish("d2", "gryta", 2)], [recipe("gryta", [amount("gradde", 2, "dl")])]);
    expect(shown(lines)).toEqual([["Grädde", 3, "dl", null, false]]);
    expect(lines[0].origins).toEqual(["d1", "d2"]);
  });

  it("keeps lines in different units apart, each with its own key", () => {
    const lines = list([dish("d1", "paj")], [recipe("paj", [amount("mjol", 2, "dl"), amount("mjol", 100, "g")])]);
    expect(lines.map((line) => [line.key, line.amount, line.unit])).toEqual([
      ["r:mjol:dl", 2, "dl"],
      ["r:mjol:g", 100, "g"],
    ]);
  });

  it("counts an amount without unit as st, with the key r:<id>:st", () => {
    const lines = list([dish("d1", "soppa")], [recipe("soppa", [amount("lok", 1, null, "1 purjolök")])]);
    expect(lines.map((line) => [line.key, line.amount, line.unit])).toEqual([["r:lok:st", 1, "st"]]);
    const stock = list([dish("d1", "soppa")], [recipe("soppa", [amount("lok", 1, null)])], [
      { ingredientId: "lok", amount: 2, unit: "st" },
    ]);
    expect(stock).toEqual([]);
  });

  it("gives no line for an unlimited item", () => {
    const lines = list([dish("d1", "gryta")], [recipe("gryta", [amount("salt", 1, "tsk"), vague("salt")])], [
      { ingredientId: "salt", amount: null, unit: null },
    ]);
    expect(lines).toEqual([]);
  });

  it("gives what is short when the pantry has some in the same unit", () => {
    const lines = list([dish("d1", "gryta", 6)], [recipe("gryta", [amount("gradde", 2, "dl")])], [
      { ingredientId: "gradde", amount: 2, unit: "dl" },
    ]);
    expect(shown(lines)).toEqual([["Grädde", 1, "dl", null, false]]);
    expect(lines[0].coverage.kind).toBe("partial");
  });

  it("gives no line when the pantry has enough", () => {
    const lines = list([dish("d1", "gryta", 6)], [recipe("gryta", [amount("gradde", 2, "dl")])], [
      { ingredientId: "gradde", amount: 5, unit: "dl" },
    ]);
    expect(lines).toEqual([]);
  });

  it("gives the whole need beside what is at home in other units, never converted", () => {
    const lines = list([dish("d1", "paj")], [recipe("paj", [amount("mjol", 2, "dl")])], [
      { ingredientId: "mjol", amount: 1, unit: "kg" },
    ]);
    expect(shown(lines)).toEqual([["Mjöl", 2, "dl", "hemma: 1 kg", false]]);
  });

  it("lists several units at home in the note, comma separated", () => {
    const lines = list([dish("d1", "paj")], [recipe("paj", [amount("mjol", 2, "dl")])], [
      { ingredientId: "mjol", amount: 1, unit: "kg" },
      { ingredientId: "mjol", amount: 1.5, unit: "l" },
    ]);
    expect(lines[0].pantryNote).toBe("hemma: 1 kg, 1,5 l");
  });

  it("gives a missing vague line as Finns hemma? without amount, with the key r:<id>:-", () => {
    const lines = list([dish("d1", "gryta")], [recipe("gryta", [vague("salt")])]);
    expect(lines).toEqual([
      {
        key: "r:salt:-",
        ingredientId: "salt",
        label: "Salt",
        amount: null,
        unit: null,
        isVague: true,
        coverage: { kind: "vague-missing" },
        section: "Skafferi",
        origins: ["d1"],
        checked: false,
        isCustom: false,
      },
    ]);
  });

  it("gives no line for a vague line whose ingredient is at home in any form", () => {
    const lines = list([dish("d1", "gryta")], [recipe("gryta", [vague("salt")])], [
      { ingredientId: "salt", amount: 3, unit: "g" },
    ]);
    expect(lines).toEqual([]);
  });

  it("keeps a line's key when the pantry changes from missing to partial", () => {
    const plan = [dish("d1", "gryta", 6)];
    const recipes = [recipe("gryta", [amount("gradde", 2, "dl")])];
    const before = list(plan, recipes);
    const after = list(plan, recipes, [{ ingredientId: "gradde", amount: 1, unit: "dl" }]);
    expect(before[0].coverage.kind).toBe("missing");
    expect(after[0].coverage.kind).toBe("partial");
    expect(after[0].key).toBe(before[0].key);
  });

  it("puts a line without a catalog ingredient under Övrigt with its own text, unscaled and not compared", () => {
    const lines = list(
      [dish("d1", "gryta", 8), dish("d2", "soppa")],
      [
        recipe("gryta", [amount(null, 1, "st", " En Näve  persilja ")]),
        recipe("soppa", [amount(null, 2, "st", "en näve persilja"), vague(null, "Något gott")]),
      ],
    );
    expect(lines).toEqual([
      {
        key: "t:en näve persilja",
        label: "En Näve persilja",
        amount: null,
        unit: null,
        isVague: false,
        coverage: { kind: "unlinked" },
        // 8 of 4 portions is 2, and 1 from Soppa.
        multiplier: 3,
        section: "Övrigt",
        origins: ["d1", "d2"],
        checked: false,
        isCustom: false,
      },
      expect.objectContaining({ key: "t:något gott", label: "Något gott", origins: ["d2"] }),
    ]);
    expect(lines[1]).not.toHaveProperty("multiplier");
  });

  it("gives a text line the sum of its dishes' scale factors, to one decimal, shown only when it is not 1", () => {
    const lemons = (servings: number[], originalServings = 4) =>
      list(
        servings.map((portions, index) => dish(`d${index}`, `r${index}`, portions)),
        servings.map((_, index) => recipe(`r${index}`, [amount(null, 2, "st", "2 citroner")], originalServings)),
      )[0].multiplier;
    expect(lemons([4, 4])).toBe(2);
    expect(lemons([8])).toBe(2);
    expect(lemons([4])).toBeUndefined();
    expect(lemons([6])).toBe(1.5);
    expect(lemons([1], 3)).toBe(0.3);
    expect(lemons([1], 60)).toBe(0.1);
    expect(lemons([2, 2, 2], 3)).toBe(2);
  });

  it("sorts by section in the fixed order, then by name, with an unknown section as Övrigt", () => {
    const lines = list(
      [dish("d1", "allt")],
      [
        recipe("allt", [
          amount("gradde", 1, "dl"),
          amount("paprika", 1, "st"),
          amount("okand", 1, "st", "1 okänd vara"),
          amount("dill", 1, "knippe"),
          amount("kassler", 400, "g"),
          amount(null, 1, "st", "Ananas"),
        ]),
      ],
    );
    expect(lines.map((line) => [line.section, line.label])).toEqual([
      ["Frukt och grönt", "Dill"],
      ["Frukt och grönt", "Paprika"],
      ["Mejeri", "Grädde"],
      ["Chark", "Kassler"],
      ["Övrigt", "Ananas"],
      ["Övrigt", "okänd vara"],
    ]);
  });

  it("puts a section outside SECTIONS under Övrigt", () => {
    const lines = computeList({
      ...baseInput(),
      plan: { recipes: [dish("d1", "gryta")] },
      recipes: [recipe("gryta", [amount("gradde", 1, "dl")])],
      catalog: { names: { gradde: "Grädde" }, defaults: { gradde: { section: "Kyldisk" } } },
    });
    expect(lines.map((line) => [line.label, line.section])).toEqual([["Grädde", "Övrigt"]]);
  });

  it("names a line without a catalog name by its text without amount and unit, never empty", () => {
    const lines = list(
      [dish("d1", "gryta")],
      [
        recipe("gryta", [
          amount("okand", 2, "dl", "2 dl  Vispgrädde, kall"),
          amount("okand", 1, "msk", "1 msk annan text"),
          amount("tom", 1, "st", "   "),
          amount(null, 1, "st", "  "),
        ]),
      ],
    );
    expect(lines.map((line) => [line.key, line.label])).toEqual([
      ["r:tom:st", "Okänd vara"],
      ["t:", "Okänd vara"],
      ["r:okand:dl", "Vispgrädde kall"],
      ["r:okand:msk", "Vispgrädde kall"],
    ]);
  });

  it("rounds what is bought in a unit that counts things up to a whole number, keeping the key", () => {
    const lines = list(
      [dish("d1", "soppa", 6)],
      [recipe("soppa", [amount("lok", 1, null), amount("paprika", 1, "förp"), amount("dill", 1, "knippe"), amount("gradde", 1, "dl")])],
      [{ ingredientId: "paprika", amount: 1, unit: "förp" }],
    );
    expect(lines.map((line) => [line.key, line.amount, line.unit])).toEqual([
      ["r:dill:knippe", 2, "knippe"],
      // 1.5 förp needed, 1 at home: 0.5 short, which is 1 förp to buy.
      ["r:paprika:förp", 1, "förp"],
      ["r:lok:st", 2, "st"],
      ["r:gradde:dl", 1.5, "dl"],
    ]);
    expect(lines[1].coverage).toEqual({ kind: "partial", remaining: 0.5, amounts: [{ unit: "förp", amount: 1 }] });
  });

  it("folds a missing vague line into the same ingredient's line with an amount, with both dishes", () => {
    const lines = list(
      [dish("d1", "gryta"), dish("d2", "soppa"), dish("d3", "paj")],
      [
        recipe("gryta", [vague("salt")]),
        recipe("soppa", [amount("salt", 1, "tsk", "1 tsk salt")]),
        recipe("paj", [amount("salt", 2, "krm", "2 krm salt")]),
      ],
    );
    expect(lines.map((line) => [line.key, line.amount, line.unit, line.isVague, line.origins])).toEqual([
      ["r:salt:krm", 2, "krm", false, ["d3"]],
      ["r:salt:tsk", 1, "tsk", false, ["d1", "d2"]],
    ]);
    // Alone, the vague line is still "Finns hemma?".
    expect(list([dish("d1", "gryta")], [recipe("gryta", [vague("salt")])])[0].isVague).toBe(true);
  });

  it("names what is at home in other units beside a partly covered line", () => {
    const lines = list([dish("d1", "paj")], [recipe("paj", [amount("mjol", 5, "dl")])], [
      { ingredientId: "mjol", amount: 2, unit: "dl" },
      { ingredientId: "mjol", amount: 1, unit: "kg" },
    ]);
    expect(shown(lines)).toEqual([["Mjöl", 3, "dl", "hemma: 1 kg", false]]);
    const sameUnitOnly = list([dish("d1", "paj")], [recipe("paj", [amount("mjol", 5, "dl")])], [
      { ingredientId: "mjol", amount: 2, unit: "dl" },
    ]);
    expect(sameUnitOnly[0].pantryNote).toBeUndefined();
  });

  it("counts only the dishes whose recipe was read", () => {
    const plan = { recipes: [dish("d1", "gryta"), dish("d2", null), dish("d3", "borta")] };
    expect(countedDishIds(plan, [recipe("gryta", [])])).toEqual(["d1"]);
    expect(countedDishIds(null, [])).toEqual([]);
  });

  it("gives nothing without a plan, for a dish whose recipe is gone, and for a recipe not read", () => {
    expect(computeList({ ...baseInput(), plan: null })).toEqual([]);
    expect(list([dish("d1", null), dish("d2", "saknas")], [recipe("gryta", [amount("gradde", 1, "dl")])])).toEqual([]);
  });

  it("uses the recipe's own amounts when the servings are not positive", () => {
    const lines = list([dish("d1", "gryta", 0)], [recipe("gryta", [amount("gradde", 2, "dl")], 0)]);
    expect(shown(lines)).toEqual([["Grädde", 2, "dl", null, false]]);
  });

  it("rounds sums so binary noise never leaves a line", () => {
    const lines = list(
      [dish("d1", "a"), dish("d2", "b")],
      [recipe("a", [amount("gradde", 0.1, "dl")]), recipe("b", [amount("gradde", 0.2, "dl")])],
      [{ ingredientId: "gradde", amount: 0.3, unit: "dl" }],
    );
    expect(lines).toEqual([]);
  });

  it("marks lines checked in the overlay", () => {
    const lines = list([dish("d1", "gryta")], [recipe("gryta", [amount("gradde", 2, "dl"), vague("salt")])], [], {
      overlay: { ...emptyOverlay, checks: ["r:salt:-"] },
    });
    expect(lines.map((line) => [line.key, line.checked])).toEqual([
      ["r:gradde:dl", false],
      ["r:salt:-", true],
    ]);
  });

  it("keeps a check when the list is counted again and the key stays the same", () => {
    const overlay = { ...emptyOverlay, checks: ["r:gradde:dl", "t:en näve persilja"] };
    const lines = (servings: number) =>
      list(
        [dish("d1", "gryta", servings)],
        [recipe("gryta", [amount("gradde", 3, "dl"), amount(null, 1, null, "En näve persilja")], 6)],
        [],
        { overlay },
      );
    expect(lines(6).map((line) => [line.label, line.amount, line.checked])).toEqual([
      ["Grädde", 3, true],
      ["En näve persilja", null, true],
    ]);
    // 3 dl for 6 is 4 dl for 8: the same line, still checked.
    expect(lines(8).map((line) => [line.label, line.amount, line.checked])).toEqual([
      ["Grädde", 4, true],
      ["En näve persilja", null, true],
    ]);
  });

  it("ignores a check without a line, and applies it again when the line comes back", () => {
    const overlay = { ...emptyOverlay, checks: ["r:gradde:dl", "r:mjol:dl", "c:00000000-0000-4000-8000-000000000000"] };
    const input = (pantry: PantryAmountRow[]) =>
      list([dish("d1", "gryta")], [recipe("gryta", [amount("gradde", 2, "dl"), amount("lok", 1, "st")])], pantry, {
        overlay,
      });
    // Covered by the pantry: no line, and the checks without a line change nothing.
    expect(input([{ ingredientId: "gradde", amount: 2, unit: "dl" }]).map((line) => [line.key, line.checked])).toEqual([
      ["r:lok:st", false],
    ]);
    expect(input([]).map((line) => [line.key, line.checked])).toEqual([
      ["r:lok:st", false],
      ["r:gradde:dl", true],
    ]);
  });
});

function baseInput(): ShoppingListInput {
  return {
    plan: null,
    recipes: [],
    snapshot: toSnapshot([]),
    catalog: { names: {}, defaults: {} },
    overlay: emptyOverlay,
  };
}
