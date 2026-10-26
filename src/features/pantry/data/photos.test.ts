import { describe, expect, it, vi } from "vitest";
import { PantryDataError, siteGoneDetail, type PantryDb } from "./client";
import {
  deletePlacePhotoRowIn,
  downloadPlacePhoto,
  loadPlacePhotoIn,
  loadPlacePhotosIn,
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

// Story 10.2: Hemma's read of a place's photos, the route's read of one
// photo and its file, and the deletion of a row.

/** A query whose calls are recorded and which answers with `answer` however it ends. */
function fakeQuery(answer: { data: unknown; error: { code: string } | null }) {
  const calls: [string, ...unknown[]][] = [];
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq", "gte", "delete"]) {
    chain[name] = (...args: unknown[]) => {
      calls.push([name, ...args]);
      return chain;
    };
  }
  chain.maybeSingle = async () => answer;
  chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(answer).then(resolve, reject);
  const from = vi.fn(() => chain);
  return { db: { from } as unknown as PantryDb, from, calls };
}

describe("loadPlacePhotosIn", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  const stored = {
    id: photo,
    location: "Kyl",
    taken_at: "2026-10-26T11:42:00+00:00",
    width: 720,
    height: 900,
    reading: ["Mjölk", "Smör"],
    points: [{ n: 2, x: 500, y: 250 }],
  };

  it("reads the place's rows taken within 30 days, without the path, as PlacePhotos", async () => {
    const { db, from, calls } = fakeQuery({ data: [stored], error: null });
    expect(await loadPlacePhotosIn(db, site, now)).toEqual([
      {
        id: photo,
        location: "Kyl",
        takenAt: new Date("2026-10-26T11:42:00Z"),
        width: 720,
        height: 900,
        reading: ["Mjölk", "Smör"],
        points: [{ n: 2, x: 500, y: 250 }],
      },
    ]);
    expect(from).toHaveBeenCalledWith("pantry_photo");
    expect(calls).toContainEqual(["eq", "site_id", site]);
    expect(calls).toContainEqual(["gte", "taken_at", "2026-09-26T12:00:00.000Z"]);
    const select = calls.find(([name]) => name === "select")!;
    expect(String(select[1])).not.toContain("object_path");
  });

  it("leaves out a row that is not a photo's", async () => {
    const { db } = fakeQuery({ data: [stored, { ...stored, location: "Källare" }], error: null });
    expect(await loadPlacePhotosIn(db, site, now)).toHaveLength(1);
  });

  it("throws query_failed with the code", async () => {
    await expect(loadPlacePhotosIn(fakeQuery({ data: null, error: { code: "08006" } }).db, site, now)).rejects.toThrow(
      new PantryDataError("query_failed 08006"),
    );
  });
});

describe("loadPlacePhotoIn", () => {
  const now = new Date("2026-10-26T12:00:00Z");

  it("gives the file's path and type for a photo taken within 30 days", async () => {
    const { db, calls } = fakeQuery({ data: { object_path: path, media_type: "image/jpeg" }, error: null });
    expect(await loadPlacePhotoIn(db, photo, now)).toEqual({ objectPath: path, mediaType: "image/jpeg" });
    expect(calls).toContainEqual(["eq", "id", photo]);
    expect(calls).toContainEqual(["gte", "taken_at", "2026-09-26T12:00:00.000Z"]);
  });

  it("gives null without the row (gone, older, another user's), and invalid_row for a strange type", async () => {
    expect(await loadPlacePhotoIn(fakeQuery({ data: null, error: null }).db, photo, now)).toBeNull();
    await expect(
      loadPlacePhotoIn(fakeQuery({ data: { object_path: path, media_type: "image/webp" }, error: null }).db, photo, now),
    ).rejects.toThrow(new PantryDataError("invalid_row"));
  });
});

describe("downloadPlacePhoto", () => {
  function fakeDownload(answer: { data: unknown; error: unknown }) {
    const download = vi.fn(async () => answer);
    const from = vi.fn(() => ({ download }));
    return { db: { storage: { from } } as unknown as PantryDb, from, download };
  }

  it("downloads from the bucket pantry-photo", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    const { db, from, download } = fakeDownload({ data: blob, error: null });
    expect(await downloadPlacePhoto(db, path)).toBe(blob);
    expect(from).toHaveBeenCalledWith("pantry-photo");
    expect(download).toHaveBeenCalledWith(path);
  });

  it("gives null for Storage's 404, in the body or as the status", async () => {
    expect(await downloadPlacePhoto(fakeDownload({ data: null, error: { statusCode: "404", status: 400 } }).db, path)).toBeNull();
    expect(await downloadPlacePhoto(fakeDownload({ data: null, error: { status: 404 } }).db, path)).toBeNull();
  });

  it("throws only the status for another failure, never the path", async () => {
    const error = await downloadPlacePhoto(
      fakeDownload({ data: null, error: { message: `Failed for ${path}`, statusCode: "500" } }).db,
      path,
    ).catch((thrown: unknown) => thrown);
    expect(error).toEqual(new PantryDataError("download_failed 500"));
    expect((error as Error).message).not.toContain(user);
  });
});

describe("deletePlacePhotoRowIn", () => {
  it("deletes the row and gives the path of its file", async () => {
    const { db, calls } = fakeQuery({ data: [{ object_path: path }], error: null });
    expect(await deletePlacePhotoRowIn(db, photo)).toBe(path);
    expect(calls.map(([name]) => name)).toEqual(["delete", "eq", "select"]);
    expect(calls).toContainEqual(["eq", "id", photo]);
  });

  it("gives null when there was no row", async () => {
    expect(await deletePlacePhotoRowIn(fakeQuery({ data: [], error: null }).db, photo)).toBeNull();
  });

  it("throws delete_failed with the code", async () => {
    await expect(deletePlacePhotoRowIn(fakeQuery({ data: null, error: { code: "42501" } }).db, photo)).rejects.toThrow(
      new PantryDataError("delete_failed 42501"),
    );
  });
});
