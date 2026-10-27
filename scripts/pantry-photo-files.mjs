// Users' files in the private Storage bucket pantry-photo (Story 10.3,
// AD-26), listed and removed with the Storage API by scripts/users-sync.mjs
// (`--prune`, and the files of users that no longer exist) and by the E2E
// tests' cleanup. Both use the service role, which is allowed only in
// scripts/ and tests/ (AD-4); the app never does. A file is never deleted
// with SQL (storage.protect_delete()). Unit-tested in
// tests/scripts/pantry-photo-files.test.ts.
//
// Storage's list() goes one folder at a time and gives at most `limit`
// entries per call (100 by default), so the listing walks every folder under
// the user's own (`<user_id>/<site_id>/<location>/<photo>`) and every page of
// each, at most maxFolderDepth levels deep and maxFolders folders in all.
// Errors carry only the step and Storage's status, never a path.

/** The private bucket of the latest photo per place (AD-26). */
export const placePhotoBucket = "pantry-photo";

/** Entries asked for per call to list(), and names given per call to remove(). */
export const storagePageSize = 100;

/** The most folder levels below the starting folder the walk goes into: a photo is at `<site>/<location>/<file>`. */
export const maxFolderDepth = 4;

/** The most folders one walk lists. */
export const maxFolders = 10_000;

/** The most rounds of listing and removing for one user before what is left is an error. */
export const maxRemoveRounds = 3;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A failed call to Storage: the step and the status, never the path. */
export class PlacePhotoFilesError extends Error {
  /**
   * @param {"list" | "remove" | "user"} step
   * @param {string} code
   */
  constructor(step, code) {
    super(`${step} failed (${code})`);
    this.name = "PlacePhotoFilesError";
    this.step = step;
    this.code = code;
  }
}

/**
 * Storage's status for an error, without its message (which may hold the path).
 * @param {unknown} error
 * @returns {string}
 */
function codeOf(error) {
  const fields = /** @type {{ statusCode?: unknown, status?: unknown }} */ (error ?? {});
  return String(fields.statusCode ?? fields.status ?? "error");
}

/**
 * @typedef {{ name: string, id: string | null }} StorageEntry
 * @typedef {{
 *   list: (path: string, options: { limit: number, offset: number, sortBy: { column: string, order: string } }) =>
 *     Promise<{ data: StorageEntry[] | null, error: unknown }>,
 *   remove: (paths: string[]) => Promise<{ data: unknown[] | null, error: unknown }>,
 * }} StorageBucket
 */

/**
 * Every entry of `folder` itself, on every page.
 * @param {StorageBucket} bucket
 * @param {string} folder
 * @param {number} pageSize
 * @returns {Promise<StorageEntry[]>}
 */
async function listFolder(bucket, folder, pageSize) {
  const entries = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await bucket.list(folder, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new PlacePhotoFilesError("list", codeOf(error));
    const page = data ?? [];
    entries.push(...page);
    if (page.length < pageSize) return entries;
  }
}

/**
 * @param {number} pageSize
 */
function checkPageSize(pageSize) {
  if (!Number.isInteger(pageSize) || pageSize <= 0) throw new PlacePhotoFilesError("list", "bad_page_size");
}

/**
 * Every file under `folder` in `bucket`, in all folders below it and on every
 * page of each. A folder is an entry without an id. A folder deeper than
 * `maxDepth` levels, or more than `folderLimit` folders, is an error, so the
 * caller never goes on believing it saw everything.
 * @param {StorageBucket} bucket
 * @param {string} folder
 * @param {{ pageSize?: number, maxDepth?: number, folderLimit?: number }} [options]
 * @returns {Promise<string[]>}
 */
export async function listFilesUnder(
  bucket,
  folder,
  { pageSize = storagePageSize, maxDepth = maxFolderDepth, folderLimit = maxFolders } = {},
) {
  checkPageSize(pageSize);
  const files = [];
  const folders = [{ path: folder, depth: 0 }];
  let visited = 0;
  while (folders.length > 0) {
    const current = /** @type {{ path: string, depth: number }} */ (folders.shift());
    visited += 1;
    if (visited > folderLimit) throw new PlacePhotoFilesError("list", "too_many_folders");
    for (const entry of await listFolder(bucket, current.path, pageSize)) {
      const path = `${current.path}/${entry.name}`;
      if (entry.id !== null && entry.id !== undefined) {
        files.push(path);
      } else {
        if (current.depth + 1 > maxDepth) throw new PlacePhotoFilesError("list", "too_deep");
        folders.push({ path, depth: current.depth + 1 });
      }
    }
  }
  return files;
}

