import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorMessages, fail, ok } from "@/lib/errors";
import { PantryDataError } from "../data/client";

// removePlacePhoto (Story 10.2, FR-39) with the user check, the session
// client, the data functions and revalidation stubbed: the row first, then
// the file, and what Pontus is told for each outcome.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const order: string[] = [];
const deletePlacePhotoRowIn = vi.fn();
const removePlacePhotoFiles = vi.fn();
vi.mock("../data/photos", () => ({
  deletePlacePhotoRowIn: (...args: unknown[]) => {
    order.push("row");
    return deletePlacePhotoRowIn(...args);
  },
  removePlacePhotoFiles: (...args: unknown[]) => {
    order.push("file");
    return removePlacePhotoFiles(...args);
  },
}));

const { removePlacePhoto } = await import("./remove-place-photo");

const id = "33333333-3333-4333-8333-333333333333";
const path = `11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/kyl/${id}.jpg`;

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  order.length = 0;
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  deletePlacePhotoRowIn.mockReset().mockResolvedValue(path);
  removePlacePhotoFiles.mockReset().mockImplementation(async (_db: unknown, paths: string[]) => ({ removed: paths, failed: null }));
  revalidateFor.mockReset();
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("removePlacePhoto", () => {
  it("deletes the row, then the file with the Storage API, and revalidates Lagersaldo", async () => {
    expect(await removePlacePhoto({ id })).toEqual(ok({ removed: true }));
    expect(order).toEqual(["row", "file"]);
    expect(deletePlacePhotoRowIn).toHaveBeenCalledWith(db, id);
    expect(removePlacePhotoFiles).toHaveBeenCalledWith(db, [path]);
    expect(revalidateFor).toHaveBeenCalledWith("pantry_photo");
  });

  it("is ok for a photo that is gone already, with nothing to remove", async () => {
    deletePlacePhotoRowIn.mockResolvedValue(null);
    expect(await removePlacePhoto({ id })).toEqual(ok({ removed: false }));
    expect(removePlacePhotoFiles).not.toHaveBeenCalled();
    expect(revalidateFor).toHaveBeenCalledWith("pantry_photo");
  });

  it("returns unauthorized without a user, and validation for an id that is not a uuid, without deleting", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await removePlacePhoto({ id })).toEqual(fail("unauthorized"));
    requireUser.mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
    expect(await removePlacePhoto({ id: "abc" })).toEqual(fail("validation"));
    expect(deletePlacePhotoRowIn).not.toHaveBeenCalled();
  });

  it("keeps the photo and says so when the row cannot be deleted, logging the reason only", async () => {
    deletePlacePhotoRowIn.mockRejectedValue(new PantryDataError("delete_failed 08006"));
    const result = await removePlacePhoto({ id });
    expect(result).toEqual(fail("pantry_photo_remove_failed"));
    expect(!result.ok && result.error.message).toBe(errorMessages.pantry_photo_remove_failed);
    expect(errorMessages.pantry_photo_remove_failed).toBe("Det gick inte att ta bort fotot. Försök igen.");
    expect(removePlacePhotoFiles).not.toHaveBeenCalled();
    expect(revalidateFor).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("pantry_photo_remove_failed", { reason: "delete_failed 08006" });
  });

  it("leaves a file it cannot remove to the sweep: the photo is gone for Pontus, and the path is never logged", async () => {
    removePlacePhotoFiles.mockResolvedValue({ removed: [], failed: "remove_failed 503" });
    expect(await removePlacePhoto({ id })).toEqual(ok({ removed: true }));
    expect(log).toHaveBeenCalledWith("pantry_photo_remove_failed", { reason: "remove_failed 503", left: "file" });
    expect(JSON.stringify(log.mock.calls)).not.toContain(id);
  });

  it("lets a bug through", async () => {
    deletePlacePhotoRowIn.mockRejectedValue(new Error("bug"));
    await expect(removePlacePhoto({ id })).rejects.toThrow("bug");
  });
});
