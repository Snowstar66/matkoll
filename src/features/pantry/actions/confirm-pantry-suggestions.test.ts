import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogDataError } from "@/features/catalog/server";
import { fail, ok } from "@/lib/errors";
import { PantryDataError } from "../data/client";
import type { ConfirmItemInput } from "../domain/pantry-suggestion";

// confirmPantrySuggestions with the user check, the session client, the catalog, the write and revalidation stubbed.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const commitIngredients = vi.fn();
vi.mock("@/features/catalog/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/catalog/server")>()),
  commitIngredients: (...args: unknown[]) => commitIngredients(...args),
}));
const setPantryItemsIn = vi.fn();
vi.mock("../data/set", () => ({ setPantryItemsIn: (...args: unknown[]) => setPantryItemsIn(...args) }));

const { confirmPantrySuggestions } = await import("./confirm-pantry-suggestions");

const mjolk = "11111111-1111-4111-8111-111111111111";
const smor = "11111111-1111-4111-8111-111111111112";
const agg = "33333333-3333-4333-8333-333333333333";

const existing = (ingredientId: string, change: Partial<ConfirmItemInput> = {}): ConfirmItemInput => ({
  ingredient: { kind: "existing", ingredientId },
  location: "Kyl",
  amount: 1,
  unit: "förp",
  ...change,
});
const fresh = (name: string, change: Partial<ConfirmItemInput> = {}): ConfirmItemInput => ({
  ingredient: { kind: "new", proposalId: "n1", name, section: "Mejeri", location: "Kyl", defaultUnit: "st" },
  location: "Kyl",
  amount: 6,
  unit: "st",
  ...change,
});

