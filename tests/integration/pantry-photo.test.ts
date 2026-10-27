import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PantryDataError, siteGoneDetail } from "@/features/pantry/data/client";
import {
  deleteExpiredPlacePhotoRowsIn,
  loadExpiredPlacePhotosIn,
  loadPlacePhotoOrphansIn,
  savePantryPhotoIn,
  setPlacePhotoPointsIn,
  type PantryPhotoRow,
} from "@/features/pantry/data/photos";
import { placePhotoBucket, placePhotoPath } from "@/features/pantry/domain/place-photo";
import { normalizeSiteName } from "@/features/pantry/domain/site";
import { ok } from "@/lib/errors";
import { stripPngMetadata } from "@/lib/images";
import { removeUserPlacePhotos } from "../../scripts/pantry-photo-files.mjs";
import { pruneExtraUsers, removeDeletedUsersFiles } from "../../scripts/users-sync-plan.mjs";
import { localSupabaseUrl } from "../local-supabase";
import {
  jpegMarkers,
  jpegWithMetadata,
  madeUpPosition,
  pngChunkTypes,
  pngWithMetadata,
  progressiveJpeg,
  videoTrailer,
  withTrailer,
} from "../support/image-headers";
import { adminClient, anonClient, createTestUser, deleteTestUsers, expectRlsIsolation, type Db, type TestUser } from "./support";

// The latest photo of each place against local Supabase with Storage (Story
// 10.1, AD-4, AD-20, AD-26, NFR-11): the bucket's policies and pantry_photo's
// RLS for an anonymous client and another user, save_pantry_photo (one row
// per place and location, the path it replaced, MK410), the cascade from a
// deleted place, and savePlacePhoto end to end: the stored file has no
// metadata, a new photo replaces the row and the file, and a place that is
// gone leaves nothing. Only drawn test images, never a photo of a home.
//
// The sweep (Story 10.3): pantry_photo_orphans gives only the caller's own
// files without a row; sweepPlacePhotosIn removes photos older than 30 days
// (row and file) and files without a row, and leaves younger photos, files
// younger than 10 minutes and other users' files; deletePantrySite removes
// the place's files, also one without a row; users:sync --prune
// (pruneExtraUsers) removes a user's files, in every folder and on every
// page of the listing, before the user, and users:sync removes the files of a
// user deleted elsewhere (removeDeletedUsersFiles). After review: a photo's
// row is deleted only when its file is gone and it is still the row read
// (delete_expired_pantry_photos), 120 files without a row go as 100 and 20,
// a file with its row is never an orphan however old, and a photo just saved
// is never swept.

// savePlacePhoto with the session client replaced by the test user's, as in a request.
let sessionDb: Db | undefined;
let sessionUser: { id: string; email: string } | undefined;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    if (!sessionDb) throw new Error("No session client");
    return sessionDb;
  },
}));
vi.mock("@/features/auth/server", () => ({
  requireUser: async () => (sessionUser ? ok(sessionUser) : { ok: false, error: { code: "unauthorized", message: "" } }),
}));
vi.mock("@/lib/revalidate", () => ({ revalidateFor: vi.fn() }));
const { savePlacePhoto } = await import("@/features/pantry/actions/save-place-photo");
const { sweepPlacePhotosIn } = await import("@/features/pantry/actions/photo-sweep");
const { deletePantrySite } = await import("@/features/pantry/actions/delete-pantry-site");

const kylPng = new Uint8Array(readFileSync(new URL("../fixtures/ai/kyl.png", import.meta.url)));

let owner: TestUser;
let other: TestUser;
let hemma: string;
let stugan: string;
let othersSite: string;

