import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { placePhotoBucket, placePhotoHouseholdCap, placePhotoMediaTypes, placePhotoPath } from "@/features/pantry/domain/place-photo";
import { thingPhotoBucket, thingPhotoHouseholdCap, thingPhotoMediaTypes, thingPhotoPath } from "@/features/things/domain/thing-photo";
import { maxImageBytes } from "@/lib/images";
import { adminClient, anonClient, createTestUser, deleteTestUsers, householdOf, localSql, moveToHousehold, type TestUser } from "./support";

// The photo caps (security review S-10, 20261111100000_photo_caps.sql): a
// household keeps at most placePhotoHouseholdCap files in pantry-photo and
// thingPhotoHouseholdCap in thing-photo, counted over its members' folders.
// An upload past the cap is refused by the bucket's insert policy, straight
// through the Storage API with a member's session (the way an attacker with
// the publishable key would go), whichever member uploads; another household
// is not touched; removing a file frees a place; uploads at the same time
// never pass the cap; and a household over the cap keeps its files. Each
// bucket also takes at most maxImageBytes and JPEG or PNG only.
//
// Most of the files are rows put straight into storage.objects with SQL (the
// cap counts rows), so the test does not upload hundreds of photos; the last
// ones, and every refusal, go through the Storage API.

const buckets = [
  { bucket: placePhotoBucket, cap: placePhotoHouseholdCap, types: placePhotoMediaTypes },
  { bucket: thingPhotoBucket, cap: thingPhotoHouseholdCap, types: thingPhotoMediaTypes },
] as const;

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);

let a: TestUser;
let a2: TestUser;
let b: TestUser;

/** A new photo's path in `bucket`, in `userId`'s folder, under a place of its own. */
function pathOf(bucket: string, userId: string): string {
  return bucket === placePhotoBucket
    ? placePhotoPath(userId, randomUUID(), "Kyl", randomUUID(), "image/jpeg")
    : thingPhotoPath(userId, randomUUID(), randomUUID(), "image/jpeg");
}

/**
 * Puts `count` rows (files without bytes) in `userId`'s folder of `bucket`, as
 * the superuser and without an owner, so photo_cap_guard lets them in past the cap.
 */
function addRows(bucket: string, userId: string, count: number): void {
  if (count <= 0) return;
  const name =
    bucket === placePhotoBucket
      ? `'${userId}/' || gen_random_uuid() || '/kyl/' || gen_random_uuid() || '.jpg'`
      : `'${userId}/' || gen_random_uuid() || '/' || gen_random_uuid() || '.jpg'`;
  localSql(`
    insert into storage.objects (bucket_id, name, metadata)
    select '${bucket}', ${name}, '{"size": 10, "mimetype": "image/jpeg"}'::jsonb
    from generate_series(1, ${count}) returning id`);
}

/** The files in the folders of `users` in `bucket`. */
function filesOf(bucket: string, users: readonly TestUser[]): string[] {
  const folders = users.map((user) => `'${user.id}'`).join(", ");
  return localSql<{ name: string }>(
    `select name from storage.objects where bucket_id = '${bucket}' and (storage.foldername(name))[1] in (${folders}) order by name`,
  ).map((row) => row.name);
}

/** Removes every file of a, a2 and b in `bucket` with the Storage API (the bytes too, where there are any). */
async function emptyFolders(bucket: string): Promise<void> {
  const names = filesOf(bucket, [a, a2, b]);
  for (let start = 0; start < names.length; start += 100) {
    const { error } = await adminClient().storage.from(bucket).remove(names.slice(start, start + 100));
    if (error) throw error;
  }
}

async function upload(user: TestUser, bucket: string, path = pathOf(bucket, user.id)) {
  return user.db.storage.from(bucket).upload(path, jpegBytes, { contentType: "image/jpeg", upsert: false });
}

/** Storage's refusal by the policy: 403 with Postgres's row-level security message (42501). */
function expectRefused(result: Awaited<ReturnType<typeof upload>>, what: string): void {
  expect(result.data, what).toBeNull();
  const error = result.error as { statusCode?: string; message?: string } | null;
  expect(error?.statusCode, what).toBe("403");
  expect(error?.message, what).toMatch(/row-level security/);
}

async function room(user: TestUser, bucket: string): Promise<boolean | null> {
  const { data, error } = await user.db.rpc("photo_room_in_my_household", { bucket });
  expect(error).toBeNull();
  return data;
}

beforeAll(async () => {
  a = await createTestUser("caps-a");
  a2 = await createTestUser("caps-a2");
  b = await createTestUser("caps-b");
  await moveToHousehold(a2, await householdOf(a.id));
});

afterEach(async () => {
  for (const { bucket } of buckets) await emptyFolders(bucket);
});

afterAll(async () => {
  await deleteTestUsers();
});

