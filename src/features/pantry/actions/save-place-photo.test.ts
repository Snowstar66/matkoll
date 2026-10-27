import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorMessages, fail, ok } from "@/lib/errors";
import { stripJpegMetadata, stripPngMetadata } from "@/lib/images";
import {
  jpegMarkers,
  jpegWithMetadata,
  madeUpPosition,
  pngChunkTypes,
  pngWithMetadata,
  webpVp8xHeader,
} from "../../../../tests/support/image-headers";
import { PantryDataError, siteGoneDetail } from "../data/client";

// savePlacePhoto (Story 10.1, AD-26) with the user check, the session client,
// the data functions and revalidation stubbed: the metadata is gone before
// the upload, the order of upload, row and removals, what is cleaned up when
// a step fails, and that nothing but codes and reasons is logged. The AI
// port is a spy that must never be called.

const userId = "11111111-1111-4111-8111-111111111111";
const site = "22222222-2222-4222-8222-222222222222";
const previousPath = `${userId}/${site}/kyl/44444444-4444-4444-8444-444444444444.jpg`;

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const getAiService = vi.fn();
vi.mock("@/server/ai", () => ({ getAiService: () => getAiService() }));

const steps: string[] = [];
const uploadPlacePhoto = vi.fn();
const savePantryPhotoIn = vi.fn();
const removePlacePhotoFiles = vi.fn();
const photoRowExistsIn = vi.fn();
vi.mock("../data/photos", () => ({
  uploadUnauthorizedDetail: "upload_unauthorized",
  uploadPlacePhoto: (...args: unknown[]) => (steps.push("upload"), uploadPlacePhoto(...args)),
  savePantryPhotoIn: (...args: unknown[]) => (steps.push("save"), savePantryPhotoIn(...args)),
  removePlacePhotoFiles: (...args: unknown[]) => (steps.push("remove"), removePlacePhotoFiles(...args)),
  photoRowExistsIn: (...args: unknown[]) => (steps.push("exists"), photoRowExistsIn(...args)),
}));

const sweepPlacePhotosIn = vi.fn();
vi.mock("./photo-sweep", () => ({
  sweepPlacePhotosIn: (...args: unknown[]) => (steps.push("sweep"), sweepPlacePhotosIn(...args)),
}));

const { savePlacePhoto } = await import("./save-place-photo");

const kylPng = new Uint8Array(readFileSync(new URL("../../../../tests/fixtures/ai/kyl.png", import.meta.url)));
const now = new Date("2026-10-26T16:00:00.000Z");

const input = (image: { data: Uint8Array; mediaType: "image/jpeg" | "image/png" | "image/webp" }) => ({
  image,
  siteId: site,
  location: "Kyl" as const,
  takenAt: new Date("2026-10-26T15:42:00.000Z"),
  reading: ["Mellanmjölk 1,5 %", "Smör 500 g"],
  points: null,
});

const jpeg = { data: jpegWithMetadata(1536, 2048), mediaType: "image/jpeg" as const };

/** The bytes and path uploaded, as the data layer got them. */
const uploaded = () => uploadPlacePhoto.mock.calls[0] as [unknown, string, Uint8Array, string];

let errors: ReturnType<typeof vi.spyOn>;
let infos: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  steps.length = 0;
  requireUser.mockReset().mockResolvedValue(ok({ id: userId, email: "pontus@example.com" }));
  uploadPlacePhoto.mockReset().mockResolvedValue(undefined);
  savePantryPhotoIn.mockReset().mockResolvedValue({ kind: "saved", previous: null });
  photoRowExistsIn.mockReset().mockResolvedValue(false);
  removePlacePhotoFiles.mockReset().mockResolvedValue(1);
  sweepPlacePhotosIn.mockReset().mockResolvedValue({ removed: 0, failed: null });
  revalidateFor.mockReset();
  getAiService.mockReset();
  errors?.mockRestore();
  infos?.mockRestore();
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  infos = vi.spyOn(console, "info").mockImplementation(() => {});
});