/**
 * Removes `paths` from `bucket`, at most storagePageSize per call, and returns
 * how many went. Stops at the first call that fails.
 * @param {StorageBucket} bucket
 * @param {readonly string[]} paths
 * @returns {Promise<number>}
 */
export async function removeFiles(bucket, paths) {
  let removed = 0;
  for (let start = 0; start < paths.length; start += storagePageSize) {
    const { data, error } = await bucket.remove(paths.slice(start, start + storagePageSize));
    if (error) throw new PlacePhotoFilesError("remove", codeOf(error));
    removed += data?.length ?? 0;
  }
  return removed;
}

/**
 * Removes every file of the user `userId` in the bucket pantry-photo: lists
 * the user's folder and removes what is there, for at most maxRemoveRounds
 * rounds until a listing is empty. Anything still there after that is a
 * PlacePhotoFilesError, so a caller never goes on believing the files are
 * gone. Returns how many files went. Only for a user's id, so it never lists
 * the whole bucket.
 * @param {{ from: (bucket: string) => StorageBucket }} storage the service role's `supabase.storage`
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function removeUserPlacePhotos(storage, userId) {
  if (!uuidPattern.test(userId)) throw new PlacePhotoFilesError("list", "not_a_user_id");
  const bucket = storage.from(placePhotoBucket);
  let removed = 0;
  for (let round = 0; round < maxRemoveRounds; round += 1) {
    const files = await listFilesUnder(bucket, userId);
    if (files.length === 0) return removed;
    removed += await removeFiles(bucket, files);
  }
  const left = await listFilesUnder(bucket, userId);
  if (left.length > 0) throw new PlacePhotoFilesError("remove", `${left.length}_left`);
  return removed;
}

/**
 * The top-level folders of the bucket pantry-photo: one per user who has had
 * a photo (`<user_id>/`), on every page, at most `folderLimit`.
 * @param {StorageBucket} bucket
 * @param {{ pageSize?: number, folderLimit?: number }} [options]
 * @returns {Promise<string[]>}
 */
export async function listUserFolders(bucket, { pageSize = storagePageSize, folderLimit = maxFolders } = {}) {
  checkPageSize(pageSize);
  const folders = (await listFolder(bucket, "", pageSize)).filter((entry) => entry.id === null || entry.id === undefined);
  if (folders.length > folderLimit) throw new PlacePhotoFilesError("list", "too_many_folders");
  return folders.map((entry) => entry.name);
}

/**
 * Removes the files of users that no longer exist (Story 10.3): a user
 * deleted outside `users:sync --prune` (such as in the Supabase dashboard)
 * leaves the folder `<user_id>/` behind, since no foreign key ties a file to
 * its user, and the app's sweep, which runs as a signed-in user, never
 * reaches another user's folder. Each top-level folder whose name is a user
 * id that `userExists` says is gone is emptied with removeUserPlacePhotos. A
 * folder whose name is not a user id is only counted. Never a path in what it
 * returns; a failure for one folder does not stop the others.
 * @param {{ from: (bucket: string) => StorageBucket }} storage the service role's `supabase.storage`
 * @param {(userId: string) => Promise<boolean>} userExists true when the user is there; throws when it cannot tell
 * @returns {Promise<{
 *   removed: { userId: string, files: number }[],
 *   failed: { userId: string, code: string }[],
 *   notUsers: number,
 * }>}
 */
export async function removeDeletedUsersPhotos(storage, userExists) {
  const folders = await listUserFolders(storage.from(placePhotoBucket));
  const removed = [];
  const failed = [];
  let notUsers = 0;
  for (const folder of folders) {
    if (!uuidPattern.test(folder)) {
      notUsers += 1;
      continue;
    }
    let exists;
    try {
      exists = await userExists(folder);
    } catch (error) {
      const code = /** @type {{ code?: unknown, status?: unknown }} */ (error ?? {});
      failed.push({ userId: folder, code: `user_${String(code.code ?? code.status ?? "error")}` });
      continue;
    }
    if (exists) continue;
    try {
      removed.push({ userId: folder, files: await removeUserPlacePhotos(storage, folder) });
    } catch (error) {
      const code = /** @type {{ code?: unknown }} */ (error ?? {}).code;
      failed.push({ userId: folder, code: typeof code === "string" ? code : "error" });
    }
  }
  return { removed, failed, notUsers };
}
