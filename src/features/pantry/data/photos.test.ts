import { describe, expect, it, vi } from "vitest";
import { PantryDataError, siteGoneDetail, type PantryDb } from "./client";
import {
  photoRowExistsIn,
  placePhotoReadingLengthIn,
  removePlacePhotoFiles,
  savePantryPhotoIn,
  setPlacePhotoPointsIn,
  uploadPlacePhoto,
  uploadUnauthorizedDetail,
  type PantryPhotoRow,
} from "./photos";

// The photos' data layer (Story 10.1) with a client whose Storage and rpc
// answer with what the test gives: what is sent, and how each answer becomes
// a result or a PantryDataError without the path in it.
// tests/integration/pantry-photo.test.ts runs the same against Supabase.

const user = "11111111-1111-4111-8111-111111111111";
const site = "22222222-2222-4222-8222-222222222222";
const photo = "33333333-3333-4333-8333-333333333333";
const path = `${user}/${site}/kyl/${photo}.jpg`;

function fakeStorage(answer: { data: unknown; error: unknown }) {
  const upload = vi.fn(async () => answer);
  const remove = vi.fn(async () => answer);
  const from = vi.fn(() => ({ upload, remove }));
  return { db: { storage: { from } } as unknown as PantryDb, from, upload, remove };
}

const row: PantryPhotoRow = {
  id: photo,
  siteId: site,
  location: "Kyl",
  objectPath: path,
  mediaType: "image/jpeg",
  width: 1536,
  height: 2048,
  takenAt: new Date("2026-10-26T15:42:00.000Z"),
  reading: ["Mellanmjölk 1,5 %"],
  points: null,
};

describe("uploadPlacePhoto", () => {
  it("uploads to the bucket pantry-photo with the type and never over a file", async () => {
    const { db, from, upload } = fakeStorage({ data: { path }, error: null });
    const bytes = new Uint8Array([0xff, 0xd8, 0xff]);
    await uploadPlacePhoto(db, path, bytes, "image/jpeg");
    expect(from).toHaveBeenCalledWith("pantry-photo");
    expect(upload).toHaveBeenCalledWith(path, bytes, { contentType: "image/jpeg", upsert: false });
  });

  it("throws only the status, never the message with the path", async () => {
    const { db } = fakeStorage({ data: null, error: { message: `The resource ${path} already exists`, statusCode: "409" } });
    const error = await uploadPlacePhoto(db, path, new Uint8Array(1), "image/jpeg").catch((thrown: unknown) => thrown);
    expect(error).toEqual(new PantryDataError("upload_failed 409"));
    expect(String((error as Error).message)).not.toContain(user);
  });

  it.each(["401", "403"])("throws upload_unauthorized for %s (the bucket's policies)", async (statusCode) => {
    const { db } = fakeStorage({ data: null, error: { message: "new row violates row-level security policy", statusCode } });
    await expect(uploadPlacePhoto(db, path, new Uint8Array(1), "image/jpeg")).rejects.toThrow(
      new PantryDataError(uploadUnauthorizedDetail),
    );
  });

  it("turns anything the client throws into upload_threw, without its message", async () => {
    const upload = vi.fn(async () => {
      throw new Error(`fetch failed for ${path}`);
    });
    const db = { storage: { from: () => ({ upload }) } } as unknown as PantryDb;
    const error = await uploadPlacePhoto(db, path, new Uint8Array(1), "image/jpeg").catch((thrown: unknown) => thrown);
    expect(error).toEqual(new PantryDataError("upload_threw"));
    expect((error as Error).message).not.toContain(user);
  });
});

describe("removePlacePhotoFiles", () => {
  it("removes with the Storage API and counts what went", async () => {
    const { db, remove } = fakeStorage({ data: [{ name: path }], error: null });
    expect(await removePlacePhotoFiles(db, [path])).toBe(1);
    expect(remove).toHaveBeenCalledWith([path]);
  });

  it("asks nothing for no paths", async () => {
    const { db, remove } = fakeStorage({ data: [], error: null });
    expect(await removePlacePhotoFiles(db, [])).toBe(0);
    expect(remove).not.toHaveBeenCalled();
  });

  it("throws remove_failed with the status", async () => {
    const { db } = fakeStorage({ data: null, error: { message: path, status: 500 } });
    await expect(removePlacePhotoFiles(db, [path])).rejects.toThrow(new PantryDataError("remove_failed 500"));
  });
});

