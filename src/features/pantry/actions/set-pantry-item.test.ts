import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogDataError } from "@/features/catalog/server";
import { fail, ok } from "@/lib/errors";
import { PantryDataError } from "../data/client";
import { amountErrorMessage, type PantryItemFormInput } from "../domain/pantry-item-form";

// savePantryItem with the user check, the session client, the catalog, the write and revalidation stubbed.

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

const { savePantryItem } = await import("./set-pantry-item");

const mjolk = "11111111-1111-4111-8111-111111111111";
const saffran = "33333333-3333-4333-8333-333333333333";
const row = "22222222-2222-4222-8222-222222222222";
const stugan = "44444444-4444-4444-8444-444444444444";

const form = (overrides: Partial<PantryItemFormInput> = {}): PantryItemFormInput => ({
  ingredient: { kind: "existing", ingredientId: mjolk },
  amount: "1,5",
  unit: "l",
  location: "Kyl",
  siteId: stugan,
  replaceId: null,
  ...overrides,
});

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  commitIngredients.mockReset().mockResolvedValue([saffran]);
  setPantryItemsIn.mockReset().mockImplementation(async (_db, items: { ingredientId: string }[]) =>
    items.map((item) => ({ id: row, ...item })),
  );
  revalidateFor.mockReset();
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("savePantryItem", () => {
  it("sets the amount for an existing ingredient and revalidates", async () => {
    expect(await savePantryItem(form())).toEqual(ok({ id: row }));
    expect(setPantryItemsIn).toHaveBeenCalledWith(db, [{ ingredientId: mjolk, location: "Kyl", amount: 1.5, unit: "l" }], null, stugan);
    expect(commitIngredients).not.toHaveBeenCalled();
    expect(revalidateFor).toHaveBeenCalledWith("pantry_item");
  });

  it("saves an item without amount as unlimited, and an amount without unit as st", async () => {
    await savePantryItem(form({ amount: "", unit: "l" }));
    expect(setPantryItemsIn).toHaveBeenLastCalledWith(db, [{ ingredientId: mjolk, location: "Kyl", amount: null, unit: null }], null, stugan);
    await savePantryItem(form({ amount: "2", unit: "" }));
    expect(setPantryItemsIn).toHaveBeenLastCalledWith(db, [{ ingredientId: mjolk, location: "Kyl", amount: 2, unit: "st" }], null, stugan);
  });

  it("passes the row being changed, so a new location or unit moves it", async () => {
    await savePantryItem(form({ location: "Frys", replaceId: row }));
    expect(setPantryItemsIn).toHaveBeenCalledWith(db, [{ ingredientId: mjolk, location: "Frys", amount: 1.5, unit: "l" }], row, stugan);
  });

  it("creates a new catalog ingredient first, and sets the item for it", async () => {
    const result = await savePantryItem(
      form({ ingredient: { kind: "new", name: "Saffran", section: "Skafferi", location: "Skafferi" }, amount: "1", unit: "förp", location: "Skafferi" }),
    );
    expect(result).toEqual(ok({ id: row }));
    expect(commitIngredients).toHaveBeenCalledWith([
      {
        text: "Saffran",
        ingredient: { kind: "new", proposal: { name: "Saffran", section: "Skafferi", location: "Skafferi", defaultUnit: "förp" } },
      },
    ]);
    expect(setPantryItemsIn).toHaveBeenCalledWith(db, [{ ingredientId: saffran, location: "Skafferi", amount: 1, unit: "förp" }], null, stugan);
  });

  it("gives a new ingredient no default unit for an amount without unit, or an unlimited item", async () => {
    const saffran = { kind: "new", name: "Saffran", section: "Skafferi", location: "Skafferi" } as const;
    await savePantryItem(form({ ingredient: saffran, amount: "2", unit: "" }));
    await savePantryItem(form({ ingredient: saffran, amount: "", unit: "g" }));
    for (const [choices] of commitIngredients.mock.calls) {
      expect(choices[0].ingredient.proposal.defaultUnit).toBeNull();
    }
  });

  it("refuses a new ingredient's name the catalog cannot store, with the field's message", async () => {
    const result = await savePantryItem(form({ ingredient: { kind: "new", name: "!!!", section: "Övrigt", location: "Kyl" } }));
    expect(result).toEqual(fail("validation", { ingredient: "Skriv ett namn med bokstäver eller siffror." }));
    expect(commitIngredients).not.toHaveBeenCalled();
  });

  it("commits the new ingredient again when saving is retried after a failed write", async () => {
    // commit_ingredients gives the id of an ingredient with the same normalised name
    // (tests/integration/pantry.test.ts), so the retry creates no second one.
    const input = form({ ingredient: { kind: "new", name: "Saffran", section: "Skafferi", location: "Skafferi" } });
    setPantryItemsIn.mockRejectedValueOnce(new PantryDataError("set_failed 08006"));
    expect(await savePantryItem(input)).toEqual(fail("pantry_save_failed"));
    expect(await savePantryItem(input)).toEqual(ok({ id: row }));
    expect(commitIngredients).toHaveBeenCalledTimes(2);
    expect(setPantryItemsIn.mock.calls.map(([, items]) => items[0].ingredientId)).toEqual([saffran, saffran]);
  });

  it("gives pantry_save_failed when the write returns no row", async () => {
    setPantryItemsIn.mockResolvedValue([]);
    expect(await savePantryItem(form())).toEqual(fail("pantry_save_failed"));
    expect(log).toHaveBeenCalledWith("pantry_save_failed", { reason: "no_row" });
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("returns unauthorized without an allowed user, and saves nothing", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await savePantryItem(form())).toEqual(fail("unauthorized"));
    expect(setPantryItemsIn).not.toHaveBeenCalled();
  });

  it.each(["två", "0", "-1"])("refuses the amount %j with the field's message, and saves nothing", async (amount) => {
    expect(await savePantryItem(form({ amount }))).toEqual(fail("validation", { amount: amountErrorMessage }));
    expect(setPantryItemsIn).not.toHaveBeenCalled();
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("refuses a form that does not follow the schema", async () => {
    expect(await savePantryItem({ ...form(), location: "Garage" } as unknown as PantryItemFormInput)).toEqual(fail("validation"));
    expect(await savePantryItem(null as unknown as PantryItemFormInput)).toEqual(fail("validation"));
    expect(setPantryItemsIn).not.toHaveBeenCalled();
  });

  it("gives pantry_save_failed when the catalog fails, and sets nothing", async () => {
    commitIngredients.mockRejectedValue(new CatalogDataError("query_failed", "08006"));
    const result = await savePantryItem(form({ ingredient: { kind: "new", name: "Saffran", section: "Skafferi", location: "Kyl" } }));
    expect(result).toEqual(fail("pantry_save_failed"));
    expect(setPantryItemsIn).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("pantry_save_failed", { reason: "catalog_query_failed", detail: "08006" });
  });

  it("gives pantry_save_failed when the write fails, logs only the reason and revalidates nothing", async () => {
    setPantryItemsIn.mockRejectedValue(new PantryDataError("set_failed 23503"));
    expect(await savePantryItem(form())).toEqual(fail("pantry_save_failed"));
    expect(log).toHaveBeenCalledWith("pantry_save_failed", { reason: "set_failed 23503" });
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("saves on the place the sheet was opened for, also with the row being changed", async () => {
    await savePantryItem(form({ replaceId: row }));
    expect(setPantryItemsIn.mock.calls[0]![3]).toBe(stugan);
    expect(setPantryItemsIn.mock.calls[0]![2]).toBe(row);
  });

  it("refuses a form without a place, or with a place that is not an id", async () => {
    expect(await savePantryItem({ ...form(), siteId: undefined } as unknown as PantryItemFormInput)).toEqual(fail("validation"));
    expect(await savePantryItem(form({ siteId: "Stugan" }))).toEqual(fail("validation"));
    expect(setPantryItemsIn).not.toHaveBeenCalled();
  });

  it("gives pantry_site_gone for a place that was deleted (MK410), and revalidates the places", async () => {
    setPantryItemsIn.mockRejectedValue(new PantryDataError("set_failed MK410"));
    expect(await savePantryItem(form())).toEqual(fail("pantry_site_gone"));
    expect(log).toHaveBeenCalledWith("pantry_site_gone", { reason: "set_failed MK410" });
    expect(revalidateFor).toHaveBeenCalledWith("pantry_site");
  });

  it("throws other errors, which are bugs", async () => {
    setPantryItemsIn.mockRejectedValue(new TypeError("boom"));
    await expect(savePantryItem(form())).rejects.toThrow("boom");
  });
});
