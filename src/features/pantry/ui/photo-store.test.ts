import { beforeEach, describe, expect, it, vi } from "vitest";
import { keepPhoto, keptPhoto, photoKeepMs, releaseAllPhotos, releasePhoto, type KeptPhoto } from "./photo-store";

// The photos of the AI jobs of photos (Story 12.5, AD-15): memory only, per
// job, until the result is closed or 30 minutes have passed.

const photo = (label: string): KeptPhoto => ({
  image: new Blob([label]),
  location: "Kyl",
  site: { id: "55555555-5555-4555-8555-555555555555", name: "Hemma" },
  size: null,
  takenAt: new Date("2026-10-28T12:00:00Z"),
});

beforeEach(() => releaseAllPhotos());

describe("photo-store", () => {
  it("keeps a photo per job and gives it back", () => {
    const a = photo("a");
    keepPhoto("job-a", a, 0);
    keepPhoto("job-b", photo("b"), 0);
    expect(keptPhoto("job-a", 1)).toBe(a);
    expect(keptPhoto("job-c", 1)).toBeNull();
  });

  it("lets a photo go when its result is closed", () => {
    keepPhoto("job-a", photo("a"), 0);
    releasePhoto("job-a");
    expect(keptPhoto("job-a", 1)).toBeNull();
  });

  it("lets a photo go by its own timer when nobody reads the store", () => {
    vi.useFakeTimers();
    try {
      keepPhoto("job-a", photo("a"), Date.now());
      vi.advanceTimersByTime(photoKeepMs);
      expect(vi.getTimerCount()).toBe(0);
      expect(keptPhoto("job-a", 0)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the timer when a photo is released", () => {
    vi.useFakeTimers();
    try {
      keepPhoto("job-a", photo("a"), Date.now());
      releasePhoto("job-a");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets a photo go after 30 minutes, and not before", () => {
    keepPhoto("job-a", photo("a"), 0);
    expect(keptPhoto("job-a", photoKeepMs - 1)).not.toBeNull();
    expect(keptPhoto("job-a", photoKeepMs)).toBeNull();
    expect(photoKeepMs).toBe(30 * 60_000);
  });
});
