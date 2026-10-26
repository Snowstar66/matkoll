import { describe, expect, it } from "vitest";
import type { ShoppingLine } from "./compute-list";
import { customLineKey, recipeLineKey, textLineKey } from "./line-key";
import { canPutInPantry, maxPantryAddition, planPutInPantry } from "./put-in-pantry";

const gradde = "11111111-1111-4111-8111-111111111111";
const salt = "22222222-2222-4222-8222-222222222222";
const kaffe = "33333333-3333-4333-8333-333333333333";
const paprika = "44444444-4444-4444-8444-444444444444";
const kaffeItem = "55555555-5555-4555-8555-555555555555";
const diskItem = "66666666-6666-4666-8666-666666666666";

function line(change: Partial<ShoppingLine> & Pick<ShoppingLine, "key">): ShoppingLine {
  return {
    label: "Vara",
    amount: null,
    unit: null,
    isVague: false,
    coverage: { kind: "unlinked" },
    section: "Övrigt",
    origins: [],
    checked: true,
    isCustom: false,
    ...change,
  };
}

const graddeLine = line({ key: recipeLineKey(gradde, "dl"), ingredientId: gradde, amount: 3, unit: "dl" });
const saltLine = line({ key: recipeLineKey(salt, null), ingredientId: salt, isVague: true });
const textLine = line({ key: textLineKey("En näve persilja") });
const kaffeLine = line({ key: customLineKey(kaffeItem), ingredientId: kaffe, amount: 2, unit: "förp", isCustom: true });
const diskLine = line({ key: customLineKey(diskItem), isCustom: true });
const paprikaLine = line({ key: recipeLineKey(paprika, "st"), ingredientId: paprika, amount: 2, unit: "st", checked: false });

const checkOf = (key: string, id: string) => ({ id, key });
const known = new Set([gradde, salt, kaffe, paprika]);

describe("planPutInPantry", () => {
  it("puts checked lines with a catalog ingredient in the pantry, keyed by their checks' ids", () => {
    const plan = planPutInPantry(
      [graddeLine, saltLine, textLine, kaffeLine, diskLine, paprikaLine],
      [
        checkOf(graddeLine.key, "c1"),
        checkOf(saltLine.key, "c2"),
        checkOf(textLine.key, "c3"),
        checkOf(kaffeLine.key, "c4"),
        checkOf(diskLine.key, "c5"),
      ],
      known,
    );
    expect(plan.items).toEqual([
      { key: "c1", ingredientId: gradde, amount: 3, unit: "dl" },
      // A vague line makes the ingredient unlimited.
      { key: "c2", ingredientId: salt, amount: null, unit: null },
      // A linked own item goes like a recipe line.
      { key: "c4", ingredientId: kaffe, amount: 2, unit: "förp" },
    ]);
    // The text line keeps its check: it cannot go to the pantry.
    expect(plan.checkIds).toEqual(["c1", "c2", "c4", "c5"]);
    // Only the recipe lines sent have overrides to clear.
    expect(plan.overrideKeys).toEqual([graddeLine.key, saltLine.key]);
    expect(plan.customItemIds).toEqual([kaffeItem, diskItem]);
    expect(plan.removed).toBe(1);
    expect(plan.skipped).toBe(0);
    expect(plan.unsent).toEqual([]);
  });

  it("sends a linked own item without amount as unlimited", () => {
    const plain = { ...kaffeLine, amount: null, unit: null };
    expect(planPutInPantry([plain], [checkOf(plain.key, "c4")], known).items).toEqual([
      { key: "c4", ingredientId: kaffe, amount: null, unit: null },
    ]);
  });

  it("uses the line's amount as shown: a corrected one, or one rounded up", () => {
    const corrected = { ...graddeLine, amount: 1, computedAmount: 3 };
    expect(planPutInPantry([corrected], [checkOf(corrected.key, "c1")], known).items[0]?.amount).toBe(1);
  });

  it("caps an amount the pantry cannot keep", () => {
    const huge = { ...graddeLine, amount: 2_000_000 };
    expect(planPutInPantry([huge], [checkOf(huge.key, "c1")], known).items[0]?.amount).toBe(maxPantryAddition);
  });

  it("skips a line it cannot send, keeping its check, and sends the rest", () => {
    const unknown = { ...paprikaLine, checked: true };
    const badUnit = { ...graddeLine, unit: "liter" as never };
    const plan = planPutInPantry(
      [unknown, badUnit, saltLine],
      [checkOf(unknown.key, "c9"), checkOf(badUnit.key, "c1"), checkOf(saltLine.key, "c2")],
      new Set([gradde, salt]),
    );
    expect(plan.items.map((item) => item.key)).toEqual(["c2"]);
    expect(plan.checkIds).toEqual(["c2"]);
    expect(plan.overrideKeys).toEqual([saltLine.key]);
    expect(plan.skipped).toBe(2);
  });

  it("leaves unchecked lines alone, and gives the checks of no line on the list as unsent", () => {
    const covered = checkOf(recipeLineKey(paprika, "kg"), "c9");
    const plan = planPutInPantry([paprikaLine, textLine], [checkOf(textLine.key, "c3"), covered], known);
    expect(plan.items).toEqual([]);
    expect(plan.checkIds).toEqual([]);
    // The text line's check is on the list, so it is not unsent either.
    expect(plan.unsent).toEqual([covered]);
  });

  it("leaves out a checked line without a check row", () => {
    expect(planPutInPantry([graddeLine], [], known)).toEqual({
      items: [],
      checkIds: [],
      overrideKeys: [],
      customItemIds: [],
      removed: 0,
      skipped: 0,
      unsent: [],
    });
  });
});

describe("canPutInPantry", () => {
  it("is a checked line with a catalog ingredient, or a checked own item, never a text line", () => {
    expect(canPutInPantry(graddeLine)).toBe(true);
    expect(canPutInPantry(diskLine)).toBe(true);
    expect(canPutInPantry(textLine)).toBe(false);
    expect(canPutInPantry(paprikaLine)).toBe(false);
  });
});
