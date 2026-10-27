import { beforeEach, describe, expect, it, vi } from "vitest";
import { PantryDataError, type PantryDb } from "../data/client";

// sweepPlacePhotosIn and placePhotosNeedSweepIn (Story 10.3) with the data
// functions stubbed: the order (files before rows), rows deleted only when
// their files are gone, the limit of 100 files per sweep and `more`, the 10
// minutes for files without a row, `remove_partial`, and that the files
// without a row are swept also when the old photos' step failed.
// tests/integration/pantry-photo.test.ts runs the sweep against Supabase.

const steps: string[] = [];
const loadExpiredPlacePhotosIn = vi.fn();
const loadPlacePhotoOrphansIn = vi.fn();
const removePlacePhotoFiles = vi.fn();
const deleteExpiredPlacePhotoRowsIn = vi.fn();
vi.mock("../data/photos", () => ({
  loadExpiredPlacePhotosIn: (...args: unknown[]) => (steps.push("expired"), loadExpiredPlacePhotosIn(...args)),
  loadPlacePhotoOrphansIn: (...args: unknown[]) => (steps.push("orphans"), loadPlacePhotoOrphansIn(...args)),
  removePlacePhotoFiles: (...args: unknown[]) => (steps.push("remove"), removePlacePhotoFiles(...args)),
  deleteExpiredPlacePhotoRowsIn: (...args: unknown[]) => (steps.push("delete"), deleteExpiredPlacePhotoRowsIn(...args)),
}));

const { photoSweepPartial, placePhotosNeedSweepIn, sweepPlacePhotosIn } = await import("./photo-sweep");

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
  removePlacePhotoFiles.mockReset().mockImplementation(async (_db: unknown, paths: string[]) => ({ removed: paths, failed: null }));
  deleteExpiredPlacePhotoRowsIn.mockReset().mockImplementation(async (_db: unknown, ids: string[]) => ids);
});

