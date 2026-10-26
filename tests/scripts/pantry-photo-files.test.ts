import { describe, expect, it, vi } from "vitest";
import {
  listFilesUnder,
  PlacePhotoFilesError,
  placePhotoBucket,
  removeFiles,
  removeUserPlacePhotos,
} from "../../scripts/pantry-photo-files.mjs";

// The listing and removal of a user's photo files for users:sync --prune and
// the E2E cleanup (Story 10.3), against a bucket in memory that answers like
// Storage's list(): one folder at a time, folders without an id, and at most
// `limit` entries from `offset`.

const user = "11111111-1111-4111-8111-111111111111";
const other = "99999999-9999-4999-8999-999999999999";

type Entry = { name: string; id: string | null };

/** A bucket in memory holding `paths`, with spies on list() and remove(). */
function memoryBucket(paths: string[]) {
  const files = new Set(paths);
  const list = vi.fn(async (folder: string, { limit, offset }: { limit: number; offset: number }) => {
    const entries = new Map<string, Entry>();
    for (const path of files) {
      if (!path.startsWith(`${folder}/`)) continue;
      const [name, ...rest] = path.slice(folder.length + 1).split("/");
      entries.set(name, { name, id: rest.length > 0 ? null : `id-${path}` });
    }
    const sorted = [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
    return { data: sorted.slice(offset, offset + limit), error: null };
  });
  const remove = vi.fn(async (names: string[]) => {
    const gone = names.filter((name) => files.delete(name));
    return { data: gone.map((name) => ({ name })), error: null };
  });
  return { bucket: { list, remove }, files, list, remove };
}

const photo = (site: number, folder: string, index: number, owner = user) =>
  `${owner}/site-${String(site).padStart(3, "0")}/${folder}/${String(index).padStart(4, "0")}.jpg`;

describe("listFilesUnder", () => {
  it("walks every folder below the user's, not only the first level", async () => {
    const paths = [photo(1, "kyl", 1), photo(1, "frys", 2), photo(2, "skafferi", 3)];
    const { bucket } = memoryBucket([...paths, photo(1, "kyl", 9, other)]);
    expect((await listFilesUnder(bucket, user)).sort()).toEqual([...paths].sort());
  });

  it("reads every page of a folder: 250 files in one folder, and 120 places", async () => {
    const many = Array.from({ length: 250 }, (_, index) => photo(1, "kyl", index));
    const places = Array.from({ length: 120 }, (_, index) => photo(index + 2, "frys", 0));
    const { bucket, list } = memoryBucket([...many, ...places]);
    const listed = await listFilesUnder(bucket, user);
    expect(listed).toHaveLength(370);
    expect(new Set(listed)).toEqual(new Set([...many, ...places]));
    expect(list).toHaveBeenCalledWith(user, { limit: 100, offset: 100, sortBy: { column: "name", order: "asc" } });
  });

  it("throws only the step and the status, never the path", async () => {
    const bucket = {
      list: async () => ({ data: null, error: { message: `Object ${photo(1, "kyl", 1)} gone`, statusCode: "500" } }),
      remove: async () => ({ data: [], error: null }),
    };
    const error = await listFilesUnder(bucket, user).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(PlacePhotoFilesError);
    expect(error).toMatchObject({ step: "list", code: "500" });
    expect(String((error as Error).message)).not.toContain(user);
  });
});

describe("removeFiles", () => {
  it("removes 150 files in calls of 100 and 50 and counts them", async () => {
    const paths = Array.from({ length: 150 }, (_, index) => photo(1, "kyl", index));
    const { bucket, remove } = memoryBucket(paths);
    expect(await removeFiles(bucket, paths)).toBe(150);
    expect(remove.mock.calls.map(([names]) => names.length)).toEqual([100, 50]);
  });

  it("calls nothing for no files", async () => {
    const { bucket, remove } = memoryBucket([]);
    expect(await removeFiles(bucket, [])).toBe(0);
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("removeUserPlacePhotos", () => {
  it("removes all the user's files in the bucket pantry-photo, and none of another user's", async () => {
    const mine = [photo(1, "kyl", 1), photo(1, "frys", 2), photo(2, "kyl", 3)];
    const theirs = [photo(1, "kyl", 1, other)];
    const { bucket, files } = memoryBucket([...mine, ...theirs]);
    const from = vi.fn(() => bucket);
    expect(await removeUserPlacePhotos({ from }, user)).toBe(3);
    expect(from).toHaveBeenCalledWith(placePhotoBucket);
    expect([...files]).toEqual(theirs);
  });

  it("fails when files are still there afterwards", async () => {
    const { bucket } = memoryBucket([photo(1, "kyl", 1)]);
    const stubborn = { ...bucket, remove: async () => ({ data: [], error: null }) };
    await expect(removeUserPlacePhotos({ from: () => stubborn }, user)).rejects.toMatchObject({ step: "remove", code: "1_left" });
  });

  it("fails when Storage refuses the removal", async () => {
    const { bucket } = memoryBucket([photo(1, "kyl", 1)]);
    const refusing = { ...bucket, remove: async () => ({ data: null, error: { status: 503 } }) };
    await expect(removeUserPlacePhotos({ from: () => refusing }, user)).rejects.toMatchObject({ step: "remove", code: "503" });
  });

  it.each(["", "..", "not-a-user"])("never lists anything for %j, which is not a user's id", async (id) => {
    const { bucket, list } = memoryBucket([photo(1, "kyl", 1)]);
    await expect(removeUserPlacePhotos({ from: () => bucket }, id)).rejects.toMatchObject({ code: "not_a_user_id" });
    expect(list).not.toHaveBeenCalled();
  });
});