/** Ids for the choices: an exact match keeps its id, a new ingredient gets `agg`. */
function commitIds(choices: { ingredient: { kind: string; ingredientId?: string } }[]) {
  return choices.map(({ ingredient }) => (ingredient.kind === "new" ? agg : ingredient.ingredientId!));
}

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  commitIngredients.mockReset().mockImplementation(async (choices) => commitIds(choices));
  setPantryItemsIn.mockReset().mockImplementation(async (_db, items: { ingredientId: string }[]) =>
    items.map((item, index) => ({ id: `row-${index}`, ...item })),
  );
  revalidateFor.mockReset();
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("confirmPantrySuggestions", () => {
  it("commits the ingredients, sets each amount exactly in the same order, and revalidates", async () => {
    const result = await confirmPantrySuggestions([existing(mjolk), fresh("ägg"), existing(smor, { amount: null, unit: null })]);
    expect(result).toEqual(ok({ count: 3 }));
    expect(commitIngredients).toHaveBeenCalledWith([
      { text: "", ingredient: { kind: "match", ingredientId: mjolk, confidence: "exact" } },
      {
        text: "ägg",
        ingredient: { kind: "new", proposal: { name: "ägg", section: "Mejeri", location: "Kyl", defaultUnit: "st" } },
      },
      { text: "", ingredient: { kind: "match", ingredientId: smor, confidence: "exact" } },
    ]);
    expect(setPantryItemsIn).toHaveBeenCalledWith(db, [
      { ingredientId: mjolk, location: "Kyl", amount: 1, unit: "förp" },
      { ingredientId: agg, location: "Kyl", amount: 6, unit: "st" },
      { ingredientId: smor, location: "Kyl", amount: null, unit: null },
    ]);
    expect(revalidateFor).toHaveBeenCalledExactlyOnceWith("pantry_item");
    expect(setPantryItemsIn.mock.invocationCallOrder[0]).toBeGreaterThan(commitIngredients.mock.invocationCallOrder[0]);
    expect(revalidateFor.mock.invocationCallOrder[0]).toBeGreaterThan(setPantryItemsIn.mock.invocationCallOrder[0]);
  });

  it("sends only the items it was given: a rejected suggestion never reaches the catalog", async () => {
    await confirmPantrySuggestions([fresh("ägg")]);
    const [choices] = commitIngredients.mock.calls[0];
    expect(choices).toHaveLength(1);
    expect(choices[0].text).toBe("ägg");
    expect(JSON.stringify(commitIngredients.mock.calls)).not.toContain("ketchup");
  });

  it("never sends a chosen ingredient, so no synonym is saved, and gives a new name as its own text", async () => {
    await confirmPantrySuggestions([existing(mjolk), fresh("matlagningsgrädde", { amount: 2, unit: "dl" })]);
    const [choices] = commitIngredients.mock.calls[0];
    expect(choices.map((choice: { ingredient: { kind: string } }) => choice.ingredient.kind)).toEqual(["match", "new"]);
    expect(choices[1].text).toBe(choices[1].ingredient.proposal.name);
  });

  it("merges before the calls: one item per ingredient, place and unit, and amounts over unlimited", async () => {
    const result = await confirmPantrySuggestions([
      existing(mjolk, { amount: 1 }),
      existing(mjolk, { amount: null, unit: null }),
      existing(mjolk, { amount: 2 }),
      fresh("Ägg"),
      fresh("ägg", { amount: 4 }),
    ]);
    expect(result).toEqual(ok({ count: 2 }));
    expect(commitIngredients.mock.calls[0][0]).toHaveLength(2);
    expect(setPantryItemsIn).toHaveBeenCalledWith(db, [
      { ingredientId: mjolk, location: "Kyl", amount: 3, unit: "förp" },
      { ingredientId: agg, location: "Kyl", amount: 10, unit: "st" },
    ]);
  });

  it("returns unauthorized without an allowed user, and writes nothing", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await confirmPantrySuggestions([existing(mjolk)])).toEqual(fail("unauthorized"));
    expect(commitIngredients).not.toHaveBeenCalled();
    expect(setPantryItemsIn).not.toHaveBeenCalled();
  });

  it("merges again on the ids the catalog gives: a new name that is an ingredient in the list is one row", async () => {
    const gurka = "44444444-4444-4444-8444-444444444444";
    // commit_ingredients finds "gurka" by its name and gives the existing id.
    commitIngredients.mockResolvedValue([gurka, gurka]);
    const result = await confirmPantrySuggestions([
      existing(gurka, { amount: 2, unit: "st" }),
      fresh("gurka", { amount: 1, unit: "st" }),
    ]);
    expect(commitIngredients.mock.calls[0][0]).toHaveLength(2);
    expect(setPantryItemsIn).toHaveBeenCalledWith(db, [{ ingredientId: gurka, location: "Kyl", amount: 3, unit: "st" }]);
    expect(result).toEqual(ok({ count: 1 }));
  });

  it("applies amounts over unlimited again on the ids the catalog gives", async () => {
    commitIngredients.mockResolvedValue([mjolk, mjolk]);
    await confirmPantrySuggestions([existing(mjolk, { amount: null, unit: null }), fresh("Mjölk", { amount: 2, unit: "förp" })]);
    expect(setPantryItemsIn).toHaveBeenCalledWith(db, [{ ingredientId: mjolk, location: "Kyl", amount: 2, unit: "förp" }]);
  });

  it("names each item that is not valid by its index, so the client can leave it out", async () => {
    const result = await confirmPantrySuggestions([existing(mjolk), existing(mjolk, { unit: "tub" as never }), fresh("!!!")]);
    expect(result).toEqual(
      fail("validation", {
        "1": "Förslaget går inte att spara som det är. Rätta eller avvisa det.",
        "2": "Förslaget går inte att spara som det är. Rätta eller avvisa det.",
      }),
    );
    expect(commitIngredients).not.toHaveBeenCalled();
  });

  it("gives pantry_confirm_failed when the pantry gives back fewer rows, logged, without revalidating", async () => {
    setPantryItemsIn.mockResolvedValue([]);
    expect(await confirmPantrySuggestions([existing(mjolk)])).toEqual(fail("pantry_confirm_failed"));
    expect(log).toHaveBeenCalledWith("pantry_confirm_failed", { reason: "pantry_data: missing_rows", detail: "missing_rows" });
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty list", []],
    ["more than 40 items", Array.from({ length: 41 }, () => existing(mjolk))],
    ["an unknown unit", [existing(mjolk, { unit: "tub" as never })]],
    ["an unknown place", [existing(mjolk, { location: "Källare" as never })]],
    ["a negative amount", [existing(mjolk, { amount: -1 })]],
    ["an amount of 1 000 000", [existing(mjolk, { amount: 1_000_000 })]],
    ["an amount without unit", [existing(mjolk, { unit: null })]],
    ["a unit without amount", [existing(mjolk, { amount: null })]],
    ["an id that is not a uuid", [existing("mjolk")]],
    ["a new name with nothing to store", [fresh("!!!")]],
    ["a new name over 100 characters", [fresh("a".repeat(101))]],
    ["no list", "mjölk"],
  ])("refuses %s with validation, and writes nothing", async (_case, items) => {
    const result = await confirmPantrySuggestions(items as ConfirmItemInput[]);
    expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(commitIngredients).not.toHaveBeenCalled();
    expect(setPantryItemsIn).not.toHaveBeenCalled();
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("takes 40 items", async () => {
    const items = Array.from({ length: 40 }, (_, index) => existing(mjolk, { amount: index + 1 }));
    expect(await confirmPantrySuggestions(items)).toEqual(ok({ count: 1 }));
  });

  it("gives pantry_confirm_failed for an id not in the catalog, and leaves the pantry", async () => {
    commitIngredients.mockRejectedValue(new CatalogDataError("unknown_ingredient"));
    expect(await confirmPantrySuggestions([existing(mjolk)])).toEqual(fail("pantry_confirm_failed"));
    expect(log).toHaveBeenCalledWith("pantry_confirm_failed", { reason: "catalog_unknown_ingredient", detail: undefined });
    expect(setPantryItemsIn).not.toHaveBeenCalled();
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("gives pantry_confirm_failed when the catalog fails, and leaves the pantry", async () => {
    commitIngredients.mockRejectedValue(new CatalogDataError("query_failed", "08006"));
    expect(await confirmPantrySuggestions([fresh("ägg")])).toEqual(fail("pantry_confirm_failed"));
    expect(log).toHaveBeenCalledWith("pantry_confirm_failed", { reason: "catalog_query_failed", detail: "08006" });
    expect(setPantryItemsIn).not.toHaveBeenCalled();
  });

  it("gives pantry_confirm_failed when the catalog gives no id", async () => {
    commitIngredients.mockResolvedValue([null]);
    expect(await confirmPantrySuggestions([fresh("ägg")])).toEqual(fail("pantry_confirm_failed"));
    expect(setPantryItemsIn).not.toHaveBeenCalled();
  });

  it("gives pantry_confirm_failed when the pantry refuses, without revalidating, and a retry commits again", async () => {
    setPantryItemsIn.mockRejectedValueOnce(new PantryDataError("set_failed 23503"));
    const items = [fresh("ägg")];
    expect(await confirmPantrySuggestions(items)).toEqual(fail("pantry_confirm_failed"));
    expect(log).toHaveBeenCalledWith("pantry_confirm_failed", {
      reason: "pantry_data: set_failed 23503",
      detail: "set_failed 23503",
    });
    expect(revalidateFor).not.toHaveBeenCalled();
    // commit_ingredients gives the id of the ingredient made the first time.
    expect(await confirmPantrySuggestions(items)).toEqual(ok({ count: 1 }));
    expect(setPantryItemsIn.mock.calls.map(([, set]) => set[0].ingredientId)).toEqual([agg, agg]);
    expect(revalidateFor).toHaveBeenCalledTimes(1);
  });

  it("never logs names or amounts", async () => {
    setPantryItemsIn.mockRejectedValueOnce(new PantryDataError("set_failed 23503"));
    await confirmPantrySuggestions([fresh("hemligvara", { amount: 7 })]);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/hemligvara|7/);
  });

  it("lets other errors through", async () => {
    setPantryItemsIn.mockRejectedValue(new Error("boom"));
    await expect(confirmPantrySuggestions([existing(mjolk)])).rejects.toThrow("boom");
  });
});
