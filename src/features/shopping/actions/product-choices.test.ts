import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { ShoppingDataError } from "../data/client";

// saveProductChoice, removeProductChoice and restoreProductChoice (Story 7.2)
// with the user check, the session client, the data functions and
// revalidation stubbed. The store is the one the sheet sends, never read
// again here; the catalog and the stores are stubbed only to show that the
// actions never write to them.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const commitIngredients = vi.fn();
vi.mock("@/features/catalog/server", () => ({ commitIngredients: (...args: unknown[]) => commitIngredients(...args) }));
const getSelectedStore = vi.fn();
vi.mock("@/features/settings/server", () => ({ getSelectedStore: () => getSelectedStore() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const upsertProductChoiceIn = vi.fn();
const removeProductChoiceIn = vi.fn();
const restoreProductChoiceIn = vi.fn();
vi.mock("../data/product-choices", () => ({
  upsertProductChoiceIn: (...args: unknown[]) => upsertProductChoiceIn(...args),
  removeProductChoiceIn: (...args: unknown[]) => removeProductChoiceIn(...args),
  restoreProductChoiceIn: (...args: unknown[]) => restoreProductChoiceIn(...args),
}));

const { saveProductChoice } = await import("./save-product-choice");
const { removeProductChoice } = await import("./remove-product-choice");
const { restoreProductChoice } = await import("./restore-product-choice");

const userId = "99999999-9999-4999-8999-999999999999";
const gradde = "11111111-1111-4111-8111-111111111111";
const maxi = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";
const updatedAt = "2026-10-26T11:23:47.123456+00:00";
const expected = { id, updatedAt };
const input = {
  ingredientId: gradde,
  storeId: maxi,
  productName: " Arla  Matlagningsgrädde 15 % ",
  packageSize: "5 dl",
  url: "",
  expected,
};
const saved = { ingredientId: gradde, storeId: maxi, productName: "Arla Matlagningsgrädde 15 %", packageSize: "5 dl", url: null, expected };
const choice = { id, ingredientId: gradde, storeId: maxi, productName: "Arla Matlagningsgrädde 15 %", packageSize: "5 dl", url: null, updatedAt };

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: userId, email: "pontus@example.com" }));
  commitIngredients.mockReset();
  getSelectedStore.mockReset();
  upsertProductChoiceIn.mockReset().mockResolvedValue({ kind: "saved", choice });
  removeProductChoiceIn.mockReset().mockResolvedValue({ row: choice });
  restoreProductChoiceIn.mockReset().mockImplementation(async (_db, row) => row);
  revalidateFor.mockReset();
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("saveProductChoice", () => {
  it("saves the choice for the sheet's store with the form's rules and the expected choice, and revalidates the list", async () => {
    expect(await saveProductChoice(input)).toEqual(ok({ choice }));
    expect(upsertProductChoiceIn).toHaveBeenCalledWith(db, saved);
    expect(revalidateFor).toHaveBeenCalledWith("product_choice");
    // The store is the one the list was read with; nothing else is read or written.
    expect(getSelectedStore).not.toHaveBeenCalled();
    expect(commitIngredients).not.toHaveBeenCalled();
  });

  it("gives the form's messages without writing", async () => {
    expect(await saveProductChoice({ ...input, productName: "  ", url: "http://arla.se" })).toEqual(
      fail("validation", { productName: "Ange produktens namn.", url: "Ange en adress som börjar med https://." }),
    );
    expect(await saveProductChoice({ ...input, storeId: "maxi" })).toEqual(fail("validation"));
    expect(await saveProductChoice(undefined as never)).toEqual(fail("validation"));
    expect(upsertProductChoiceIn).not.toHaveBeenCalled();
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("sends no expected choice for a new one, and refuses an expected choice that is not one", async () => {
    await saveProductChoice({ ...input, expected: null });
    expect(upsertProductChoiceIn).toHaveBeenCalledWith(db, { ...saved, expected: null });
    expect(await saveProductChoice({ ...input, expected: { id: "x", updatedAt } })).toEqual(fail("validation"));
    expect(await saveProductChoice({ ...input, expected: undefined as never })).toEqual(fail("validation"));
  });

  it("gives shopping_product_choice_target_gone, and revalidates, for an ingredient or store that is gone or not the user's", async () => {
    upsertProductChoiceIn.mockResolvedValue({ kind: "target_gone" });
    expect(await saveProductChoice(input)).toEqual(fail("shopping_product_choice_target_gone"));
    expect(revalidateFor).toHaveBeenCalledWith("product_choice");
  });

  it("gives shopping_product_choice_changed, and revalidates, when another choice is stored than the expected one", async () => {
    upsertProductChoiceIn.mockResolvedValue({ kind: "changed" });
    expect(await saveProductChoice(input)).toEqual(fail("shopping_product_choice_changed"));
    expect(revalidateFor).toHaveBeenCalledWith("product_choice");
  });

  it("counts a written row that cannot be read back as saved", async () => {
    upsertProductChoiceIn.mockResolvedValue({ kind: "saved", choice: null });
    expect(await saveProductChoice(input)).toEqual(ok({ choice: null }));
    expect(revalidateFor).toHaveBeenCalledWith("product_choice");
  });

  it("gives shopping_product_choice_save_failed, logged without the product, when Supabase fails", async () => {
    upsertProductChoiceIn.mockRejectedValue(new ShoppingDataError("save_product_choice_failed 08006", "08006"));
    expect(await saveProductChoice(input)).toEqual(fail("shopping_product_choice_save_failed"));
    expect(log).toHaveBeenCalledWith("shopping_product_choice_save_failed", { reason: "save_product_choice_failed 08006" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("Arla");
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("returns unauthorized without an allowed user, and saves nothing", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await saveProductChoice(input)).toEqual(fail("unauthorized"));
    expect(upsertProductChoiceIn).not.toHaveBeenCalled();
  });

  it("throws other errors, which are bugs", async () => {
    upsertProductChoiceIn.mockRejectedValue(new TypeError("bug"));
    await expect(saveProductChoice(input)).rejects.toThrow("bug");
  });
});

describe("removeProductChoice", () => {
  it("deletes the choice, returns it for Ångra and revalidates the list", async () => {
    expect(await removeProductChoice({ id })).toEqual(ok({ status: "removed", row: choice }));
    expect(removeProductChoiceIn).toHaveBeenCalledWith(db, id);
    expect(revalidateFor).toHaveBeenCalledWith("product_choice");
  });

  it("says gone when the choice was gone already, and revalidates", async () => {
    removeProductChoiceIn.mockResolvedValue(null);
    expect(await removeProductChoice({ id })).toEqual(ok({ status: "gone" }));
    expect(revalidateFor).toHaveBeenCalledWith("product_choice");
  });

  it("counts a deleted row that cannot be read back as removed, without a row for Ångra", async () => {
    removeProductChoiceIn.mockResolvedValue({ row: null });
    expect(await removeProductChoice({ id })).toEqual(ok({ status: "removed", row: null }));
  });

  it("refuses an id that is not one, and fails with shopping_product_choice_remove_failed when Supabase does", async () => {
    expect(await removeProductChoice({ id: "x" })).toEqual(fail("validation"));
    expect(await removeProductChoice(null as never)).toEqual(fail("validation"));
    removeProductChoiceIn.mockRejectedValue(new ShoppingDataError("remove_product_choice_failed 08006", "08006"));
    expect(await removeProductChoice({ id })).toEqual(fail("shopping_product_choice_remove_failed"));
    expect(log).toHaveBeenCalledWith("shopping_product_choice_remove_failed", { reason: "remove_product_choice_failed 08006" });
  });

  it("returns unauthorized without an allowed user", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await removeProductChoice({ id })).toEqual(fail("unauthorized"));
    expect(removeProductChoiceIn).not.toHaveBeenCalled();
  });
});

describe("restoreProductChoice", () => {
  it("puts the row back with the same id and revalidates the list", async () => {
    expect(await restoreProductChoice(choice)).toEqual(ok({ choice }));
    expect(restoreProductChoiceIn).toHaveBeenCalledWith(db, choice);
    expect(revalidateFor).toHaveBeenCalledWith("product_choice");
  });

  it("gives shopping_restore_failed when a new choice was saved meanwhile, logged as info, not as an error", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    restoreProductChoiceIn.mockResolvedValue("conflict");
    expect(await restoreProductChoice(choice)).toEqual(fail("shopping_restore_failed"));
    expect(info).toHaveBeenCalledWith("shopping_restore_conflict", { reason: "product_choice_conflict" });
    expect(log).not.toHaveBeenCalled();
    // The list is read again, so the choice that won shows.
    expect(revalidateFor).toHaveBeenCalledWith("product_choice");
    info.mockRestore();
  });

  it("gives shopping_restore_failed, logged, when the ingredient or store is gone", async () => {
    restoreProductChoiceIn.mockResolvedValue("invalid_reference");
    expect(await restoreProductChoice(choice)).toEqual(fail("shopping_restore_failed"));
    expect(log).toHaveBeenCalledWith("shopping_restore_failed", { reason: "product_choice_invalid_reference" });
  });

  it("refuses a row the table would refuse, without writing", async () => {
    expect(await restoreProductChoice({ ...choice, productName: " " })).toEqual(fail("validation"));
    expect(await restoreProductChoice({ ...choice, id: "x" })).toEqual(fail("validation"));
    expect(await restoreProductChoice(undefined as never)).toEqual(fail("validation"));
    expect(restoreProductChoiceIn).not.toHaveBeenCalled();
  });

  it("gives shopping_restore_failed, logged, when Supabase fails, and unauthorized without a user", async () => {
    restoreProductChoiceIn.mockRejectedValue(new ShoppingDataError("restore_product_choice_failed 08006", "08006"));
    expect(await restoreProductChoice(choice)).toEqual(fail("shopping_restore_failed"));
    expect(log).toHaveBeenCalledWith("shopping_restore_failed", { reason: "restore_product_choice_failed 08006" });
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await restoreProductChoice(choice)).toEqual(fail("unauthorized"));
  });
});
