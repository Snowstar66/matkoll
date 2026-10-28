import { beforeEach, describe, expect, it, vi } from "vitest";
import { PantryDataError } from "./data/client";

// needsPlacePhotoSweep (Story 10.3) with the sweep's read stubbed: it says
// whether Hemma should start the sweep, and a failure never hides Hemma.

vi.mock("@/features/auth/server", () => ({ requireUser: vi.fn() }));
vi.mock("@/features/catalog/server", () => ({
  CatalogDataError: class extends Error {},
  getIngredientNames: vi.fn(),
  getIngredientDefaults: vi.fn(),
}));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const placePhotosNeedSweepIn = vi.fn();
vi.mock("./actions/photo-sweep", () => ({
  placePhotosNeedSweepIn: (...args: unknown[]) => placePhotosNeedSweepIn(...args),
}));

const { needsPlacePhotoSweep } = await import("./server");

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  placePhotosNeedSweepIn.mockReset().mockResolvedValue(false);
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("needsPlacePhotoSweep", () => {
  it("asks with the session client", async () => {
    expect(await needsPlacePhotoSweep()).toBe(false);
    expect(placePhotosNeedSweepIn).toHaveBeenCalledWith(db);
    placePhotosNeedSweepIn.mockResolvedValue(true);
    expect(await needsPlacePhotoSweep()).toBe(true);
  });

  it("is false when it cannot be read, and logs only the reason", async () => {
    placePhotosNeedSweepIn.mockRejectedValue(new PantryDataError("orphans_failed 08006"));
    expect(await needsPlacePhotoSweep()).toBe(false);
    expect(log).toHaveBeenCalledWith("pantry_photo_sweep_unavailable", { reason: "orphans_failed 08006" });
  });

  it("throws what is not a PantryDataError", async () => {
    placePhotosNeedSweepIn.mockRejectedValue(new TypeError("bug"));
    await expect(needsPlacePhotoSweep()).rejects.toThrow("bug");
  });
});