/** A place for `userId`, added with the service role. */
async function addSite(userId: string, name: string, selected = false): Promise<string> {
  const { data, error } = await adminClient()
    .from("pantry_site")
    .insert({ user_id: userId, name, normalized_name: normalizeSiteName(name), is_selected: selected })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

const bucket = (db: Db) => db.storage.from(placePhotoBucket);

/** Every file under `folder`, one level down, read with the service role. */
async function filesIn(folder: string): Promise<string[]> {
  const { data, error } = await bucket(adminClient()).list(folder);
  if (error) throw error;
  return data.filter((entry) => entry.id !== null).map((entry) => `${folder}/${entry.name}`);
}

/** The file's bytes, read with the service role, or `null` when it is not there. */
async function fileAt(path: string): Promise<Uint8Array | null> {
  const { data, error } = await bucket(adminClient()).download(path);
  if (error) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/** The owner's photo rows, read with the service role. */
async function photoRows(userId: string) {
  const { data, error } = await adminClient()
    .from("pantry_photo")
    .select("id, site_id, location, object_path, media_type, width, height, reading, points")
    .eq("user_id", userId);
  if (error) throw error;
  return data;
}

/** Removes every file the test users left in the bucket (no foreign key takes them, AD-26). */
async function removeUserFiles(userId: string) {
  await removeUserPlacePhotos(adminClient().storage, userId);
}

function row(userId: string, siteId: string, overrides: Partial<PantryPhotoRow> = {}): PantryPhotoRow {
  const id = overrides.id ?? randomUUID();
  const location = overrides.location ?? "Kyl";
  return {
    id,
    siteId,
    location,
    objectPath: placePhotoPath(userId, siteId, location, id, "image/png"),
    mediaType: "image/png",
    width: 720,
    height: 900,
    takenAt: new Date(),
    reading: ["Mellanmjölk 1,5 %"],
    points: null,
    ...overrides,
  };
}

beforeAll(async () => {
  localSupabaseUrl();
  owner = await createTestUser("photo-owner");
  other = await createTestUser("photo-other");
  hemma = await addSite(owner.id, "Hemma", true);
  stugan = await addSite(owner.id, "Stugan");
  othersSite = await addSite(other.id, "Hemma", true);
});

afterAll(async () => {
  for (const user of [owner, other]) if (user) await removeUserFiles(user.id);
  await deleteTestUsers();
});

describe("pantry_photo", () => {
  it("is isolated per user (AD-4)", async () => {
    await expectRlsIsolation("pantry_photo", async (db) => {
      const { data: auth } = await db.auth.getUser();
      const userId = auth.user!.id;
      const site = await db.from("pantry_site").insert({ name: "Hemma", normalized_name: "hemma", is_selected: true }).select("id").single();
      if (site.error) throw site.error;
      const id = randomUUID();
      return {
        id,
        site_id: site.data.id,
        location: "Kyl",
        object_path: placePhotoPath(userId, site.data.id, "Kyl", id, "image/jpeg"),
        media_type: "image/jpeg",
        width: 10,
        height: 10,
        taken_at: new Date().toISOString(),
        reading: [],
      };
    });
  });

  it("refuses a path that is not the row's own, and a reading over 25", async () => {
    const id = randomUUID();
    const base = {
      id,
      site_id: hemma,
      location: "Kyl",
      media_type: "image/png",
      width: 10,
      height: 10,
      taken_at: new Date().toISOString(),
      reading: [],
    };
    for (const objectPath of [
      placePhotoPath(other.id, hemma, "Kyl", id, "image/png"),
      placePhotoPath(owner.id, stugan, "Kyl", id, "image/png"),
      placePhotoPath(owner.id, hemma, "Frys", id, "image/png"),
      placePhotoPath(owner.id, hemma, "Kyl", randomUUID(), "image/png"),
      placePhotoPath(owner.id, hemma, "Kyl", id, "image/jpeg"),
    ]) {
      const insert = await owner.db.from("pantry_photo").insert({ ...base, object_path: objectPath });
      expect(insert.error?.code, objectPath.replace(owner.id, "owner")).toBe("23514");
    }
    const long = await owner.db.from("pantry_photo").insert({
      ...base,
      object_path: placePhotoPath(owner.id, hemma, "Kyl", id, "image/png"),
      reading: Array.from({ length: 26 }, (_, index) => `Vara ${index}`),
    });
    expect(long.error?.code).toBe("23514");
    expect(await photoRows(owner.id)).toEqual([]);
  });

  it("refuses save_pantry_photo to anon", async () => {
    const { error } = await anonClient().rpc("save_pantry_photo", {
      site: hemma,
      place: "Kyl",
      photo_id: randomUUID(),
      photo_path: "x",
      photo_type: "image/png",
      photo_width: 1,
      photo_height: 1,
      photo_taken_at: new Date().toISOString(),
      photo_reading: [],
    });
    expect(error?.code).toBe("42501");
  });
});

describe("the bucket pantry-photo (AD-26)", () => {
  const png = stripPngMetadata(kylPng)!;
  let path: string;

  beforeAll(async () => {
    path = placePhotoPath(owner.id, hemma, "Skafferi", randomUUID(), "image/png");
    const { error } = await bucket(owner.db).upload(path, png, { contentType: "image/png", upsert: false });
    if (error) throw error;
  });

  it("is private, with the domain's size limit and types", async () => {
    const { data, error } = await adminClient().storage.getBucket(placePhotoBucket);
    if (error) throw error;
    expect(data).toMatchObject({ public: false, file_size_limit: 1572864, allowed_mime_types: ["image/jpeg", "image/png"] });
  });

  it("lets the owner read and list their own file", async () => {
    const { data, error } = await bucket(owner.db).download(path);
    expect(error).toBeNull();
    expect(new Uint8Array(await data!.arrayBuffer())).toEqual(png);
    const listed = await bucket(owner.db).list(`${owner.id}/${hemma}/skafferi`);
    expect(listed.data?.map((entry) => entry.name)).toEqual([path.split("/").pop()]);
  });

  it("never overwrites a file, not even the owner's own (no update policy)", async () => {
    const { error } = await bucket(owner.db).upload(path, new Uint8Array([1, 2, 3]), { contentType: "image/png", upsert: true });
    expect(error).not.toBeNull();
    expect(await fileAt(path)).toEqual(png);
  });

  it("refuses another user and an anonymous client: no upload, read, list or removal", async () => {
    const intruders: [string, Db][] = [
      ["anon", anonClient()],
      ["another user", other.db],
    ];
    for (const [who, db] of intruders) {
      const upload = await bucket(db).upload(placePhotoPath(owner.id, hemma, "Kyl", randomUUID(), "image/png"), png, {
        contentType: "image/png",
      });
      expect(upload.error, `${who} uploads in the owner's folder`).not.toBeNull();

      const read = await bucket(db).download(path);
      expect(read.error, `${who} reads`).not.toBeNull();

      const listed = await bucket(db).list(`${owner.id}/${hemma}/skafferi`);
      expect(listed.data ?? [], `${who} lists`).toEqual([]);

      const removed = await bucket(db).remove([path]);
      expect(removed.data ?? [], `${who} removes`).toEqual([]);

      const signed = await bucket(db).createSignedUrl(path, 60);
      expect(signed.error, `${who} signs a URL`).not.toBeNull();
    }
    // The file is still there, untouched, and nothing was added in the owner's folder.
    expect(await fileAt(path)).toEqual(png);
    expect(await filesIn(`${owner.id}/${hemma}/kyl`)).toEqual([]);
  });

  it("takes the owner's upload only at a photo's path", async () => {
    for (const bad of [
      `${owner.id}/photo.png`,
      `${owner.id}/${hemma}/kyl/photo.png`,
      `${owner.id}/${hemma}/kallare/${randomUUID()}.png`,
      `${owner.id}/${hemma}/kyl/${randomUUID()}.gif`,
      `${owner.id}/${hemma}/kyl/x/${randomUUID()}.png`,
    ]) {
      const { error } = await bucket(owner.db).upload(bad, png, { contentType: "image/png" });
      expect(error, bad.replace(owner.id, "owner")).not.toBeNull();
    }
    const { data } = await bucket(adminClient()).list(owner.id);
    expect((data ?? []).map((entry) => entry.name)).toEqual([hemma]);
  });

  it("has no public URL", async () => {
    const response = await fetch(`${localSupabaseUrl()}/storage/v1/object/public/${placePhotoBucket}/${path}`);
    expect(response.ok).toBe(false);
    await response.body?.cancel();
  });

  it("lets another user upload only in their own folder", async () => {
    const own = placePhotoPath(other.id, othersSite, "Kyl", randomUUID(), "image/png");
    const { error } = await bucket(other.db).upload(own, png, { contentType: "image/png" });
    expect(error).toBeNull();
    await bucket(other.db).remove([own]);
  });
});

describe("save_pantry_photo", () => {
  it("keeps one photo per place and location, gives the path it replaced, and leaves the others", async () => {
    const first = row(owner.id, stugan);
    expect(await savePantryPhotoIn(owner.db, first)).toEqual({ kind: "saved", previous: null });
    const second = row(owner.id, stugan, { points: [{ n: 1, x: 10, y: 20 }] });
    expect(await savePantryPhotoIn(owner.db, second)).toEqual({ kind: "saved", previous: first.objectPath });

    const freezer = row(owner.id, stugan, { location: "Frys" });
    const home = row(owner.id, hemma);
    expect(await savePantryPhotoIn(owner.db, freezer)).toEqual({ kind: "saved", previous: null });
    expect(await savePantryPhotoIn(owner.db, home)).toEqual({ kind: "saved", previous: null });

    const rows = await photoRows(owner.id);
    expect(rows.map((photo) => [photo.site_id, photo.location, photo.id]).sort()).toEqual(
      [
        [stugan, "Kyl", second.id],
        [stugan, "Frys", freezer.id],
        [hemma, "Kyl", home.id],
      ].sort(),
    );
    expect(rows.find((photo) => photo.id === second.id)?.points).toEqual([{ n: 1, x: 10, y: 20 }]);
  });

  it("never lets an older photo replace a newer one (stale), and writes nothing for it", async () => {
    const place = await addSite(owner.id, "Jakten");
    const newer = row(owner.id, place, { takenAt: new Date(Date.now() - 60_000) });
    const older = row(owner.id, place, { takenAt: new Date(Date.now() - 3_600_000) });
    expect(await savePantryPhotoIn(owner.db, newer)).toEqual({ kind: "saved", previous: null });
    expect(await savePantryPhotoIn(owner.db, older)).toEqual({ kind: "stale" });
    expect((await photoRows(owner.id)).filter((photo) => photo.site_id === place).map((photo) => photo.id)).toEqual([newer.id]);
    // A photo taken at the same time, or later, replaces it.
    const same = row(owner.id, place, { takenAt: newer.takenAt });
    expect(await savePantryPhotoIn(owner.db, same)).toEqual({ kind: "saved", previous: newer.objectPath });
  });

  it("refuses a reading or points that do not pass the checks (23514)", async () => {
    const place = await addSite(owner.id, "Förrådet");
    for (const overrides of [
      { reading: ["ok", 5] as unknown as string[] },
      { reading: [""] },
      { reading: ["x".repeat(201)] },
      { points: [{ n: 2, x: 10, y: 10 }] },
      { points: [{ n: 1, x: 1001, y: 10 }] },
      { points: [{ n: 1.5, x: 10, y: 10 }] },
      { points: [{ n: 1, x: 10, y: 10 }, { n: 1, x: 20, y: 20 }] },
    ]) {
      await expect(savePantryPhotoIn(owner.db, row(owner.id, place, overrides)), JSON.stringify(overrides)).rejects.toThrow(
        new PantryDataError("save_failed 23514"),
      );
    }
    expect((await photoRows(owner.id)).some((photo) => photo.site_id === place)).toBe(false);
  });

  it("gives MK410 (site_gone) for another user's place, and writes nothing", async () => {
    const before = await photoRows(owner.id);
    await expect(savePantryPhotoIn(owner.db, row(owner.id, othersSite))).rejects.toThrow(new PantryDataError(siteGoneDetail));
    expect(await photoRows(owner.id)).toEqual(before);
    expect(await photoRows(other.id)).toEqual([]);
  });

  it("goes with its place (on delete cascade); the file is left for Story 10.3", async () => {
    const place = await addSite(owner.id, "Båten");
    await savePantryPhotoIn(owner.db, row(owner.id, place));
    expect((await photoRows(owner.id)).some((photo) => photo.site_id === place)).toBe(true);
    const { error } = await owner.db.rpc("delete_pantry_site", { site_id: place });
    if (error) throw error;
    expect((await photoRows(owner.id)).some((photo) => photo.site_id === place)).toBe(false);
  });
});

describe("set_pantry_photo_points (setPlacePhotoPointsIn)", () => {
  it("adds the points once, keeps them after, and never for another user or beyond the reading", async () => {
    const place = await addSite(owner.id, "Verkstaden");
    const photo = row(owner.id, place, { reading: ["Mjölk", "Smör"] });
    await savePantryPhotoIn(owner.db, photo);
    const stored = async () => (await photoRows(owner.id)).find((saved) => saved.id === photo.id)?.points;

    expect(await setPlacePhotoPointsIn(other.db, photo.id, [{ n: 1, x: 1, y: 1 }])).toBe(false);
    expect(await setPlacePhotoPointsIn(owner.db, photo.id, [{ n: 3, x: 1, y: 1 }])).toBe(false);
    expect(await stored()).toBeNull();

    expect(await setPlacePhotoPointsIn(owner.db, photo.id, [{ n: 1, x: 10, y: 20 }, { n: 2, x: 30, y: 40 }])).toBe(true);
    expect(await stored()).toEqual([{ n: 1, x: 10, y: 20 }, { n: 2, x: 30, y: 40 }]);
    expect(await setPlacePhotoPointsIn(owner.db, photo.id, [{ n: 1, x: 999, y: 999 }])).toBe(false);
    expect(await stored()).toEqual([{ n: 1, x: 10, y: 20 }, { n: 2, x: 30, y: 40 }]);
  });

  it("is refused to anon", async () => {
    const { error } = await anonClient().rpc("set_pantry_photo_points", { photo_id: randomUUID(), photo_points: [] });
    expect(error?.code).toBe("42501");
  });
});

describe("savePlacePhoto", () => {
  beforeAll(() => {
    sessionDb = owner.db;
    sessionUser = { id: owner.id, email: owner.email };
  });

  const input = (image: { data: Uint8Array; mediaType: "image/jpeg" | "image/png" }, overrides = {}) => ({
    image,
    siteId: hemma,
    location: "Frys" as const,
    takenAt: new Date(),
    reading: ["Ärtor 500 g"],
    points: null,
    ...overrides,
  });

  it("stores a JPEG with EXIF and GPS without any metadata, and its frame and scan as they were", async () => {
    const result = await savePlacePhoto(input({ data: jpegWithMetadata(1536, 2048), mediaType: "image/jpeg" }));
    expect(result.ok).toBe(true);
    const id = (result as { data: { id: string } }).data.id;
    const stored = await fileAt(placePhotoPath(owner.id, hemma, "Frys", id, "image/jpeg"));
    expect(stored).not.toBeNull();
    expect(jpegMarkers(stored!)).toEqual([0xe0, 0xdb, 0xc0, 0xda]);
    expect(Buffer.from(stored!).includes(madeUpPosition)).toBe(false);
    expect(Buffer.from(stored!).includes("Exif")).toBe(false);
    expect(stored).toEqual(jpegWithMetadata(1536, 2048, { metadata: false }));
    const saved = (await photoRows(owner.id)).find((photo) => photo.id === id);
    expect(saved).toMatchObject({ media_type: "image/jpeg", width: 1536, height: 2048, reading: ["Ärtor 500 g"], points: null });
  });

  it("stores a progressive JPEG without what lay between its scans, and a JPEG without its trailer", async () => {
    for (const [image, clean] of [
      [progressiveJpeg(), progressiveJpeg({ metadata: false })],
      [withTrailer(jpegWithMetadata(64, 48)), jpegWithMetadata(64, 48, { metadata: false })],
    ] as const) {
      const result = await savePlacePhoto(input({ data: image, mediaType: "image/jpeg" }, { location: "Skafferi" }));
      expect(result.ok).toBe(true);
      const id = (result as { data: { id: string } }).data.id;
      const stored = await fileAt(placePhotoPath(owner.id, hemma, "Skafferi", id, "image/jpeg"));
      expect(stored).toEqual(clean);
      expect(Buffer.from(stored!).includes(madeUpPosition)).toBe(false);
      expect(Buffer.from(stored!).includes(Buffer.from(videoTrailer.subarray(4, 12)))).toBe(false);
    }
    expect(await filesIn(`${owner.id}/${hemma}/skafferi`)).toHaveLength(2);
  });

  it("replaces the row and the file with a new photo: a PNG with only the image's chunks", async () => {
    const [before] = (await photoRows(owner.id)).filter((photo) => photo.site_id === hemma && photo.location === "Frys");
    const result = await savePlacePhoto(
      input({ data: withTrailer(pngWithMetadata(kylPng)), mediaType: "image/png" }, { points: [{ n: 1, x: 500, y: 500 }] }),
    );
    expect(result.ok).toBe(true);
    const id = (result as { data: { id: string } }).data.id;
    const rows = (await photoRows(owner.id)).filter((photo) => photo.site_id === hemma && photo.location === "Frys");
    expect(rows.map((photo) => photo.id)).toEqual([id]);
    expect(rows[0].points).toEqual([{ n: 1, x: 500, y: 500 }]);
    expect(await fileAt(before.object_path)).toBeNull();
    expect(await filesIn(`${owner.id}/${hemma}/frys`)).toEqual([rows[0].object_path]);
    const stored = await fileAt(rows[0].object_path);
    for (const type of pngChunkTypes(stored!)) expect(["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]).toContain(type);
    expect(pngChunkTypes(stored!).at(-1)).toBe("IEND");
    expect(stored).toEqual(stripPngMetadata(kylPng));
    expect(Buffer.from(stored!).includes(madeUpPosition)).toBe(false);
  });

  it("keeps the newer photo when an older one comes after it, and removes the older one's file", async () => {
    const place = await addSite(owner.id, "Bastun");
    const png = { data: stripPngMetadata(kylPng)!, mediaType: "image/png" as const };
    const newer = await savePlacePhoto(input(png, { siteId: place, location: "Kyl", takenAt: new Date(Date.now() - 60_000) }));
    const older = await savePlacePhoto(input(png, { siteId: place, location: "Kyl", takenAt: new Date(Date.now() - 3_600_000) }));
    expect(newer.ok && older.ok).toBe(true);
    const rows = (await photoRows(owner.id)).filter((photo) => photo.site_id === place && photo.location === "Kyl");
    expect(rows.map((photo) => photo.id)).toEqual([(newer as { data: { id: string } }).data.id]);
    expect(await filesIn(`${owner.id}/${place}/kyl`)).toEqual([rows[0].object_path]);
  });

  it("keeps one row and its file when two photos of a place are saved at once", async () => {
    const png = { data: stripPngMetadata(kylPng)!, mediaType: "image/png" as const };
    const results = await Promise.all([savePlacePhoto(input(png)), savePlacePhoto(input(png))]);
    expect(results.every((result) => result.ok)).toBe(true);
    const rows = (await photoRows(owner.id)).filter((photo) => photo.site_id === hemma && photo.location === "Frys");
    expect(rows).toHaveLength(1);
    expect(await filesIn(`${owner.id}/${hemma}/frys`)).toEqual([rows[0].object_path]);
  });

  it("never sweeps the photo just saved, also when the client says it was taken 31 days ago (Story 10.3)", async () => {
    const place = await addSite(owner.id, "Lekstugan");
    const png = { data: stripPngMetadata(kylPng)!, mediaType: "image/png" as const };
    const result = await savePlacePhoto(
      input(png, { siteId: place, location: "Kyl", takenAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) }),
    );
    expect(result.ok).toBe(true);
    const id = (result as { data: { id: string } }).data.id;
    const rows = (await photoRows(owner.id)).filter((photo) => photo.site_id === place);
    expect(rows.map((photo) => photo.id)).toEqual([id]);
    expect(await fileAt(rows[0].object_path)).not.toBeNull();
  });

  it("leaves no file and no row for a place that is gone", async () => {
    const place = await addSite(owner.id, "Husbilen");
    await adminClient().from("pantry_site").delete().eq("id", place);
    const result = await savePlacePhoto(input({ data: stripPngMetadata(kylPng)!, mediaType: "image/png" }, { siteId: place }));
    expect(result).toEqual({ ok: false, error: { code: "pantry_site_gone", message: expect.any(String) } });
    expect(await filesIn(`${owner.id}/${place}/frys`)).toEqual([]);
    expect((await photoRows(owner.id)).some((photo) => photo.site_id === place)).toBe(false);
  });
});

describe("the sweep (Story 10.3)", () => {
  const png = () => stripPngMetadata(kylPng)!;
  const day = 24 * 60 * 60 * 1000;

  /** A photo of `user` on `site`, its row saved with save_pantry_photo and its file uploaded as the user. */
  async function photoOf(user: TestUser, site: string, overrides: Partial<PantryPhotoRow> = {}): Promise<PantryPhotoRow> {
    const photo = row(user.id, site, overrides);
    const uploaded = await bucket(user.db).upload(photo.objectPath, png(), { contentType: "image/png", upsert: false });
    if (uploaded.error) throw uploaded.error;
    const saved = await savePantryPhotoIn(user.db, photo);
    expect(saved.kind).toBe("saved");
    return photo;
  }

  /** A file of `user` without a row, uploaded as the user. */
  async function orphanOf(user: TestUser, site: string): Promise<string> {
    const path = placePhotoPath(user.id, site, "Skafferi", randomUUID(), "image/png");
    const uploaded = await bucket(user.db).upload(path, png(), { contentType: "image/png", upsert: false });
    if (uploaded.error) throw uploaded.error;
    return path;
  }

  it("pantry_photo_orphans gives only the caller's own files without a row, older than the age asked for", async () => {
    const place = await addSite(owner.id, "Vedboden");
    const kept = await photoOf(owner, place);
    const mine = await orphanOf(owner, place);
    const theirs = await orphanOf(other, othersSite);

    const all = await loadPlacePhotoOrphansIn(owner.db, 0);
    expect(all).toContain(mine);
    expect(all).not.toContain(kept.objectPath);
    expect(all).not.toContain(theirs);
    expect(all.every((name) => name.startsWith(`${owner.id}/`))).toBe(true);
    // Uploaded just now: not older than 10 minutes, so a save in progress keeps its file.
    expect(await loadPlacePhotoOrphansIn(owner.db, 600_000)).not.toContain(mine);
    expect(await loadPlacePhotoOrphansIn(other.db, 0)).toContain(theirs);

    // The service role has no auth.uid(), and anon may not call it.
    const admin = await adminClient().rpc("pantry_photo_orphans", { min_age: "0 seconds" });
    expect(admin.error).toBeNull();
    expect(admin.data).toEqual([]);
    const anon = await anonClient().rpc("pantry_photo_orphans", { min_age: "0 seconds" });
    expect(anon.error?.code).toBe("42501");
    // A negative age gives nothing, never the files of a save in progress.
    const negative = await owner.db.rpc("pantry_photo_orphans", { min_age: "-1 hours" });
    expect(negative.data).toEqual([]);
  });

  it("removes photos older than 30 days with their files, and files without a row, and nothing of another user's", async () => {
    const place = await addSite(owner.id, "Jaktstugan");
    const now = new Date();
    const old = await photoOf(owner, place, { location: "Kyl", takenAt: new Date(now.getTime() - 31 * day) });
    const young = await photoOf(owner, place, { location: "Frys", takenAt: new Date(now.getTime() - 29 * day) });
    const orphan = await orphanOf(owner, place);
    const othersPlace = await addSite(other.id, "Sommarhuset");
    const othersOld = await photoOf(other, othersPlace, { takenAt: new Date(now.getTime() - 31 * day) });
    const othersOrphan = await orphanOf(other, othersPlace);

    // Uploaded just now: with the sweep's 10 minutes the file without a row stays.
    const first = await sweepPlacePhotosIn(owner.db, { now });
    expect(first.failed).toBeNull();
    expect(await fileAt(orphan)).not.toBeNull();
    expect(await fileAt(old.objectPath)).toBeNull();
    expect((await photoRows(owner.id)).map((photo) => photo.id)).not.toContain(old.id);

    // Treated as older than 10 minutes, it goes too.
    const second = await sweepPlacePhotosIn(owner.db, { now, orphanMinAgeMs: 0 });
    expect(second.failed).toBeNull();
    expect(second.removed).toBeGreaterThanOrEqual(1);
    expect(await fileAt(orphan)).toBeNull();

    // The photo of 29 days stays, row and file.
    expect((await photoRows(owner.id)).map((photo) => photo.id)).toContain(young.id);
    expect(await fileAt(young.objectPath)).not.toBeNull();
    // Another user's old photo and file without a row are untouched.
    expect((await photoRows(other.id)).map((photo) => photo.id)).toContain(othersOld.id);
    expect(await fileAt(othersOld.objectPath)).not.toBeNull();
    expect(await fileAt(othersOrphan)).not.toBeNull();

    // Idempotent: nothing more to do.
    expect(await sweepPlacePhotosIn(owner.db, { now, orphanMinAgeMs: 0 })).toEqual({ removed: 0, more: false, failed: null });
  });

  it("deletePantrySite removes the place's files, and a place in use keeps its photos", async () => {
    sessionDb = owner.db;
    sessionUser = { id: owner.id, email: owner.email };
    const place = await addSite(owner.id, "Stugan vid sjön");
    const kyl = await photoOf(owner, place, { location: "Kyl" });
    const frys = await photoOf(owner, place, { location: "Frys" });
    // A file without a row in the place's folder (a replaced photo's that could not be removed) goes too.
    const orphan = await orphanOf(owner, place);

    expect(await deletePantrySite({ id: place })).toEqual({ ok: true, data: { removed: true } });
    expect((await photoRows(owner.id)).some((photo) => photo.site_id === place)).toBe(false);
    expect(await fileAt(orphan)).toBeNull();
    expect(await fileAt(kyl.objectPath)).toBeNull();
    expect(await fileAt(frys.objectPath)).toBeNull();

    // The selected place cannot be deleted (Story 8.2): its photo stays.
    const selected = await photoOf(owner, hemma, { location: "Skafferi" });
    expect(await deletePantrySite({ id: hemma })).toEqual({ ok: false, error: { code: "pantry_site_in_use", message: expect.any(String) } });
    expect(await fileAt(selected.objectPath)).not.toBeNull();
  });

  it("users:sync --prune removes a user's files in every folder and on every page, then the user", async () => {
    const leaving = await createTestUser("photo-leaving");
    const places = [await addSite(leaving.id, "Hemma", true), await addSite(leaving.id, "Stugan")];
    const photos = [
      await photoOf(leaving, places[0], { location: "Kyl" }),
      await photoOf(leaving, places[0], { location: "Frys" }),
      await photoOf(leaving, places[1], { location: "Skafferi" }),
    ];
    // More files in one folder than list() gives in one call (100), as a sweep would leave them.
    const folder = `${leaving.id}/${places[1]}/kyl`;
    const extra = Array.from({ length: 105 }, () => `${folder}/${randomUUID()}.png`);
    for (let start = 0; start < extra.length; start += 15) {
      await Promise.all(
        extra.slice(start, start + 15).map(async (path) => {
          const uploaded = await bucket(adminClient()).upload(path, png(), { contentType: "image/png" });
          if (uploaded.error) throw uploaded.error;
        }),
      );
    }

    const result = await pruneExtraUsers({ remove: [{ id: leaving.id }] }, adminClient() as never);
    expect(result).toEqual({ ok: true, lines: [{ level: "info", text: `deleted  ${leaving.id} and 108 photo file(s)` }] });
    for (const photo of photos) expect(await fileAt(photo.objectPath)).toBeNull();
    expect(await filesIn(folder)).toEqual([]);
    expect(await photoRows(leaving.id)).toEqual([]);
    const gone = await adminClient().auth.admin.getUserById(leaving.id);
    expect(gone.data.user).toBeNull();
    // The other users' files are where they were.
    expect((await loadPlacePhotoOrphansIn(other.db, 0)).length).toBeGreaterThan(0);
  });

  it("users:sync removes the files of a user deleted elsewhere, and nobody else's", async () => {
    const leaving = await createTestUser("photo-dashboard");
    const place = await addSite(leaving.id, "Hemma", true);
    const photo = await photoOf(leaving, place, { location: "Kyl" });
    const orphan = await orphanOf(leaving, place);
    // Deleted as in the Supabase dashboard: the rows go with the user, the files stay.
    const deleted = await adminClient().auth.admin.deleteUser(leaving.id);
    if (deleted.error) throw deleted.error;
    expect(await fileAt(photo.objectPath)).not.toBeNull();

    const result = await removeDeletedUsersFiles(adminClient() as never);
    expect(result.ok).toBe(true);
    expect(result.lines).toContainEqual({ level: "info", text: `removed  2 photo file(s) of the deleted user ${leaving.id}` });
    expect(await fileAt(photo.objectPath)).toBeNull();
    expect(await fileAt(orphan)).toBeNull();
    expect(JSON.stringify(result.lines)).not.toContain(owner.id);
    expect((await loadPlacePhotoOrphansIn(other.db, 0)).length).toBeGreaterThan(0);
  });

  it("pantry_photo_orphans never gives a file that has its row, however old; and gives an old one without", async () => {
    const place = await addSite(owner.id, "Garaget");
    const kept = await photoOf(owner, place, { location: "Frys" });
    const orphan = await orphanOf(owner, place);
    backdate(kept.objectPath);
    backdate(orphan);
    const old = await loadPlacePhotoOrphansIn(owner.db, 600_000);
    expect(old).toContain(orphan);
    expect(old).not.toContain(kept.objectPath);
    expect(await loadPlacePhotoOrphansIn(owner.db, 0)).not.toContain(kept.objectPath);
  });

  it("gives 120 files without a row as 100, then 20: the sweep says more, and takes the rest on its next call", async () => {
    const many = await createTestUser("photo-many");
    try {
      const place = await addSite(many.id, "Hemma", true);
      const paths = Array.from({ length: 120 }, () => placePhotoPath(many.id, place, "Kyl", randomUUID(), "image/png"));
      for (let start = 0; start < paths.length; start += 15) {
        await Promise.all(
          paths.slice(start, start + 15).map(async (path) => {
            const uploaded = await bucket(many.db).upload(path, png(), { contentType: "image/png", upsert: false });
            if (uploaded.error) throw uploaded.error;
          }),
        );
      }
      expect(await loadPlacePhotoOrphansIn(many.db, 0)).toHaveLength(100);
      expect(await sweepPlacePhotosIn(many.db, { orphanMinAgeMs: 0 })).toEqual({ removed: 100, more: true, failed: null });
      expect(await loadPlacePhotoOrphansIn(many.db, 0)).toHaveLength(20);
      expect(await sweepPlacePhotosIn(many.db, { orphanMinAgeMs: 0 })).toEqual({ removed: 20, more: false, failed: null });
      expect(await loadPlacePhotoOrphansIn(many.db, 0)).toEqual([]);
    } finally {
      await removeUserFiles(many.id);
    }
  });

  it("deletes an old photo's row only when its file is gone, and never a row replaced since it was read", async () => {
    // A user of its own: the owner has its ten places already.
    const mine = await createTestUser("photo-rows");
    const place = await addSite(mine.id, "Friggeboden", true);
    const now = new Date();
    const before = new Date(now.getTime() - 30 * day);

    // The file is still there: the row stays, so it never points at a missing file.
    const old = await photoOf(mine, place, { location: "Kyl", takenAt: new Date(now.getTime() - 31 * day) });
    expect(await deleteExpiredPlacePhotoRowsIn(mine.db, [old.id], before)).toEqual([]);
    await bucket(mine.db).remove([old.objectPath]);
    expect(await deleteExpiredPlacePhotoRowsIn(mine.db, [old.id], before)).toEqual([old.id]);

    // Read as old, then replaced by a new photo of the place before the delete: the new row stays.
    const read = await photoOf(mine, place, { location: "Frys", takenAt: new Date(now.getTime() - 31 * day) });
    expect((await loadExpiredPlacePhotosIn(mine.db, before)).map((photo) => photo.id)).toContain(read.id);
    const replacement = await photoOf(mine, place, { location: "Frys" });
    await bucket(mine.db).remove([read.objectPath]);
    expect(await deleteExpiredPlacePhotoRowsIn(mine.db, [read.id, replacement.id], before)).toEqual([]);
    expect((await photoRows(mine.id)).map((photo) => photo.id)).toContain(replacement.id);

    // The same row, taken later since it was read (the cutoff is part of the delete): it stays.
    const moved = await photoOf(mine, place, { location: "Skafferi", takenAt: new Date(now.getTime() - 31 * day) });
    const updated = await adminClient().from("pantry_photo").update({ taken_at: now.toISOString() }).eq("id", moved.id);
    if (updated.error) throw updated.error;
    await bucket(mine.db).remove([moved.objectPath]);
    expect(await deleteExpiredPlacePhotoRowsIn(mine.db, [moved.id], before)).toEqual([]);
    await removeUserFiles(mine.id);

    // Another user's row is never deleted, and the service role deletes nothing.
    const othersPlace = await addSite(other.id, "Bryggan");
    const theirs = await photoOf(other, othersPlace, { takenAt: new Date(now.getTime() - 31 * day) });
    await bucket(other.db).remove([theirs.objectPath]);
    expect(await deleteExpiredPlacePhotoRowsIn(mine.db, [theirs.id], before)).toEqual([]);
    const admin = await adminClient().rpc("delete_expired_pantry_photos", { photo_ids: [theirs.id], taken_before: before.toISOString() });
    expect(admin.data).toEqual([]);
    expect((await photoRows(other.id)).map((photo) => photo.id)).toContain(theirs.id);
    const anon = await anonClient().rpc("delete_expired_pantry_photos", { photo_ids: [theirs.id], taken_before: before.toISOString() });
    expect(anon.error?.code).toBe("42501");
  });
});

/**
 * Sets the upload time of the file at `path` back a day, as the superuser
 * through the Supabase CLI (storage.objects is not in the Data API).
 */
function backdate(path: string): void {
  if (!/^[0-9a-f-]+\/[0-9a-f-]+\/(kyl|frys|skafferi)\/[0-9a-f-]+\.(png|jpg)$/.test(path)) throw new Error("not a photo's path");
  execFileSync(
    "node_modules/.bin/supabase",
    [
      "db",
      "query",
      "--local",
      `update storage.objects set created_at = now() - interval '1 day' where bucket_id = 'pantry-photo' and name = '${path}'`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
}
