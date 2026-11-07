import { describe, expect, it } from "vitest";
import type { PantrySnapshot, StapleRules } from "@/features/pantry";
import type { RecipeListRow } from "@/features/recipes";
import { cookNowLists, cookNowNameIds, maxCookNowRecipes } from "./cook-now";

const snapshot: PantrySnapshot = new Map([
  ["egg", { unlimited: false, amounts: [{ unit: "st", amount: 8 }] }],
  ["milk", { unlimited: false, amounts: [{ unit: "dl", amount: 10 }] }],
  ["cream", { unlimited: false, amounts: [{ unit: "dl", amount: 3 }] }],
]);
const names = { egg: "Ägg", milk: "Mellanmjölk", cream: "Grädde", butter: "Smör", lingon: "Lingon", bacon: "Bacon", flour: "Vetemjöl" };
const staples: StapleRules = { byIngredient: { butter: { maxAmount: null, maxUnit: null } }, byName: {} };

let seq = 0;
const line = (ingredientId: string | null, amount: number | null, unit: "dl" | "l" | null = null) => ({
  id: `line-${++seq}`,
  ingredientId,
  amount,
  unit,
  isVague: amount === null,
  originalText: ingredientId ?? "text",
});
const row = (id: string, lines: RecipeListRow["lines"], extra: Partial<RecipeListRow> = {}): RecipeListRow => ({
  id,
  title: id,
  imageUrl: null,
  totalMinutes: 25,
  originalServings: 4,
  isFavorite: false,
  createdAt: "2026-11-01T10:00:00Z",
  lines,
  ...extra,
});

const pannkakor = row("Pannkakor", [line("egg", 3), line("milk", 5, "dl"), line("butter", 1, "dl")]);
const paj = row("Purjolökspaj", [line("cream", 2, "dl"), line("egg", 2)]);
const kottbullar = row("Köttbullar", [line("egg", 1), line("lingon", 1, "dl")]);
const carbonara = row("Carbonara", [line("egg", 2), line("bacon", 1, "dl"), line("lingon", 1, "dl")]);

describe("cookNowLists", () => {
  it("lists recipes with nothing missing beyond Basvaror, and what each uses", () => {
    const { own } = cookNowLists([pannkakor, paj, kottbullar, carbonara], snapshot, names, staples);
    expect(own.map((recipe) => recipe.title)).toEqual(["Pannkakor", "Purjolökspaj"]);
    // Smör is not at home, but a Basvara: counted as at home and still listed as used.
    expect(own[0]).toMatchObject({ totalMinutes: 25, servings: 4, uses: ["ägg", "mellanmjölk", "smör"] });
    expect(own[1].uses).toEqual(["grädde", "ägg"]);
    // UX-13b: the drawing without a photo, from the title and the lines.
    expect(own.map((recipe) => recipe.dish)).toEqual(["tallrik", "paj"]);
  });

  it("without the Basvara the same recipe misses one thing", () => {
    const { own, oneMissing } = cookNowLists([pannkakor], snapshot, names);
    expect(own).toEqual([]);
    expect(oneMissing).toEqual([{ id: "Pannkakor", title: "Pannkakor", missing: "smör" }]);
  });

  it("lists recipes that miss exactly one thing with its name, and none that miss two", () => {
    const { oneMissing } = cookNowLists([pannkakor, kottbullar, carbonara], snapshot, names, staples);
    expect(oneMissing).toEqual([{ id: "Köttbullar", title: "Köttbullar", missing: "lingon" }]);
  });

  it("puts the recipes that use the oldest item first, the others in the given order", () => {
    const { own } = cookNowLists([pannkakor, paj], snapshot, names, staples, ["cream"]);
    expect(own.map((recipe) => recipe.title)).toEqual(["Purjolökspaj", "Pannkakor"]);
    const older = cookNowLists([pannkakor, paj], snapshot, names, staples, ["milk", "cream"]);
    expect(older.own.map((recipe) => recipe.title)).toEqual(["Pannkakor", "Purjolökspaj"]);
  });

  it("never counts a line without a catalog ingredient or a vague line as missing", () => {
    const loose = row("Fri", [line("egg", 2), line(null, 1), line("flour", null)]);
    expect(cookNowLists([loose], snapshot, names).own.map((recipe) => recipe.title)).toEqual(["Fri"]);
  });

  it("keeps at most a few of each", () => {
    const many = Array.from({ length: 12 }, (_, i) => row(`r${i}`, [line("egg", 1)]));
    expect(cookNowLists(many, snapshot, names).own).toHaveLength(maxCookNowRecipes);
  });
});

describe("cookNowNameIds", () => {
  it("asks for the names of what cookable recipes use and of the one missing thing, nothing else", () => {
    const ids = cookNowNameIds([pannkakor, kottbullar, carbonara], snapshot, staples);
    expect([...ids].sort()).toEqual(["butter", "egg", "lingon", "milk"]);
  });
});