describe("savePantryPhotoIn", () => {
  function fakeRpc(answer: { data: unknown; error: { code: string } | null }) {
    const rpc = vi.fn(async () => answer);
    return { db: { rpc } as unknown as PantryDb, rpc };
  }

  it("calls save_pantry_photo with the row, and gives the path it replaced", async () => {
    const before = `${user}/${site}/kyl/44444444-4444-4444-8444-444444444444.png`;
    const { db, rpc } = fakeRpc({ data: [{ outcome: "saved", previous_path: before }], error: null });
    expect(await savePantryPhotoIn(db, { ...row, points: [{ n: 1, x: 10, y: 20 }] })).toEqual({ kind: "saved", previous: before });
    expect(rpc).toHaveBeenCalledWith("save_pantry_photo", {
      site,
      place: "Kyl",
      photo_id: photo,
      photo_path: path,
      photo_type: "image/jpeg",
      photo_width: 1536,
      photo_height: 2048,
      photo_taken_at: "2026-10-26T15:42:00.000Z",
      photo_reading: ["Mellanmjölk 1,5 %"],
      photo_points: [{ n: 1, x: 10, y: 20 }],
    });
  });

  it("gives no path for the first photo of the place, and sends no points when there are none", async () => {
    const { db, rpc } = fakeRpc({ data: [{ outcome: "saved", previous_path: null }], error: null });
    expect(await savePantryPhotoIn(db, row)).toEqual({ kind: "saved", previous: null });
    expect(rpc.mock.calls[0]).not.toHaveProperty("1.photo_points");
  });

  it("gives stale when a photo taken later is there", async () => {
    expect(await savePantryPhotoIn(fakeRpc({ data: [{ outcome: "stale", previous_path: null }], error: null }).db, row)).toEqual({
      kind: "stale",
    });
  });

  it.each([
    ["no rows", []],
    ["an unknown outcome", [{ outcome: "maybe", previous_path: null }]],
    ["no data", null],
  ])("throws invalid_answer for %s", async (_name, data) => {
    await expect(savePantryPhotoIn(fakeRpc({ data, error: null }).db, row)).rejects.toThrow(new PantryDataError("invalid_answer"));
  });

  it("throws site_gone for MK410 and save_failed with the code otherwise", async () => {
    await expect(savePantryPhotoIn(fakeRpc({ data: null, error: { code: "MK410" } }).db, row)).rejects.toThrow(
      new PantryDataError(siteGoneDetail),
    );
    await expect(savePantryPhotoIn(fakeRpc({ data: null, error: { code: "23514" } }).db, row)).rejects.toThrow(
      new PantryDataError("save_failed 23514"),
    );
  });
});

describe("photoRowExistsIn", () => {
  function fakeSelect(answer: { data: unknown; error: { code: string } | null }) {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => answer };
    return { from: vi.fn(() => chain) } as unknown as PantryDb;
  }

  it("says whether the photo's row is there", async () => {
    expect(await photoRowExistsIn(fakeSelect({ data: { id: photo }, error: null }), photo)).toBe(true);
    expect(await photoRowExistsIn(fakeSelect({ data: null, error: null }), photo)).toBe(false);
  });

  it("throws query_failed with the code", async () => {
    await expect(photoRowExistsIn(fakeSelect({ data: null, error: { code: "08006" } }), photo)).rejects.toThrow(
      new PantryDataError("query_failed 08006"),
    );
  });
});

describe("placePhotoReadingLengthIn", () => {
  function fakeSelect(answer: { data: unknown; error: { code: string } | null }) {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => answer };
    return { from: vi.fn(() => chain) } as unknown as PantryDb;
  }

  it("gives the reading's length, or null without the photo", async () => {
    expect(await placePhotoReadingLengthIn(fakeSelect({ data: { reading: ["a", "b"] }, error: null }), photo)).toBe(2);
    expect(await placePhotoReadingLengthIn(fakeSelect({ data: null, error: null }), photo)).toBeNull();
  });

  it("throws invalid_row for a reading that is not a list", async () => {
    await expect(placePhotoReadingLengthIn(fakeSelect({ data: { reading: {} }, error: null }), photo)).rejects.toThrow(
      new PantryDataError("invalid_row"),
    );
  });
});

describe("setPlacePhotoPointsIn", () => {
  function fakeRpc(answer: { data: unknown; error: { code: string } | null }) {
    const rpc = vi.fn(async () => answer);
    return { db: { rpc } as unknown as PantryDb, rpc };
  }

  it("calls set_pantry_photo_points with the points, and says whether it wrote", async () => {
    const { db, rpc } = fakeRpc({ data: true, error: null });
    expect(await setPlacePhotoPointsIn(db, photo, [{ n: 2, x: 5, y: 6 }])).toBe(true);
    expect(rpc).toHaveBeenCalledWith("set_pantry_photo_points", { photo_id: photo, photo_points: [{ n: 2, x: 5, y: 6 }] });
    expect(await setPlacePhotoPointsIn(fakeRpc({ data: false, error: null }).db, photo, [{ n: 2, x: 5, y: 6 }])).toBe(false);
  });

  it("throws update_failed with the code", async () => {
    await expect(setPlacePhotoPointsIn(fakeRpc({ data: null, error: { code: "42501" } }).db, photo, [])).rejects.toThrow(
      new PantryDataError("update_failed 42501"),
    );
  });
});
