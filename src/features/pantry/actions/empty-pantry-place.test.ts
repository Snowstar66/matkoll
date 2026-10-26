import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Location } from "@/features/catalog";
import { fail, ok } from "@/lib/errors";
import { PantryDataError } from "../data/client";

// emptyPantryPlace with the user check, the session client, the data
// functions and revalidation stubbed.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const emptyPantryPlaceIn = vi.fn();
vi.mock("../data/remove", () => ({
  emptyPantryPlaceIn: (...args: unknown[]) => emptyPantryPlaceIn(...args),
}));

const { emptyPantryPlace } = await import("./empty-pantry-place");

const operation = "44444444-4444-4444-8444-444444444444";
/** The place Hemma showed (Story 8.4). */
const stugan = "55555555-5555-4555-8555-555555555555";
const ids = ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  emptyPantryPlaceIn.mockReset().mockResolvedValue({ removed: 2, removedIds: ids });
  revalidateFor.mockReset();
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("emptyPantryPlace", () => {
  it("empties the location in one call under the operation id, and revalidates", async () => {
    expect(await emptyPantryPlace("Kyl", operation, stugan)).toEqual(ok({ removed: 2, removedIds: ids }));
    expect(emptyPantryPlaceIn).toHaveBeenCalledTimes(1);
    expect(emptyPantryPlaceIn).toHaveBeenCalledWith(db, "Kyl", operation, stugan);
    expect(revalidateFor).toHaveBeenCalledWith("pantry_item");
  });

  it("is ok with no rows when the location is empty already, and revalidates so the list catches up", async () => {
    emptyPantryPlaceIn.mockResolvedValue({ removed: 0, removedIds: [] });
    expect(await emptyPantryPlace("Frys", operation, stugan)).toEqual(ok({ removed: 0, removedIds: [] }));
    expect(revalidateFor).toHaveBeenCalledWith("pantry_item");
  });

  it("stays ok when revalidation fails after the delete has committed, and logs it", async () => {
    revalidateFor.mockImplementation(() => {
      throw new TypeError("no store");
    });
    expect(await emptyPantryPlace("Kyl", operation, stugan)).toEqual(ok({ removed: 2, removedIds: ids }));
    expect(log).toHaveBeenCalledWith("pantry_revalidate_failed", { reason: "TypeError" });
  });

  it("gives pantry_empty_failed with the reason logged, and revalidates nothing, when the database refuses", async () => {
    emptyPantryPlaceIn.mockRejectedValue(new PantryDataError("empty_failed 42501"));
    expect(await emptyPantryPlace("Kyl", operation, stugan)).toEqual(fail("pantry_empty_failed"));
    expect(log).toHaveBeenCalledWith("pantry_empty_failed", { reason: "empty_failed 42501" });
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it.each([
    ["Garage", operation],
    ["kyl", operation],
    [null, operation],
    [["Kyl"], operation],
    ["Kyl", "op-1"],
    ["Kyl", null],
  ])("refuses the location %j with the operation %j", async (location, operationId) => {
    expect(await emptyPantryPlace(location as unknown as Location, operationId as unknown as string, stugan)).toEqual(fail("validation"));
    expect(emptyPantryPlaceIn).not.toHaveBeenCalled();
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("returns unauthorized without an allowed user, and removes nothing", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await emptyPantryPlace("Kyl", operation, stugan)).toEqual(fail("unauthorized"));
    expect(emptyPantryPlaceIn).not.toHaveBeenCalled();
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("refuses no place: there is no fallback to the selected place (Story 8.4)", async () => {
    expect(await emptyPantryPlace("Kyl", operation, null as unknown as string)).toEqual(fail("validation"));
    expect(emptyPantryPlaceIn).not.toHaveBeenCalled();
  });

  it("refuses a place that is not a uuid, and removes nothing (Story 8.4)", async () => {
    expect(await emptyPantryPlace("Kyl", operation, "stugan")).toEqual(fail("validation"));
    expect(emptyPantryPlaceIn).not.toHaveBeenCalled();
  });

  it("gives pantry_site_gone for a place that is gone, reads the page again, and revalidates no pantry (Story 8.4)", async () => {
    emptyPantryPlaceIn.mockRejectedValue(new PantryDataError("site_gone"));
    expect(await emptyPantryPlace("Kyl", operation, stugan)).toEqual(fail("pantry_site_gone"));
    expect(revalidateFor).toHaveBeenCalledExactlyOnceWith("pantry_site");
    expect(console.info).toHaveBeenCalledWith("pantry_site_gone", { reason: "MK410" });
    expect(log).not.toHaveBeenCalledWith("pantry_site_gone", expect.anything());
  });

  it("throws errors that are not the pantry's", async () => {
    emptyPantryPlaceIn.mockRejectedValue(new Error("bug"));
    await expect(emptyPantryPlace("Kyl", operation, stugan)).rejects.toThrow("bug");
  });
});
