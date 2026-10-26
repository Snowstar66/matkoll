import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { PantryDataError } from "../data/client";
import type { PantryRow } from "../domain/pantry-item-form";

// restorePantryItem with the user check, the session
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

const { restorePantryItem } = await import("./restore-pantry-item");

const rowId = "22222222-2222-4222-8222-222222222222";
const mjolk = "11111111-1111-4111-8111-111111111111";
const row: PantryRow = { id: rowId, ingredientId: mjolk, location: "Kyl", amount: 1, unit: "l" };

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  removePantryItemIn.mockReset().mockResolvedValue(row);
  restorePantryItemIn.mockReset().mockImplementation(async (_db, restored: PantryRow) => restored);
  revalidateFor.mockReset();
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("restorePantryItem", () => {
  it("puts the row back with the same id and revalidates", async () => {
    expect(await restorePantryItem(row)).toEqual(ok(row));
    expect(restorePantryItemIn).toHaveBeenCalledWith(db, row);
    expect(revalidateFor).toHaveBeenCalledWith("pantry_item");
  });

  it("restores an unlimited row", async () => {
    const salt = { ...row, amount: null, unit: null };
    expect(await restorePantryItem(salt)).toEqual(ok(salt));
  });

  it("gives pantry_restore_failed when the location has the item again, and revalidates so the row there shows", async () => {
    restorePantryItemIn.mockRejectedValue(new PantryDataError("restore_failed 23505"));
    expect(await restorePantryItem(row)).toEqual(fail("pantry_restore_failed"));
    expect(log).toHaveBeenCalledWith("pantry_restore_failed", { reason: "restore_failed 23505" });
    expect(revalidateFor).toHaveBeenCalledWith("pantry_item");
  });

  it("gives pantry_restore_failed and revalidates nothing when the database fails otherwise", async () => {
    restorePantryItemIn.mockRejectedValue(new PantryDataError("restore_failed 08006"));
    expect(await restorePantryItem(row)).toEqual(fail("pantry_restore_failed"));
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it.each([
    { ...row, id: "rad-1" },
    { ...row, amount: 1, unit: null },
    { ...row, location: "Garage" },
    null,
  ])("refuses the row %j", async (invalid) => {
    expect(await restorePantryItem(invalid as unknown as PantryRow)).toEqual(fail("validation"));
    expect(restorePantryItemIn).not.toHaveBeenCalled();
  });

  it("returns unauthorized without an allowed user, and restores nothing", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await restorePantryItem(row)).toEqual(fail("unauthorized"));
    expect(restorePantryItemIn).not.toHaveBeenCalled();
  });
});