describe("photo caps (S-10)", () => {
  it("has the domain's caps, sizes and types in the database", () => {
    for (const { bucket, cap, types } of buckets) {
      expect(localSql<{ cap: number }>(`select public.photo_household_cap('${bucket}') as cap`)[0]!.cap, bucket).toBe(cap);
      const [row] = localSql<{ file_size_limit: number; types: string }>(
        `select file_size_limit, array_to_string(allowed_mime_types, ',') as types from storage.buckets where id = '${bucket}'`,
      );
      expect(Number(row!.file_size_limit), bucket).toBe(maxImageBytes);
      expect(row!.types.split(","), bucket).toEqual([...types]);
    }
    expect(localSql<{ cap: number }>(`select public.photo_household_cap('avatars') as cap`)[0]!.cap).toBe(0);
    // The migration role may make the trigger locally; hosted Supabase is checked by hand (docs/molnet.md).
    expect(
      localSql<{ name: string }>(`select tgname as name from pg_trigger where tgrelid = 'storage.objects'::regclass and tgname = 'photo_cap_guard'`),
    ).toHaveLength(1);
  });

  it("refuses anon the room check", async () => {
    expect((await anonClient().rpc("photo_room_in_my_household", { bucket: thingPhotoBucket })).error?.code).toBe("42501");
  });

  describe.each(buckets)("$bucket", ({ bucket, cap }) => {
    it("takes uploads under the cap, from either member, and counts both members' folders", async () => {
      expect(await room(a, bucket)).toBe(true);
      expect((await upload(a, bucket)).error, "a uploads").toBeNull();
      expect((await upload(a2, bucket)).error, "a2 uploads").toBeNull();
      // Up to one under the cap, split between the two folders.
      addRows(bucket, a.id, Math.floor(cap / 2) - 1);
      addRows(bucket, a2.id, cap - Math.floor(cap / 2) - 2);
      expect(filesOf(bucket, [a, a2])).toHaveLength(cap - 1);
      expect(await room(a2, bucket)).toBe(true);
      expect((await upload(a2, bucket)).error, "a2 uploads the last one").toBeNull();
      expect(filesOf(bucket, [a, a2])).toHaveLength(cap);
    });

    it("refuses the next upload at the cap, for every member, and leaves household B alone", async () => {
      addRows(bucket, a.id, cap - 1);
      expect((await upload(a2, bucket)).error).toBeNull();
      expect(await room(a, bucket)).toBe(false);
      expect(await room(a2, bucket)).toBe(false);
      expectRefused(await upload(a, bucket), "a past the cap");
      expectRefused(await upload(a2, bucket), "a2 past the cap");
      expect(filesOf(bucket, [a, a2])).toHaveLength(cap);
      // B has its own cap: A's full folders do not count.
      expect(await room(b, bucket)).toBe(true);
      expect((await upload(b, bucket)).error, "b uploads").toBeNull();
      expect(filesOf(bucket, [b])).toHaveLength(1);
    });

    it("lets one upload in again when a file is removed", async () => {
      const kept = pathOf(bucket, a.id);
      addRows(bucket, a2.id, cap - 1);
      expect((await upload(a, bucket, kept)).error).toBeNull();
      expectRefused(await upload(a, bucket), "at the cap");
      const removed = await a.db.storage.from(bucket).remove([kept]);
      expect(removed.error).toBeNull();
      expect(removed.data).toHaveLength(1);
      expect(await room(a, bucket)).toBe(true);
      expect((await upload(a2, bucket)).error, "a2 takes the freed place").toBeNull();
      expectRefused(await upload(a, bucket), "at the cap again");
    });

    it("never passes the cap with uploads at the same time", async () => {
      addRows(bucket, a.id, cap - 3);
      const results = await Promise.all(Array.from({ length: 12 }, (_, index) => upload(index % 2 ? a : a2, bucket)));
      expect(results.filter((result) => result.error === null)).toHaveLength(3);
      for (const result of results.filter((result) => result.error !== null)) expectRefused(result, "a refused one");
      expect(filesOf(bucket, [a, a2])).toHaveLength(cap);
    });

    it("keeps every file of a household over the cap, and only refuses new ones", async () => {
      addRows(bucket, a.id, cap + 5);
      const before = filesOf(bucket, [a, a2]);
      expectRefused(await upload(a, bucket), "over the cap");
      expect(filesOf(bucket, [a, a2])).toEqual(before);
      // Removing one is not enough while the household is still over.
      const removed = await a.db.storage.from(bucket).remove([before[0]!]);
      expect(removed.data).toHaveLength(1);
      expectRefused(await upload(a, bucket), "still over the cap");
    });

    it("lets the service role add a file past the cap (a restore), and the members still not", async () => {
      addRows(bucket, a.id, cap);
      const restored = await adminClient().storage.from(bucket).upload(pathOf(bucket, a.id), jpegBytes, { contentType: "image/jpeg" });
      expect(restored.error).toBeNull();
      expect(filesOf(bucket, [a, a2])).toHaveLength(cap + 1);
      expectRefused(await upload(a2, bucket), "a2 over the cap");
    });

    it("refuses a file larger than maxImageBytes and a type other than JPEG or PNG", async () => {
      const large = await a.db.storage.from(bucket).upload(pathOf(bucket, a.id), new Uint8Array(maxImageBytes + 1), { contentType: "image/jpeg" });
      expect(large.error, "too large").not.toBeNull();
      expect((large.error as { statusCode?: string }).statusCode).toBe("413");
      const gif = await a.db.storage.from(bucket).upload(pathOf(bucket, a.id), jpegBytes, { contentType: "image/gif" });
      expect(gif.error, "a GIF").not.toBeNull();
      expect((gif.error as { statusCode?: string }).statusCode).toBe("415");
      expect((await a.db.storage.from(bucket).upload(pathOf(bucket, a.id), new Uint8Array(maxImageBytes), { contentType: "image/png" })).error).toBeNull();
      expect(filesOf(bucket, [a])).toHaveLength(1);
    });
  });
});