describe("sweepPlacePhotosIn", () => {
  it("removes an old photo's file, then its row if the file is gone, then the files without a row older than 10 minutes", async () => {
    loadExpiredPlacePhotosIn.mockResolvedValue(expired(1));
    loadPlacePhotoOrphansIn.mockResolvedValue(orphans(2));
    expect(await sweepPlacePhotosIn(db, { now })).toEqual({ removed: 3, more: false, failed: null });
    expect(steps).toEqual(["expired", "remove", "delete", "orphans", "remove"]);
    expect(loadExpiredPlacePhotosIn).toHaveBeenCalledWith(db, thirtyDaysBefore, 100);
    expect(removePlacePhotoFiles).toHaveBeenNthCalledWith(1, db, ["old/0.jpg"]);
    // Conditional on what was read: the ids, and the same cutoff.
    expect(deleteExpiredPlacePhotoRowsIn).toHaveBeenCalledWith(db, ["id-0"], thirtyDaysBefore);
    expect(loadPlacePhotoOrphansIn).toHaveBeenCalledWith(db, 600_000);
    expect(removePlacePhotoFiles).toHaveBeenNthCalledWith(2, db, orphans(2));
  });

  it("does nothing, and removes nothing, when there is nothing to sweep", async () => {
    expect(await sweepPlacePhotosIn(db, { now })).toEqual({ removed: 0, more: false, failed: null });
    expect(deleteExpiredPlacePhotoRowsIn).not.toHaveBeenCalled();
  });

  it("removes at most 100 files: 100 old photos leave the files without a row for the next call (more)", async () => {
    loadExpiredPlacePhotosIn.mockResolvedValue(expired(100));
    expect(await sweepPlacePhotosIn(db, { now })).toEqual({ removed: 100, more: true, failed: null });
    expect(loadPlacePhotoOrphansIn).not.toHaveBeenCalled();
  });

  it("takes only as many files without a row as there is room for, and says more remain", async () => {
    loadExpiredPlacePhotosIn.mockResolvedValue(expired(60));
    loadPlacePhotoOrphansIn.mockResolvedValue(orphans(100));
    expect(await sweepPlacePhotosIn(db, { now })).toEqual({ removed: 100, more: true, failed: null });
    expect(removePlacePhotoFiles).toHaveBeenLastCalledWith(db, orphans(40));
  });

  it("says more remain when pantry_photo_orphans gave its full 100", async () => {
    loadPlacePhotoOrphansIn.mockResolvedValue(orphans(100));
    expect(await sweepPlacePhotosIn(db, { now })).toEqual({ removed: 100, more: true, failed: null });
  });

  it("deletes only the rows whose files are gone, and says remove_partial for the others", async () => {
    loadExpiredPlacePhotosIn.mockResolvedValue(expired(2));
    removePlacePhotoFiles.mockResolvedValueOnce({ removed: ["old/0.jpg"], failed: "remove_failed 503" });
    deleteExpiredPlacePhotoRowsIn.mockResolvedValueOnce(["id-0"]);
    loadPlacePhotoOrphansIn.mockResolvedValue(orphans(1));
    expect(await sweepPlacePhotosIn(db, { now })).toEqual({ removed: 2, more: false, failed: "remove_failed 503" });

    loadExpiredPlacePhotosIn.mockResolvedValue(expired(2));
    removePlacePhotoFiles.mockResolvedValueOnce({ removed: ["old/0.jpg"], failed: null });
    deleteExpiredPlacePhotoRowsIn.mockResolvedValueOnce(["id-0"]);
    loadPlacePhotoOrphansIn.mockResolvedValue([]);
    expect(await sweepPlacePhotosIn(db, { now })).toEqual({ removed: 1, more: false, failed: photoSweepPartial });
  });

  it("says remove_partial when fewer files without a row went than were chosen", async () => {
    loadPlacePhotoOrphansIn.mockResolvedValue(orphans(3));
    removePlacePhotoFiles.mockResolvedValueOnce({ removed: orphans(1), failed: null });
    expect(await sweepPlacePhotosIn(db, { now })).toEqual({ removed: 1, more: false, failed: "remove_partial" });
  });

  it("sweeps the files without a row also when the old photos' step failed, and never says more after a failure", async () => {
    loadExpiredPlacePhotosIn.mockRejectedValue(new PantryDataError("query_failed 08006"));
    loadPlacePhotoOrphansIn.mockResolvedValue(orphans(100));
    expect(await sweepPlacePhotosIn(db, { now })).toEqual({ removed: 100, more: false, failed: "query_failed 08006" });
    expect(removePlacePhotoFiles).toHaveBeenCalledWith(db, orphans(100));
  });

  it("counts what went before a later step failed", async () => {
    loadExpiredPlacePhotosIn.mockResolvedValue(expired(1));
    loadPlacePhotoOrphansIn.mockRejectedValue(new PantryDataError("orphans_failed 08006"));
    expect(await sweepPlacePhotosIn(db, { now })).toEqual({ removed: 1, more: false, failed: "orphans_failed 08006" });
  });

  it("takes another age for files without a row (tests), and throws what is not a PantryDataError", async () => {
    await sweepPlacePhotosIn(db, { now, orphanMinAgeMs: 0 });
    expect(loadPlacePhotoOrphansIn).toHaveBeenCalledWith(db, 0);
    loadExpiredPlacePhotosIn.mockRejectedValue(new TypeError("bug"));
    await expect(sweepPlacePhotosIn(db, { now })).rejects.toThrow("bug");
  });
});

describe("placePhotosNeedSweepIn", () => {
  it("reads only whether a photo is older than 30 days, never the files without a row", async () => {
    expect(await placePhotosNeedSweepIn(db, now)).toBe(false);
    expect(loadExpiredPlacePhotosIn).toHaveBeenCalledWith(db, thirtyDaysBefore, 1);
    expect(loadPlacePhotoOrphansIn).not.toHaveBeenCalled();
    expect(removePlacePhotoFiles).not.toHaveBeenCalled();
    expect(deleteExpiredPlacePhotoRowsIn).not.toHaveBeenCalled();
  });

  it("is true with an old photo", async () => {
    loadExpiredPlacePhotosIn.mockResolvedValue(expired(1));
    expect(await placePhotosNeedSweepIn(db, now)).toBe(true);
  });
});
