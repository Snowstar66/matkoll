import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { PantryDataError } from "../data/client";

// restorePantryRemoval with the user check, the session client, the data
// functions and revalidation stubbed.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const restorePantryRemovalIn = vi.fn();
vi.mock("../data/remove", () => ({
  restorePantryRemovalIn: (...args: unknown[]) => restorePantryRemovalIn(...args),
}));

const { restorePantryRemoval } = await import("./restore-pantry-removal");

const operation = "44444444-4444-4444-8444-444444444444";
const row = {
  id: "22222222-2222-4222-8222-222222222222",
  ingredientId: "11111111-1111-4111-8111-111111111111",
  location: "Kyl" as const,
  amount: 2,
  unit: "förp" as const,
};
const restored = { restoredIds: [row.id], rows: [row], skipped: 0 };

let log: ReturnType<typeof vi.spyOn>;
let info: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  restorePantryRemovalIn.mockReset().mockResolvedValue(restored);
  revalidateFor.mockReset();
  log?.mockRestore();
  info?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
  info = vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("restorePantryRemoval", () => {
  it("puts the operation's rows back in one call and revalidates", async () => {
    expect(await restorePantryRemoval(operation)).toEqual(ok(restored));
    expect(restorePantryRemovalIn).toHaveBeenCalledTimes(1);
    expect(restorePantryRemovalIn).toHaveBeenCalledWith(db, operation);
    expect(revalidateFor).toHaveBeenCalledWith("pantry_item");
    expect(info).not.toHaveBeenCalled();
  });

  it("logs skipped rows as info with only their number, and revalidates all the same", async () => {
    restorePantryRemovalIn.mockResolvedValue({ ...restored, skipped: 3 });
    expect(await restorePantryRemoval(operation)).toEqual(ok({ ...restored, skipped: 3 }));
    expect(info).toHaveBeenCalledWith("pantry_restore_skipped", { count: 3 });
    expect(log).not.toHaveBeenCalled();
    expect(revalidateFor).toHaveBeenCalledWith("pantry_item");
  });

  it("stays ok when revalidation fails after the restore has committed", async () => {
    revalidateFor.mockImplementation(() => {
      throw new Error("no store");
    });
    expect(await restorePantryRemoval(operation)).toEqual(ok(restored));
    expect(log).toHaveBeenCalledWith("pantry_revalidate_failed", { reason: "Error" });
  });

  it("gives pantry_restore_failed as an error with the reason logged, and revalidates nothing, when the database refuses", async () => {
    restorePantryRemovalIn.mockRejectedValue(new PantryDataError("restore_failed P0002"));
    expect(await restorePantryRemoval(operation)).toEqual(fail("pantry_restore_failed"));
    expect(log).toHaveBeenCalledWith("pantry_restore_failed", { reason: "restore_failed P0002" });
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it.each(["op-1", "", null, 7])("refuses the operation id %j", async (invalid) => {
    expect(await restorePantryRemoval(invalid as unknown as string)).toEqual(fail("validation"));
    expect(restorePantryRemovalIn).not.toHaveBeenCalled();
  });

  it("returns unauthorized without an allowed user, and restores nothing", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await restorePantryRemoval(operation)).toEqual(fail("unauthorized"));
    expect(restorePantryRemovalIn).not.toHaveBeenCalled();
  });
});
