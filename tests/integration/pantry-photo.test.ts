import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PantryDataError, siteGoneDetail } from "@/features/pantry/data/client";
import {
  deletePlacePhotoRowIn,
  downloadPlacePhoto,
  loadPlacePhotoIn,
  loadPlacePhotosIn,
  savePantryPhotoIn,
  setPlacePhotoPointsIn,
  type PantryPhotoRow,
} from "@/features/pantry/data/photos";
import { placePhotoBucket, placePhotoPath } from "@/features/pantry/domain/place-photo";
import { normalizeSiteName } from "@/features/pantry/domain/site";
import { ok } from "@/lib/errors";
import { stripPngMetadata } from "@/lib/images";
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
const { removePlacePhoto } = await import("@/features/pantry/actions/remove-place-photo");

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
  const paths: string[] = [];
  const { data: sites } = await bucket(adminClient()).list(userId);
  for (const site of sites ?? []) {
    for (const location of ["kyl", "frys", "skafferi"]) paths.push(...(await filesIn(`${userId}/${site.name}/${location}`)));
  }
  if (paths.length > 0) await bucket(adminClient()).remove(paths);
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

  it("leaves no file and no row for a place that is gone", async () => {
    const place = await addSite(owner.id, "Husbilen");
    await adminClient().from("pantry_site").delete().eq("id", place);
    const result = await savePlacePhoto(input({ data: stripPngMetadata(kylPng)!, mediaType: "image/png" }, { siteId: place }));
    expect(result).toEqual({ ok: false, error: { code: "pantry_site_gone", message: expect.any(String) } });
    expect(await filesIn(`${owner.id}/${place}/frys`)).toEqual([]);
    expect((await photoRows(owner.id)).some((photo) => photo.site_id === place)).toBe(false);
  });
});

// Story 10.2: what Hemma reads, what the route sends and "Ta bort fotot",
// through RLS and the bucket's policies.
describe("Visa senaste fotot (Story 10.2)", () => {
  const png = () => stripPngMetadata(kylPng)!;
  const day = 24 * 60 * 60 * 1000;
  let place: string;
  let fresh: PantryPhotoRow;
  let old: PantryPhotoRow;

  /** A photo of `place` with its file, the row added with the service role so `taken_at` can be any time. */
  async function seed(location: "Kyl" | "Frys", takenAt: Date): Promise<PantryPhotoRow> {
    const photo = row(owner.id, place, {
      location,
      takenAt,
      reading: ["Mjölk", "Smör"],
      points: [{ n: 2, x: 400, y: 600 }],
    });
    const uploaded = await bucket(owner.db).upload(photo.objectPath, png(), { contentType: "image/png", upsert: false });
    if (uploaded.error) throw uploaded.error;
    const inserted = await adminClient().from("pantry_photo").insert({
      id: photo.id,
      user_id: owner.id,
      site_id: place,
      location,
      object_path: photo.objectPath,
      media_type: "image/png",
      width: photo.width,
      height: photo.height,
      taken_at: takenAt.toISOString(),
      reading: [...photo.reading],
      points: photo.points!.map((point) => ({ ...point })),
    });
    if (inserted.error) throw inserted.error;
    return photo;
  }

  beforeAll(async () => {
    sessionDb = owner.db;
    sessionUser = { id: owner.id, email: owner.email };
    place = await addSite(owner.id, "Fjällstugan");
    fresh = await seed("Kyl", new Date(Date.now() - 29 * day));
    old = await seed("Frys", new Date(Date.now() - 31 * day));
  });

  it("gives Hemma the place's own photos younger than 30 days, and nothing to another user", async () => {
    const photos = await loadPlacePhotosIn(owner.db, place, new Date());
    expect(photos).toEqual([
      {
        id: fresh.id,
        location: "Kyl",
        takenAt: fresh.takenAt,
        width: 720,
        height: 900,
        reading: ["Mjölk", "Smör"],
        points: [{ n: 2, x: 400, y: 600 }],
      },
    ]);
    expect(await loadPlacePhotosIn(other.db, place, new Date())).toEqual([]);
    // No grant to anon (AD-4).
    await expect(loadPlacePhotosIn(anonClient(), place, new Date())).rejects.toThrow("query_failed 42501");
  });

  it("gives the route the file of the owner's photo, and nothing for an older one or another user", async () => {
    const file = await loadPlacePhotoIn(owner.db, fresh.id, new Date());
    expect(file).toEqual({ objectPath: fresh.objectPath, mediaType: "image/png" });
    const blob = await downloadPlacePhoto(owner.db, file!.objectPath);
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(png());
    expect(await loadPlacePhotoIn(owner.db, old.id, new Date())).toBeNull();
    expect(await loadPlacePhotoIn(other.db, fresh.id, new Date())).toBeNull();
    // Another user's session gets no file, also with the path in hand.
    expect(await downloadPlacePhoto(other.db, fresh.objectPath)).toBeNull();
    expect(await downloadPlacePhoto(anonClient(), fresh.objectPath)).toBeNull();
    // A file that is gone.
    expect(await downloadPlacePhoto(owner.db, `${owner.id}/${place}/kyl/${randomUUID()}.png`)).toBeNull();
  });

  it("removes the row and the file, and never another user's", async () => {
    expect(await deletePlacePhotoRowIn(other.db, fresh.id)).toBeNull();
    expect((await photoRows(owner.id)).some((photo) => photo.id === fresh.id)).toBe(true);
    expect(await removePlacePhoto({ id: fresh.id })).toEqual(ok({ removed: true }));
    expect((await photoRows(owner.id)).some((photo) => photo.id === fresh.id)).toBe(false);
    expect(await fileAt(fresh.objectPath)).toBeNull();
    // Gone already: ok, nothing more to do.
    expect(await removePlacePhoto({ id: fresh.id })).toEqual(ok({ removed: false }));
    // The older photo is left for Story 10.3's sweep.
    expect(await fileAt(old.objectPath)).not.toBeNull();
  });
});
