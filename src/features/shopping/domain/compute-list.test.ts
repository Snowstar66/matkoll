import { describe, expect, it } from "vitest";
import type { Section, Unit } from "@/features/catalog";
import { toSnapshot, type PantryAmountRow } from "@/features/pantry";
import {
  computeList,
  countedDishIds,
  emptyOverlay,
  hiddenLines,
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

describe("computeList with own items (Story 3.5)", () => {
  const diskmedel = "11111111-1111-4111-8111-111111111111";
  const kaffe = "22222222-2222-4222-8222-222222222222";
  const ownGradde = "33333333-3333-4333-8333-333333333333";
  const own = (id: string, label: string, ingredientId: string | null = null, value: number | null = null, unit: Unit | null = null) => ({
    id,
    label,
    ingredientId,
    amount: value,
    unit,
  });

  it("gives each own item a line of its own, keyed c:<id>, under Övrigt without a catalog ingredient", () => {
    const lines = list([], [], [], {
      overlay: { ...emptyOverlay, customItems: [own(diskmedel, "diskmedel", null, 2, "förp")] },
    });
    expect(lines).toEqual([
      {
        key: `c:${diskmedel}`,
        label: "diskmedel",
        customLabel: "diskmedel",
        amount: 2,
        unit: "förp",
        isVague: false,
        coverage: { kind: "unlinked" },
        section: "Övrigt",
        origins: [],
        checked: false,
        isCustom: true,
      },
    ]);
  });

  it("puts a linked item under its ingredient's section, and an unknown section under Övrigt", () => {
    const lines = list([], [], [], {
      catalog: { names: {}, defaults: { kaffe: { section: "Skafferi" }, okand: { section: "Kläder" } } },
      overlay: { ...emptyOverlay, customItems: [own(kaffe, "Kaffe", "kaffe"), own(diskmedel, "Strumpor", "okand")] },
    });
    expect(lines.map((line) => [line.label, line.section, line.ingredientId, line.amount])).toEqual([
      ["Kaffe", "Skafferi", "kaffe", null],
      ["Strumpor", "Övrigt", "okand", null],
    ]);
  });

  it("never merges an own item with a recipe line of the same ingredient, nor takes the pantry off it", () => {
    const lines = list(
      [dish("d1", "gryta")],
      [recipe("gryta", [amount("gradde", 3, "dl")])],
      [{ ingredientId: "gradde", amount: 5, unit: "dl" }],
      { overlay: { ...emptyOverlay, customItems: [own(ownGradde, "Grädde", "gradde", 3, "dl")] } },
    );
    // The recipe's 3 dl are at home; the own item stays as Pontus wrote it.
    expect(lines.map((line) => [line.key, line.label, line.amount, line.unit, line.isCustom])).toEqual([
      [`c:${ownGradde}`, "Grädde", 3, "dl", true],
    ]);
    const missing = list([dish("d1", "gryta")], [recipe("gryta", [amount("gradde", 3, "dl")])], [], {
      overlay: { ...emptyOverlay, customItems: [own(ownGradde, "Grädde", "gradde", 3, "dl")] },
    });
    // Two lines with the same name: ordered by key.
    expect(missing.map((line) => [line.key, line.amount, line.isCustom])).toEqual([
      [`c:${ownGradde}`, 3, true],
      ["r:gradde:dl", 3, false],
    ]);
  });

  it("checks an own item by c:<id>, and keeps it unchanged when the recipes are counted again", () => {
    const overlay = { ...emptyOverlay, checks: [`c:${diskmedel}`], customItems: [own(diskmedel, "diskmedel")] };
    const lines = (servings: number) =>
      list([dish("d1", "gryta", servings)], [recipe("gryta", [amount("gradde", 2, "dl")])], [], { overlay });
    const custom = (servings: number) => lines(servings).find((line) => line.isCustom);
    expect(custom(4)).toMatchObject({ key: `c:${diskmedel}`, checked: true, amount: null });
    expect(custom(8)).toEqual(custom(4));
  });

  it("sorts own items with the recipe lines by section and name, and gives none without a plan", () => {
    const customItems = [own(diskmedel, "diskmedel"), own(kaffe, "Bröd", "mjol")];
    const lines = list([dish("d1", "gryta")], [recipe("gryta", [amount("gradde", 2, "dl"), amount("mjol", 1, "dl")])], [], {
      overlay: { ...emptyOverlay, customItems },
    });
    expect(lines.map((line) => [line.section, line.label])).toEqual([
      ["Mejeri", "Grädde"],
      ["Skafferi", "Bröd"],
      ["Skafferi", "Mjöl"],
      ["Övrigt", "diskmedel"],
    ]);
    expect(computeList({ ...baseInput(), overlay: { ...emptyOverlay, customItems } })).toEqual([]);
  });

  it("names an item without text Okänd vara and leaves an amount without a unit out", () => {
    const lines = list([], [], [], { overlay: { ...emptyOverlay, customItems: [own(diskmedel, "  ", null, 2, null)] } });
    expect(lines.map((line) => [line.label, line.amount, line.unit])).toEqual([["Okänd vara", null, null]]);
  });
});

describe("computeList with overrides (Story 3.6)", () => {
  const corrected = (key: string, value: number | null, hidden = false, baseAmount: number | null = null) => ({
    key,
    amount: value,
    baseAmount,
    hidden,
  });
  const withOverrides = (overrides: ReturnType<typeof corrected>[], servings = 6, pantry: PantryAmountRow[] = []) =>
    list(
      [dish("d1", "gryta", servings)],
      [recipe("gryta", [amount("gradde", 2, "dl"), vague("salt"), amount(null, 2, null, "2 citroner")])],
      pantry,
      { overlay: { ...emptyOverlay, overrides } },
    );

  it("replaces the counted amount with the corrected one in the line's unit, keeping the counted one", () => {
    const lines = withOverrides([corrected("r:gradde:dl", 2)]);
    expect(lines.find((line) => line.key === "r:gradde:dl")).toMatchObject({ amount: 2, unit: "dl", computedAmount: 3 });
    // Without a correction, no computedAmount.
    expect(withOverrides([]).find((line) => line.key === "r:gradde:dl")).not.toHaveProperty("computedAmount");
  });

  it("keeps the correction when the list is counted again with the same key", () => {
    const at = (servings: number, pantry: PantryAmountRow[] = []) =>
      withOverrides([corrected("r:gradde:dl", 2)], servings, pantry).find((line) => line.key === "r:gradde:dl");
    expect(at(8)).toMatchObject({ amount: 2, computedAmount: 4 });
    expect(at(8, [{ ingredientId: "gradde", amount: 1, unit: "dl" }])).toMatchObject({ amount: 2, computedAmount: 3 });
  });

  it("leaves a hidden line out, keeping a hidden line's correction for later", () => {
    const lines = withOverrides([corrected("r:gradde:dl", 2, true), corrected("r:salt:-", null, true)]);
    expect(lines.map((line) => line.key)).toEqual(["t:2 citroner"]);
    expect(withOverrides([corrected("t:2 citroner", null, true)]).map((line) => line.key)).toEqual([
      "r:gradde:dl",
      "r:salt:-",
    ]);
  });

  it("uses a corrected amount as written in a unit that counts things, and keeps the pantry note", () => {
    const lines = list(
      [dish("d1", "gryta", 6)],
      [recipe("gryta", [amount("paprika", 1, "st"), amount("mjol", 2, "dl")])],
      [{ ingredientId: "mjol", amount: 1, unit: "kg" }],
      { overlay: { ...emptyOverlay, overrides: [corrected("r:paprika:st", 1.5), corrected("r:mjol:dl", 1)] } },
    );
    expect(lines.find((line) => line.key === "r:paprika:st")).toMatchObject({ amount: 1.5, computedAmount: 2 });
    expect(lines.find((line) => line.key === "r:mjol:dl")).toMatchObject({
      amount: 1,
      computedAmount: 3,
      pantryNote: "hemma: 1 kg",
      coverage: { kind: "other-unit" },
    });
  });

  it("ignores a corrected amount on a line without one", () => {
    const lines = withOverrides([corrected("r:salt:-", 2), corrected("t:2 citroner", 2)]);
    expect(lines.find((line) => line.key === "r:salt:-")).toMatchObject({ amount: null, isVague: true });
    expect(lines.find((line) => line.key === "t:2 citroner")).toMatchObject({ amount: null });
    expect(lines.some((line) => "computedAmount" in line)).toBe(false);
  });

  it("ignores an override without a line, and applies it again when the key comes back", () => {
    const overrides = [corrected("r:gradde:dl", 2), corrected("r:mjol:dl", null, true)];
    // The pantry covers the cream: no line, and the override does nothing.
    const covered = withOverrides(overrides, 6, [{ ingredientId: "gradde", amount: 5, unit: "dl" }]);
    expect(covered.map((line) => line.key)).toEqual(["r:salt:-", "t:2 citroner"]);
    expect(withOverrides(overrides).find((line) => line.key === "r:gradde:dl")).toMatchObject({ amount: 2 });

    // The need is in g now: the new key shows, the hidden dl key stays hidden.
    const flour = (unit: Unit) =>
      list([dish("d1", "kaka")], [recipe("kaka", [amount("mjol", 3, unit)])], [], {
        overlay: { ...emptyOverlay, overrides },
      });
    expect(flour("g").map((line) => [line.key, line.amount])).toEqual([["r:mjol:g", 3]]);
    expect(flour("dl")).toEqual([]);
  });

  it("never applies an override to an own item", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const lines = list([], [], [], {
      overlay: {
        ...emptyOverlay,
        customItems: [{ id, label: "diskmedel", ingredientId: null, amount: 2, unit: "förp" }],
        overrides: [{ key: `c:${id}`, amount: 5, baseAmount: null, hidden: true }],
      },
    });
    expect(lines.map((line) => [line.key, line.amount])).toEqual([[`c:${id}`, 2]]);
  });

  it("gives an own item its catalog ingredient's name for the detail", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const lines = list([], [], [], {
      overlay: { ...emptyOverlay, customItems: [{ id, label: "grädde eko", ingredientId: "gradde", amount: null, unit: null }] },
    });
    expect(lines[0]).toMatchObject({ label: "grädde eko", linkedName: "Grädde", customLabel: "grädde eko" });
  });

  it("keeps an own item's text as stored beside the list's name for it", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const lines = list([], [], [], {
      overlay: { ...emptyOverlay, customItems: [{ id, label: "  ", ingredientId: null, amount: null, unit: null }] },
    });
    expect(lines[0]).toMatchObject({ label: "Okänd vara", customLabel: "  " });
    expect(lines[0]).not.toHaveProperty("linkedName");
  });

  it("says when the counted amount has changed since the correction was saved", () => {
    const at = (servings: number, base: number | null) =>
      withOverrides([corrected("r:gradde:dl", 2, false, base)], servings).find((line) => line.key === "r:gradde:dl");
    // Saved when 3 dl was counted: unchanged at 6 servings, changed at 8.
    expect(at(6, 3)).not.toHaveProperty("computedChanged");
    expect(at(8, 3)).toMatchObject({ amount: 2, computedAmount: 4, computedChanged: true });
    // Without the amount counted then, nothing is said.
    expect(at(8, null)).not.toHaveProperty("computedChanged");
  });

  it("hides the vague line folded into a hidden line of the same ingredient", () => {
    const lines = list(
      [dish("d1", "gryta"), dish("d2", "soppa")],
      [recipe("gryta", [vague("salt")]), recipe("soppa", [amount("salt", 1, "tsk")])],
      [],
      { overlay: { ...emptyOverlay, overrides: [corrected("r:salt:tsk", null, true)] } },
    );
    expect(lines).toEqual([]);
  });

  it("lists the hidden lines for Dolda varor as counted without being hidden, leaving out keys without a line", () => {
    const input = (overrides: ReturnType<typeof corrected>[], pantry: PantryAmountRow[] = []): ShoppingListInput => ({
      plan: { recipes: [dish("d1", "gryta", 6)] },
      recipes: [recipe("gryta", [amount("gradde", 2, "dl"), vague("salt"), amount("mjol", 1, "dl")])],
      snapshot: toSnapshot(pantry),
      catalog: { names, defaults: Object.fromEntries(Object.entries(sections).map(([id, section]) => [id, { section }])) },
      overlay: {
        ...emptyOverlay,
        overrides,
        customItems: [{ id: "11111111-1111-4111-8111-111111111111", label: "x", ingredientId: null, amount: null, unit: null }],
      },
    });
    const hidden = [corrected("r:gradde:dl", 2, true), corrected("r:salt:-", null, true), corrected("r:lok:st", null, true)];
    expect(hiddenLines(input(hidden)).map((line) => [line.key, line.label, line.amount])).toEqual([
      ["r:gradde:dl", "Grädde", 2],
      ["r:salt:-", "Salt", null],
    ]);
    // Covered by the pantry: no line, so not listed.
    expect(hiddenLines(input(hidden, [{ ingredientId: "gradde", amount: 9, unit: "dl" }])).map((line) => line.key)).toEqual([
      "r:salt:-",
    ]);
    expect(hiddenLines(input([corrected("r:gradde:dl", 2)]))).toEqual([]);
  });
});
