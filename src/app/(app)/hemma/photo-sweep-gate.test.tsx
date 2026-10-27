import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoSweep } from "@/features/pantry/ui/photo-sweep";

// PhotoSweepGate (Story 10.3) with needsPlacePhotoSweep stubbed: PhotoSweep
// only when there are photos older than 30 days, and an error never reaches
// the page.

const needsPlacePhotoSweep = vi.fn();
vi.mock("@/features/pantry/server", () => ({ needsPlacePhotoSweep: () => needsPlacePhotoSweep() }));
vi.mock("@/features/pantry/actions/sweep-place-photos", () => ({ sweepPlacePhotos: vi.fn() }));

const { PhotoSweepGate } = await import("./photo-sweep-gate");

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  logged.mockRestore();
  needsPlacePhotoSweep.mockReset();
});

describe("PhotoSweepGate", () => {
  it("renders PhotoSweep only when there is something to sweep", async () => {
    needsPlacePhotoSweep.mockResolvedValueOnce(true);
    const shown = await PhotoSweepGate();
    expect(isValidElement(shown) && shown.type).toBe(PhotoSweep);

    needsPlacePhotoSweep.mockResolvedValueOnce(false);
    expect(await PhotoSweepGate()).toBeNull();
  });

  it("renders nothing when the check throws, and logs only the error's name", async () => {
    needsPlacePhotoSweep.mockRejectedValueOnce(new TypeError("secret/path.jpg"));
    expect(await PhotoSweepGate()).toBeNull();
    expect(logged).toHaveBeenCalledWith("pantry_photo_sweep_unavailable", { reason: "TypeError" });
  });
});
