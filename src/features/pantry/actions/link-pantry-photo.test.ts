import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { PantryDataError } from "../data/client";

// linkPantryItemsToPhoto: the user check, the session client, the data
// functions and revalidation stubbed.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const linkPantryItemsToPhotoIn = vi.fn();
const placePhotoReadingLengthIn = vi.fn();
vi.mock("../data/photos", () => ({
  linkPantryItemsToPhotoIn: (...args: unknown[]) => linkPantryItemsToPhotoIn(...args),
  placePhotoReadingLengthIn: (...args: unknown[]) => placePhotoReadingLengthIn(...args),
}));

const { linkPantryItemsToPhoto } = await import("./link-pantry-photo");

const photoId = "33333333-3333-4333-8333-333333333333";
const row = "44444444-4444-4444-8444-444444444444";
const items = [{ id: row, number: 2 }];

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  linkPantryItemsToPhotoIn.mockReset().mockResolvedValue(1);
  placePhotoReadingLengthIn.mockReset().mockResolvedValue(3);
  revalidateFor.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("linkPantryItemsToPhoto", () => {
  it("links the rows and has Matvaror read again", async () => {
    expect(await linkPantryItemsToPhoto({ photoId, items })).toEqual(ok({ linked: 1 }));
    expect(linkPantryItemsToPhotoIn).toHaveBeenCalledWith(db, photoId, items);
    expect(revalidateFor).toHaveBeenCalledWith("pantry_item");
  });

  it("links nothing for a photo that is gone", async () => {
    placePhotoReadingLengthIn.mockResolvedValue(null);
    expect(await linkPantryItemsToPhoto({ photoId, items })).toEqual(ok({ linked: 0 }));
    expect(linkPantryItemsToPhotoIn).not.toHaveBeenCalled();
  });

  it("does not revalidate when nothing was linked", async () => {
    linkPantryItemsToPhotoIn.mockResolvedValue(0);
    expect(await linkPantryItemsToPhoto({ photoId, items })).toEqual(ok({ linked: 0 }));
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("refuses a number beyond the photo's reading", async () => {
    placePhotoReadingLengthIn.mockResolvedValue(1);
    expect(await linkPantryItemsToPhoto({ photoId, items })).toEqual(fail("validation"));
    expect(linkPantryItemsToPhotoIn).not.toHaveBeenCalled();
  });

  it.each([
    ["a photo id that is not a uuid", { photoId: "photo", items }],
    ["no items", { photoId, items: [] }],
    ["number 0", { photoId, items: [{ id: row, number: 0 }] }],
    ["a row id that is not a uuid", { photoId, items: [{ id: "row", number: 1 }] }],
  ])("refuses %s", async (_name, input) => {
    expect(await linkPantryItemsToPhoto(input)).toEqual(fail("validation"));
    expect(linkPantryItemsToPhotoIn).not.toHaveBeenCalled();
  });

  it("needs a signed-in user", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await linkPantryItemsToPhoto({ photoId, items })).toEqual(fail("unauthorized"));
    expect(linkPantryItemsToPhotoIn).not.toHaveBeenCalled();
  });

  it("answers pantry_photo_failed when the database refuses", async () => {
    linkPantryItemsToPhotoIn.mockRejectedValue(new PantryDataError("update_failed 42501"));
    expect(await linkPantryItemsToPhoto({ photoId, items })).toEqual(fail("pantry_photo_failed"));
  });
});
