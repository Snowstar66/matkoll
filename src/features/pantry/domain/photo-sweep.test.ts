import { describe, expect, it } from "vitest";
import {
  inBatches,
  intervalOf,
  photoOrphanMinAgeMs,
  photoSweepBatchSize,
  photoSweepMaxRounds,
  placePhotoExpiredBefore,
  placePhotoMaxAgeDays,
} from "./photo-sweep";
import { maxTakenAtAgeMs } from "./place-photo";

describe("the sweep's limits (Story 10.3)", () => {
  it("keeps photos for 30 days and files without a row for 10 minutes, and removes at most 100 at a time", () => {
    expect(placePhotoMaxAgeDays).toBe(30);
    expect(photoOrphanMinAgeMs).toBe(600_000);
    expect(photoSweepBatchSize).toBe(100);
  });

  it("never sweeps a photo just saved: its time is clamped to the last day, far inside the 30", () => {
    expect(maxTakenAtAgeMs).toBeLessThan(placePhotoMaxAgeDays * 24 * 60 * 60 * 1000 - 7 * 24 * 60 * 60 * 1000);
    expect(photoSweepMaxRounds).toBeGreaterThan(1);
  });

  it("dates the expiry 30 days before now", () => {
    const now = new Date("2026-10-26T15:42:00.000Z");
    expect(placePhotoExpiredBefore(now).toISOString()).toBe("2026-09-26T15:42:00.000Z");
  });
});

describe("intervalOf", () => {
  it("gives whole seconds, never negative", () => {
    expect(intervalOf(photoOrphanMinAgeMs)).toBe("600 seconds");
    expect(intervalOf(1_999)).toBe("1 seconds");
    expect(intervalOf(0)).toBe("0 seconds");
    expect(intervalOf(-5_000)).toBe("0 seconds");
  });
});

describe("inBatches", () => {
  it("splits 150 names into 100 and 50, in order", () => {
    const names = Array.from({ length: 150 }, (_, index) => `f${index}`);
    const batches = inBatches(names);
    expect(batches.map((batch) => batch.length)).toEqual([100, 50]);
    expect(batches.flat()).toEqual(names);
  });

  it("gives nothing for nothing", () => {
    expect(inBatches([])).toEqual([]);
  });
});
