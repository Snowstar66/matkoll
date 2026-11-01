import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { PantryDataError } from "../data/client";
import type { PantryRow } from "../domain/pantry-item-form";

// removePantryItem with the user check, the session
// client, the data functions and revalidation stubbed.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const removePantryItemIn = vi.fn();
const restorePantryItemIn = vi.fn();
vi.mock("../data/remove", () => ({
  removePantryItemIn: (...args: unknown[]) => removePantryItemIn(...args),
  restorePantryItemIn: (...args: unknown[]) => restorePantryItemIn(...args),
}));

const { removePantryItem } = await import("./remove-pantry-item");

const rowId = "22222222-2222-4222-8222-222222222222";
const mjolk = "11111111-1111-4111-8111-111111111111";
const row: PantryRow = { id: rowId, ingredientId: mjolk, location: "Kyl", amount: 1, unit: "l" };

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  removePantryItemIn.mockReset().mockResolvedValue({ row });
  restorePantryItemIn.mockReset().mockImplementation(async (_db, restored: PantryRow) => restored);
  revalidateFor.mockReset();
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("removePantryItem", () => {
  it("removes the user's row, returns it and revalidates", async () => {
    expect(await removePantryItem(rowId)).toEqual(ok(row));
    expect(removePantryItemIn).toHaveBeenCalledWith(db, rowId);
    expect(revalidateFor).toHaveBeenCalledWith("pantry_item");
  });

  it("returns null when the deleted row cannot be read back, and still revalidates", async () => {
    removePantryItemIn.mockResolvedValue({ row: null });
    expect(await removePantryItem(rowId)).toEqual(ok(null));
    expect(log).toHaveBeenCalledWith("pantry_remove_unrestorable", { reason: "invalid_row" });
    expect(revalidateFor).toHaveBeenCalledWith("pantry_item");
  });

  it("gives pantry_remove_failed when the user has no row with the id, and revalidates the stale list", async () => {
    removePantryItemIn.mockResolvedValue(null);
    expect(await removePantryItem(rowId)).toEqual(fail("pantry_remove_failed"));
    expect(log).toHaveBeenCalledWith("pantry_remove_failed", { reason: "not_found" });
    expect(revalidateFor).toHaveBeenCalledWith("pantry_item");
  });

  it("gives pantry_remove_failed when the database fails, logs only the reason and revalidates nothing", async () => {
    removePantryItemIn.mockRejectedValue(new PantryDataError("remove_failed 08006"));
    expect(await removePantryItem(rowId)).toEqual(fail("pantry_remove_failed"));
    expect(log).toHaveBeenCalledWith("pantry_remove_failed", { reason: "remove_failed 08006" });
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("refuses an id that is not a uuid", async () => {
    expect(await removePantryItem("rad-1")).toEqual(fail("validation"));
    expect(await removePantryItem(null as unknown as string)).toEqual(fail("validation"));
    expect(removePantryItemIn).not.toHaveBeenCalled();
  });

  it("returns unauthorized without an allowed user, and removes nothing", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await removePantryItem(rowId)).toEqual(fail("unauthorized"));
    expect(removePantryItemIn).not.toHaveBeenCalled();
  });

  it("throws other errors, which are bugs", async () => {
    removePantryItemIn.mockRejectedValue(new TypeError("boom"));
    await expect(removePantryItem(rowId)).rejects.toThrow("boom");
  });
});
