import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductChoiceForm } from "../domain/product-choice";
import { ShoppingDataError, type ShoppingDb } from "./client";
import { listProductChoicesIn, removeProductChoiceIn, upsertProductChoiceIn } from "./product-choices";

// The product choices' data functions with a stub database, for the rows the
// domain cannot read (tests/integration covers the real tables): such a row
// is never hidden as "no choice", and a write that cannot be read back still
// counts as done.

const gradde = "11111111-1111-4111-8111-111111111111";
const kaffe = "55555555-5555-4555-8555-555555555555";
const maxi = "22222222-2222-4222-8222-222222222222";
const updatedAt = "2026-10-26T11:23:47.123456+00:00";
const row = (changes: Record<string, unknown> = {}) => ({
  id: "33333333-3333-4333-8333-333333333333",
  ingredient_id: gradde,
  store_id: maxi,
  product_name: "Arla Matlagningsgrädde 15 %",
  package_size: "5 dl",
  url: null,
  updated_at: updatedAt,
  ...changes,
});

/** A query that answers `answer` however it is chained. */
function query(answer: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "delete", "insert", "maybeSingle", "single"]) chain[method] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(answer).then(resolve);
  return chain;
}

function stub(answer: { data: unknown; error: unknown }) {
  return { from: vi.fn(() => query(answer)), rpc: vi.fn(async () => answer) } as unknown as ShoppingDb;
}

const form: ProductChoiceForm = {
  ingredientId: gradde,
  storeId: maxi,
  productName: "Arla Matlagningsgrädde 15 %",
  packageSize: "5 dl",
  url: null,
  expected: null,
};

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("listProductChoicesIn", () => {
  it("lists readable rows by ingredient, and marks an unreadable row's ingredient instead of hiding it", async () => {
    const db = stub({ data: [row(), row({ id: "44444444-4444-4444-8444-444444444444", ingredient_id: kaffe, product_name: " " })], error: null });
    const result = await listProductChoicesIn(db, maxi);
    expect(Object.keys(result.choices)).toEqual([gradde]);
    expect(result.choices[gradde]).toMatchObject({ productName: "Arla Matlagningsgrädde 15 %", updatedAt });
    expect(result.unreadable).toEqual([kaffe]);
    // Logged without the product.
    expect(log).toHaveBeenCalledWith("shopping_product_choice_unreadable", { reason: "invalid_row" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("Arla");
  });

  it("throws ShoppingDataError when the query fails, and for a store id that is not one", async () => {
    await expect(listProductChoicesIn(stub({ data: null, error: { code: "08006" } }), maxi)).rejects.toThrow(ShoppingDataError);
    await expect(listProductChoicesIn(stub({ data: [], error: null }), "maxi")).rejects.toThrow(ShoppingDataError);
  });
});

describe("upsertProductChoiceIn", () => {
  it("counts a written row that cannot be read back as saved, and logs it", async () => {
    expect(await upsertProductChoiceIn(stub({ data: row({ product_name: "" }), error: null }), form)).toEqual({
      kind: "saved",
      choice: null,
    });
    expect(log).toHaveBeenCalledWith("shopping_product_choice_unreadable", { reason: "saved_row" });
  });

  it("tells a changed choice (MK409, or 23505 after an Ångra) and a missing target (23503) from other errors", async () => {
    expect(await upsertProductChoiceIn(stub({ data: null, error: { code: "MK409" } }), form)).toEqual({ kind: "changed" });
    expect(await upsertProductChoiceIn(stub({ data: null, error: { code: "23505" } }), form)).toEqual({ kind: "changed" });
    expect(await upsertProductChoiceIn(stub({ data: null, error: { code: "23503" } }), form)).toEqual({ kind: "target_gone" });
    await expect(upsertProductChoiceIn(stub({ data: null, error: { code: "08006" } }), form)).rejects.toThrow(ShoppingDataError);
  });
});

describe("removeProductChoiceIn", () => {
  it("counts a deleted row that cannot be read back as removed, without a row to put back", async () => {
    expect(await removeProductChoiceIn(stub({ data: [row({ url: "http://arla.se" })], error: null }), row().id)).toEqual({ row: null });
    expect(log).toHaveBeenCalledWith("shopping_product_choice_unreadable", { reason: "removed_row" });
  });

  it("gives null when nothing was deleted", async () => {
    expect(await removeProductChoiceIn(stub({ data: [], error: null }), row().id)).toBeNull();
  });
});
