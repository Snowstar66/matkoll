import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { PantryDataError } from "../data/client";

// savePlacePhotoPoints (Story 10.1) with the user check, the session client,
// the data function and revalidation stubbed.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const setPlacePhotoPointsIn = vi.fn();
const placePhotoReadingLengthIn = vi.fn();
vi.mock("../data/photos", () => ({
  setPlacePhotoPointsIn: (...args: unknown[]) => setPlacePhotoPointsIn(...args),
  placePhotoReadingLengthIn: (...args: unknown[]) => placePhotoReadingLengthIn(...args),
}));

const { savePlacePhotoPoints } = await import("./save-place-photo-points");

const id = "33333333-3333-4333-8333-333333333333";
const points = { positions: [{ n: 1, x: 120, y: 400 }, { n: 3, x: 500, y: 20 }] };

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  setPlacePhotoPointsIn.mockReset().mockResolvedValue(true);
  placePhotoReadingLengthIn.mockReset().mockResolvedValue(3);
  revalidateFor.mockReset();
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("savePlacePhotoPoints", () => {
  it("adds the points to the photo and revalidates Hemma", async () => {
    expect(await savePlacePhotoPoints({ id, points })).toEqual(ok({ saved: true }));
    expect(setPlacePhotoPointsIn).toHaveBeenCalledWith(db, id, points.positions);
    expect(revalidateFor).toHaveBeenCalledWith("pantry_photo");
  });

  it("says when the photo had points already, or is gone, without revalidating", async () => {
    setPlacePhotoPointsIn.mockResolvedValue(false);
    expect(await savePlacePhotoPoints({ id, points })).toEqual(ok({ saved: false }));
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("refuses a point for an item beyond the photo's reading", async () => {
    placePhotoReadingLengthIn.mockResolvedValue(2);
    expect(await savePlacePhotoPoints({ id, points })).toEqual(fail("validation"));
    expect(setPlacePhotoPointsIn).not.toHaveBeenCalled();
  });

  it("writes nothing for a photo that is gone or another user's", async () => {
    placePhotoReadingLengthIn.mockResolvedValue(null);
    expect(await savePlacePhotoPoints({ id, points })).toEqual(ok({ saved: false }));
    expect(setPlacePhotoPointsIn).not.toHaveBeenCalled();
  });

  it("writes nothing for no points", async () => {
    expect(await savePlacePhotoPoints({ id, points: { positions: [] } })).toEqual(ok({ saved: false }));
    expect(setPlacePhotoPointsIn).not.toHaveBeenCalled();
  });

  it.each([
    ["an id that is not a uuid", { id: "photo", points }],
    ["a point outside 0–1000", { id, points: { positions: [{ n: 1, x: 1001, y: 0 }] } }],
    ["two points for one item", { id, points: { positions: [{ n: 1, x: 1, y: 0 }, { n: 1, x: 2, y: 0 }] } }],
    ["no points field", { id } as never],
  ])("refuses %s", async (_name, input) => {
    expect(await savePlacePhotoPoints(input)).toEqual(fail("validation"));
    expect(setPlacePhotoPointsIn).not.toHaveBeenCalled();
  });

  it("gives unauthorized without a user", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await savePlacePhotoPoints({ id, points })).toEqual(fail("unauthorized"));
    expect(setPlacePhotoPointsIn).not.toHaveBeenCalled();
  });

  it("gives pantry_photo_failed when the database fails, logging only the reason", async () => {
    setPlacePhotoPointsIn.mockRejectedValue(new PantryDataError("update_failed 08006"));
    expect(await savePlacePhotoPoints({ id, points })).toEqual(fail("pantry_photo_failed"));
    expect(log).toHaveBeenCalledWith("pantry_photo_failed", { reason: "update_failed 08006" });
  });
});
