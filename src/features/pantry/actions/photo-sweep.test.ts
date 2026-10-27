import { beforeEach, describe, expect, it, vi } from "vitest";
import { PantryDataError, type PantryDb } from "../data/client";

// sweepPlacePhotosIn and placePhotosNeedSweepIn (Story 10.3) with the data
// functions stubbed: the order (files before rows), the limit of 100 files
// per sweep, the 10 minutes for files without a row, and that a failure
// leaves the rows and says why. tests/integration/pantry-photo.test.ts runs
// the sweep against Supabase.

const steps: string[] = [];
const loadExpiredPlacePhotosIn = vi.fn();
const loadPlacePhotoOrphansIn = vi.fn();
const removePlacePhotoFiles = vi.fn();
const deletePlacePhotoRowsIn = vi.fn();
vi.mock("../data/photos", () => ({
  loadExpiredPlacePhotosIn: (...args: unknown[]) => (steps.push("expired"), loadExpiredPlacePhotosIn(...args)),
  loadPlacePhotoOrphansIn: (...args: unknown[]) => (steps.push("orphans"), loadPlacePhotoOrphansIn(...args)),
  removePlacePhotoFiles: (...args: unknown[]) => (steps.push("remove"), removePlacePhotoFiles(...args)),
  deletePlacePhotoRowsIn: (...args: unknown[]) => (steps.push("delete"), deletePlacePhotoRowsIn(...args)),
}));

const { placePhotosNeedSweepIn, sweepPlacePhotosIn } = await import("./photo-sweep");

const db = { session: true } as unknown as PantryDb;
const now = new Date("2026-10-26T15:42:00.000Z");
const thirtyDaysBefore = new Date("2026-09-26T15:42:00.000Z");

const expired = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `id-${index}`, objectPath: `old/${index}.jpg` }));
const orphans = (count: number) => Array.from({ length: count }, (_, index) => `orphan/${index}.jpg`);

beforeEach(() => {
  steps.length = 0;
  loadExpiredPlacePhotosIn.mockReset().mockResolvedValue([]);
  loadPlacePhotoOrphansIn.mockReset().mockResolvedValue([]);
  removePlacePhotoFiles.mockReset().mockImplementation(async (_db: unknown, paths: string[]) => paths.length);
  deletePlacePhotoRowsIn.mockReset().mockImplementation(async (_db: unknown, ids: string[]) => ids.length);
});

describe("sweepPlacePhotosIn", () => {
  it("removes an old photo's file, then its row, then the files without a row older than 10 minutes", async () => {
    loadExpiredPlacePhotosIn.mockResolvedValue(expired(1));
    loadPlacePhotoOrphansIn.mockResolvedValue(orphans(2));
    expect(await sweepPlacePhotosIn(db, { now })).toEqual({ removed: 3, failed: null });
    expect(steps).toEqual(["expired", "remove", "delete", "orphans", "remove"]);
    expect(loadExpiredPlacePhotosIn).toHaveBeenCalledWith(db, thirtyDaysBefore, 100);
    expect(removePlacePhotoFiles).toHaveBeenNthCalledWith(1, db, ["old/0.jpg"]);
    expect(deletePlacePhotoRowsIn).toHaveBeenCalledWith(db, ["id-0"]);
    expect(loadPlacePhotoOrphansIn).toHaveBeenCalledWith(db, 600_000);
    expect(removePlacePhotoFiles).toHaveBeenNthCalledWith(2, db, orphans(2));
  });

  it("does nothing, and removes nothing, when there is nothing to sweep", async () => {
    expect(await sweepPlacePhotosIn(db, { now })).toEqual({ removed: 0, failed: null });
    expect(deletePlacePhotoRowsIn).not.toHaveBeenCalled();
    expect(removePlacePhotoFiles).toHaveBeenCalledWith(db, []);
  });

  it("removes at most 100 files: 100 old photos leave the files without a row for the next sweep", async () => {
    loadExpiredPlacePhotosIn.mockResolvedValue(expired(100));
    expect(await sweepPlacePhotosIn(db, { now })).toEqual({ removed: 100, failed: null });
    expect(loadPlacePhotoOrphansIn).not.toHaveBeenCalled();
  });

  it("takes only as many files without a row as there is room for", async () => {
    loadExpiredPlacePhotosIn.mockResolvedValue(expired(60));
    loadPlacePhotoOrphansIn.mockResolvedValue(orphans(100));
    expect(await sweepPlacePhotosIn(db, { now })).toEqual({ removed: 100, failed: null });
    expect(removePlacePhotoFiles).toHaveBeenLastCalledWith(db, orphans(40));
  });

  it("keeps the rows when their files cannot be removed, and says why", async () => {
    loadExpiredPlacePhotosIn.mockResolvedValue(expired(2));
    removePlacePhotoFiles.mockRejectedValue(new PantryDataError("remove_failed 503"));
    expect(await sweepPlacePhotosIn(db, { now })).toEqual({ removed: 0, failed: "remove_failed 503" });
    expect(deletePlacePhotoRowsIn).not.toHaveBeenCalled();
    expect(loadPlacePhotoOrphansIn).not.toHaveBeenCalled();
  });

  it("counts what went before a later step failed", async () => {
    loadExpiredPlacePhotosIn.mockResolvedValue(expired(1));
    loadPlacePhotoOrphansIn.mockRejectedValue(new PantryDataError("orphans_failed 08006"));
    expect(await sweepPlacePhotosIn(db, { now })).toEqual({ removed: 1, failed: "orphans_failed 08006" });
  });

  it("takes another age for files without a row (tests), and throws what is not a PantryDataError", async () => {
    await sweepPlacePhotosIn(db, { now, orphanMinAgeMs: 0 });
    expect(loadPlacePhotoOrphansIn).toHaveBeenCalledWith(db, 0);
    loadExpiredPlacePhotosIn.mockRejectedValue(new TypeError("bug"));
    await expect(sweepPlacePhotosIn(db, { now })).rejects.toThrow("bug");
  });
});

describe("placePhotosNeedSweepIn", () => {
  it("is false with only photos younger than 30 days and no file without a row", async () => {
    expect(await placePhotosNeedSweepIn(db, now)).toBe(false);
    expect(loadExpiredPlacePhotosIn).toHaveBeenCalledWith(db, thirtyDaysBefore, 1);
    expect(loadPlacePhotoOrphansIn).toHaveBeenCalledWith(db, 600_000);
    expect(removePlacePhotoFiles).not.toHaveBeenCalled();
    expect(deletePlacePhotoRowsIn).not.toHaveBeenCalled();
  });

  it("is true with an old photo, or with a file without a row", async () => {
    loadExpiredPlacePhotosIn.mockResolvedValue(expired(1));
    expect(await placePhotosNeedSweepIn(db, now)).toBe(true);
    loadExpiredPlacePhotosIn.mockResolvedValue([]);
    loadPlacePhotoOrphansIn.mockResolvedValue(orphans(1));
    expect(await placePhotosNeedSweepIn(db, now)).toBe(true);
  });
});