/** Everything logged, as one string, to show what is never in it. */
const logged = () => JSON.stringify([...errors.mock.calls, ...infos.mock.calls]);

describe("savePlacePhoto", () => {
  it("uploads the JPEG without EXIF, GPS, XMP, ICC or comment to a new path of its own, saves the row and revalidates Hemma", async () => {
    const result = await savePlacePhoto(input(jpeg), { now });
    expect(result.ok).toBe(true);
    const { id } = (result as { data: { id: string } }).data;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    const [client, path, bytes, mediaType] = uploaded();
    expect(client).toBe(db);
    expect(path).toBe(`${userId}/${site}/kyl/${id}.jpg`);
    expect(mediaType).toBe("image/jpeg");
    // No APP1–APP15 and no COM; the image's own segments are byte for byte the same.
    expect(jpegMarkers(bytes)).toEqual([0xe0, 0xdb, 0xc0, 0xda]);
    expect(Buffer.from(bytes).equals(Buffer.from(jpegWithMetadata(1536, 2048, { metadata: false })))).toBe(true);
    expect(Buffer.from(bytes).includes(madeUpPosition)).toBe(false);
    expect(Buffer.from(bytes).includes("Exif")).toBe(false);

    expect(savePantryPhotoIn).toHaveBeenCalledWith(db, {
      id,
      siteId: site,
      location: "Kyl",
      objectPath: path,
      mediaType: "image/jpeg",
      width: 1536,
      height: 2048,
      takenAt: new Date("2026-10-26T15:42:00.000Z"),
      reading: ["Mellanmjölk 1,5 %", "Smör 500 g"],
      points: null,
    });
    expect(steps).toEqual(["upload", "save", "sweep"]);
    expect(sweepPlacePhotosIn).toHaveBeenCalledWith(db, { now });
    expect(revalidateFor).toHaveBeenCalledWith("pantry_photo");
  });

  it("uploads a PNG with only the chunks that make the image", async () => {
    const result = await savePlacePhoto(input({ data: pngWithMetadata(kylPng), mediaType: "image/png" }), { now });
    expect(result.ok).toBe(true);
    const [, path, bytes, mediaType] = uploaded();
    expect(path).toMatch(/\.png$/);
    expect(mediaType).toBe("image/png");
    // The image's chunks are the same as in the PNG without the added metadata.
    expect(Buffer.from(bytes).equals(Buffer.from(stripPngMetadata(kylPng)!))).toBe(true);
    for (const type of pngChunkTypes(bytes)) {
      expect(["IHDR", "PLTE", "tRNS", "IDAT", "IEND", "gAMA", "cHRM", "sRGB"]).toContain(type);
    }
    expect(Buffer.from(bytes).includes(madeUpPosition)).toBe(false);
  });

  it("gives every photo a new path, never the one before", async () => {
    await savePlacePhoto(input(jpeg), { now });
    await savePlacePhoto(input(jpeg), { now });
    const paths = uploadPlacePhoto.mock.calls.map((call) => call[1]);
    expect(new Set(paths).size).toBe(2);
  });

  it("removes the file it replaced after the row is saved", async () => {
    savePantryPhotoIn.mockResolvedValue({ kind: "saved", previous: previousPath });
    expect((await savePlacePhoto(input(jpeg), { now })).ok).toBe(true);
    expect(steps).toEqual(["upload", "save", "remove", "sweep"]);
    expect(removePlacePhotoFiles).toHaveBeenCalledWith(db, [previousPath]);
  });

  it("sweeps after a save, and only logs the reason when the sweep fails (Story 10.3)", async () => {
    sweepPlacePhotosIn.mockResolvedValue({ removed: 1, failed: "remove_failed 503" });
    expect((await savePlacePhoto(input(jpeg), { now })).ok).toBe(true);
    expect(errors).toHaveBeenCalledWith("pantry_photo_remove_failed", { reason: "remove_failed 503" });
    sweepPlacePhotosIn.mockRejectedValue(new TypeError(`no ${userId}`));
    expect((await savePlacePhoto(input(jpeg), { now })).ok).toBe(true);
    expect(errors).toHaveBeenCalledWith("pantry_photo_remove_failed", { reason: "sweep_threw" });
    expect(logged()).not.toContain(userId);
    expect(revalidateFor).toHaveBeenCalledTimes(2);
  });

  it("logs only the reason when the file before cannot be removed, and still saves", async () => {
    savePantryPhotoIn.mockResolvedValue({ kind: "saved", previous: previousPath });
    removePlacePhotoFiles.mockRejectedValue(new PantryDataError("remove_failed 500"));
    expect((await savePlacePhoto(input(jpeg), { now })).ok).toBe(true);
    expect(errors).toHaveBeenCalledWith("pantry_photo_remove_failed", { reason: "remove_failed 500" });
    expect(logged()).not.toContain(userId);
  });

  it("sends the points that have come, and none for an empty list", async () => {
    await savePlacePhoto({ ...input(jpeg), points: [{ n: 1, x: 10, y: 20 }] }, { now });
    expect(savePantryPhotoIn.mock.calls[0][1].points).toEqual([{ n: 1, x: 10, y: 20 }]);
    await savePlacePhoto({ ...input(jpeg), points: [] }, { now });
    expect(savePantryPhotoIn.mock.calls[1][1].points).toBeNull();
  });

  it("keeps the server's time for a time an hour ahead", async () => {
    await savePlacePhoto({ ...input(jpeg), takenAt: new Date("2026-10-26T17:00:00.000Z") }, { now });
    expect(savePantryPhotoIn.mock.calls[0][1].takenAt).toEqual(now);
  });

  it.each([
    ["a WebP (the route refuses it first)", { data: webpVp8xHeader(1200, 900), mediaType: "image/webp" as const }],
    ["a JPEG whose segments cannot be walked", { data: new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2]), mediaType: "image/jpeg" as const }],
    ["a PNG cut off before IEND", { data: kylPng.subarray(0, 200), mediaType: "image/png" as const }],
  ])("gives pantry_photo_failed for %s without uploading anything", async (_name, image) => {
    expect(await savePlacePhoto(input(image), { now })).toEqual(fail("pantry_photo_failed"));
    expect(uploadPlacePhoto).not.toHaveBeenCalled();
    expect(savePantryPhotoIn).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalledWith("pantry_photo_failed", expect.objectContaining({ reason: expect.any(String) }));
  });

  it("gives pantry_photo_failed when Storage cannot be reached, and saves no row", async () => {
    uploadPlacePhoto.mockRejectedValue(new PantryDataError("upload_failed 503"));
    expect(await savePlacePhoto(input(jpeg), { now })).toEqual(fail("pantry_photo_failed"));
    expect(savePantryPhotoIn).not.toHaveBeenCalled();
    expect(revalidateFor).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalledWith("pantry_photo_failed", { reason: "upload_failed 503" });
  });

  it("removes the new file and gives pantry_site_gone when the place is gone, without looking for the row", async () => {
    savePantryPhotoIn.mockRejectedValue(new PantryDataError(siteGoneDetail));
    expect(await savePlacePhoto(input(jpeg), { now })).toEqual(fail("pantry_site_gone"));
    const [, path] = uploaded();
    expect(removePlacePhotoFiles).toHaveBeenCalledWith(db, [path]);
    expect(steps).toEqual(["upload", "save", "remove"]);
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("removes the new file and gives pantry_photo_failed when the row cannot be saved and is not there", async () => {
    savePantryPhotoIn.mockRejectedValue(new PantryDataError("save_failed 23514"));
    removePlacePhotoFiles.mockRejectedValue(new PantryDataError("remove_failed 500"));
    expect(await savePlacePhoto(input(jpeg), { now })).toEqual(fail("pantry_photo_failed"));
    expect(steps).toEqual(["upload", "save", "exists", "remove"]);
    expect(photoRowExistsIn.mock.calls[0][1]).toBe(uploaded()[1].split("/").at(-1)!.replace(".jpg", ""));
    expect(errors).toHaveBeenCalledWith("pantry_photo_remove_failed", { reason: "remove_failed 500" });
    expect(errors).toHaveBeenCalledWith("pantry_photo_failed", { reason: "save_failed 23514" });
  });

  it("keeps the new file when the save answered with an error after it committed (the row is there)", async () => {
    savePantryPhotoIn.mockRejectedValue(new PantryDataError("save_threw"));
    photoRowExistsIn.mockResolvedValue(true);
    const result = await savePlacePhoto(input(jpeg), { now });
    expect(result.ok).toBe(true);
    expect(steps).toEqual(["upload", "save", "exists"]);
    expect(errors).toHaveBeenCalledWith("pantry_photo_unconfirmed", { reason: "save_threw" });
    expect(revalidateFor).toHaveBeenCalledWith("pantry_photo");
  });

  it("keeps the new file when it cannot tell whether the row is there, so a row never points at no file", async () => {
    savePantryPhotoIn.mockRejectedValue(new PantryDataError("save_threw"));
    photoRowExistsIn.mockRejectedValue(new PantryDataError("query_failed 08006"));
    expect((await savePlacePhoto(input(jpeg), { now })).ok).toBe(true);
    expect(removePlacePhotoFiles).not.toHaveBeenCalled();
  });

  it("removes the new file when the save throws something that is not a PantryDataError and the row is not there", async () => {
    savePantryPhotoIn.mockRejectedValue(new TypeError("a bug"));
    photoRowExistsIn.mockResolvedValue(false);
    expect(await savePlacePhoto(input(jpeg), { now })).toEqual(fail("pantry_photo_failed"));
    expect(removePlacePhotoFiles).toHaveBeenCalledWith(db, [uploaded()[1]]);
  });

  it("writes nothing more for an older photo than the one kept (stale): its file goes, and the answer is ok", async () => {
    savePantryPhotoIn.mockResolvedValue({ kind: "stale" });
    const result = await savePlacePhoto(input(jpeg), { now });
    expect(result.ok).toBe(true);
    expect(steps).toEqual(["upload", "save", "remove"]);
    expect(removePlacePhotoFiles).toHaveBeenCalledWith(db, [uploaded()[1]]);
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("gives unauthorized when Storage refuses the upload as not the user's", async () => {
    uploadPlacePhoto.mockRejectedValue(new PantryDataError("upload_unauthorized"));
    expect(await savePlacePhoto(input(jpeg), { now })).toEqual(fail("unauthorized"));
    expect(savePantryPhotoIn).not.toHaveBeenCalled();
  });

  it("gives unauthorized without a user, and touches nothing", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await savePlacePhoto(input(jpeg), { now })).toEqual(fail("unauthorized"));
    expect(steps).toEqual([]);
  });

  it("never logs the photo, the path, the place or the reading, and never asks the AI", async () => {
    savePantryPhotoIn.mockResolvedValue({ kind: "saved", previous: previousPath });
    removePlacePhotoFiles.mockRejectedValue(new PantryDataError("remove_failed 500"));
    await savePlacePhoto(input(jpeg), { now });
    savePantryPhotoIn.mockRejectedValue(new PantryDataError(siteGoneDetail));
    await savePlacePhoto(input(jpeg), { now });
    for (const secret of [userId, site, "Mellanmjölk", "kyl/", madeUpPosition]) expect(logged()).not.toContain(secret);
    expect(getAiService).not.toHaveBeenCalled();
  });

  it("has the texts of Epic 10's error codes", () => {
    expect(errorMessages.pantry_photo_failed).toBe("Det gick inte att spara fotot.");
    expect(errorMessages.pantry_photo_gone).toBe("Fotot finns inte längre.");
    expect(errorMessages.pantry_photo_remove_failed).toBe("Det gick inte att ta bort fotot. Försök igen.");
  });

  it("strips the same as stripJpegMetadata", async () => {
    await savePlacePhoto(input(jpeg), { now });
    expect(Buffer.from(uploaded()[2]).equals(Buffer.from(stripJpegMetadata(jpeg.data)!))).toBe(true);
  });
});
