import { describe, expect, it, vi } from "vitest";
import {
  listFilesUnder,
  listUserFolders,
  maxRemoveRounds,
  PlacePhotoFilesError,
  placePhotoBucket,
  removeDeletedUsersPhotos,
  removeFiles,
  removeUserPlacePhotos,
} from "../../scripts/pantry-photo-files.mjs";
import { memoryBucket } from "./memory-bucket";

// The listing and removal of users' photo files for users:sync and the E2E
// cleanup (Story 10.3), against a bucket in memory that answers like
// Storage's list() (memory-bucket.ts).

const user = "11111111-1111-4111-8111-111111111111";
const other = "99999999-9999-4999-8999-999999999999";
const gone = "77777777-7777-4777-8777-777777777777";

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

  it.each([0, -1, 1.5, Number.NaN])("refuses a page size of %s before listing anything", async (pageSize) => {
    const { bucket, list } = memoryBucket([photo(1, "kyl", 1)]);
    await expect(listFilesUnder(bucket, user, { pageSize })).rejects.toMatchObject({ step: "list", code: "bad_page_size" });
    expect(list).not.toHaveBeenCalled();
  });

  it("stops at a folder deeper than four levels, and at too many folders", async () => {
    const { bucket } = memoryBucket([`${user}/a/b/c/d/e/file.jpg`]);
    await expect(listFilesUnder(bucket, user)).rejects.toMatchObject({ step: "list", code: "too_deep" });
    const places = Array.from({ length: 5 }, (_, index) => photo(index, "kyl", 0));
    await expect(listFilesUnder(memoryBucket(places).bucket, user, { folderLimit: 5 })).rejects.toMatchObject({
      code: "too_many_folders",
    });
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

  it("lists and removes again when a file came in meanwhile, until the listing is empty", async () => {
    const { bucket, files } = memoryBucket([photo(1, "kyl", 1)]);
    const late = photo(1, "kyl", 2);
    const remove = vi.fn(async (names: string[]) => {
      const result = await bucket.remove(names);
      if (remove.mock.calls.length === 1) files.add(late);
      return result;
    });
    expect(await removeUserPlacePhotos({ from: () => ({ ...bucket, remove }) }, user)).toBe(2);
    expect(files.size).toBe(0);
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it("fails when files are still there after every round", async () => {
    const { bucket } = memoryBucket([photo(1, "kyl", 1)]);
    const stubborn = { ...bucket, remove: vi.fn(async () => ({ data: [], error: null })) };
    await expect(removeUserPlacePhotos({ from: () => stubborn }, user)).rejects.toMatchObject({ step: "remove", code: "1_left" });
    expect(stubborn.remove).toHaveBeenCalledTimes(maxRemoveRounds);
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

describe("listUserFolders", () => {
  it("gives the bucket's top-level folders on every page, and no file at the root", async () => {
    const owners = Array.from({ length: 130 }, (_, index) => `${String(index).padStart(8, "0")}-0000-4000-8000-000000000000`);
    const { bucket } = memoryBucket([...owners.map((owner) => photo(1, "kyl", 1, owner)), "stray.jpg"]);
    expect((await listUserFolders(bucket)).sort()).toEqual([...owners].sort());
  });
});

describe("removeDeletedUsersPhotos", () => {
  it("empties only the folders of users that are gone, and counts folders not named by a user id", async () => {
    const kept = [photo(1, "kyl", 1), photo(1, "kyl", 1, other)];
    const leftBehind = [photo(1, "kyl", 1, gone), photo(2, "frys", 2, gone)];
    const { bucket, files } = memoryBucket([...kept, ...leftBehind, "not-a-user/x/kyl/1.jpg"]);
    const userExists = vi.fn(async (id: string) => id !== gone);

    expect(await removeDeletedUsersPhotos({ from: () => bucket }, userExists)).toEqual({
      removed: [{ userId: gone, files: 2 }],
      failed: [],
      notUsers: 1,
    });
    expect([...files].sort()).toEqual([...kept, "not-a-user/x/kyl/1.jpg"].sort());
    expect(userExists.mock.calls.map(([id]) => id).sort()).toEqual([user, gone, other].sort());
  });

  it("removes nothing of a user it cannot tell is gone, and goes on with the others", async () => {
    const leftBehind = photo(1, "kyl", 1, gone);
    const { bucket, files } = memoryBucket([photo(1, "kyl", 1), leftBehind]);
    const userExists = vi.fn(async (id: string) => {
      if (id === user) throw Object.assign(new Error("down"), { status: 503 });
      return false;
    });
    const result = await removeDeletedUsersPhotos({ from: () => bucket }, userExists);
    expect(result.failed).toEqual([{ userId: user, code: "user_503" }]);
    expect(result.removed).toEqual([{ userId: gone, files: 1 }]);
    expect(files.has(photo(1, "kyl", 1))).toBe(true);
    expect(files.has(leftBehind)).toBe(false);
  });
});
