// A user's files in the private Storage bucket pantry-photo (Story 10.3,
// AD-26), listed and removed with the Storage API by scripts/users-sync.mjs
// (`--prune`) and by the E2E tests' cleanup. Both use the service role, which
// is allowed only in scripts/ and tests/ (AD-4); the app never does. A file
// is never deleted with SQL (storage.protect_delete()). Unit-tested in
// tests/scripts/pantry-photo-files.test.ts.
//
// Storage's list() goes one folder at a time and gives at most `limit`
// entries per call (100 by default), so the listing walks every folder under
// the user's own (`<user_id>/<site_id>/<location>/<photo>`) and every page of
// each. Errors carry only the step and Storage's status, never a path.

/** The private bucket of the latest photo per place (AD-26). */
export const placePhotoBucket = "pantry-photo";

/** Entries asked for per call to list(), and names given per call to remove(). */
export const storagePageSize = 100;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A failed call to Storage: the step and the status, never the path. */
export class PlacePhotoFilesError extends Error {
  /**
   * @param {"list" | "remove"} step
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
 * Every file under `folder` in `bucket`, in all folders below it and on every
 * page of each. A folder is an entry without an id.
 * @param {StorageBucket} bucket
 * @param {string} folder
 * @param {{ pageSize?: number }} [options]
 * @returns {Promise<string[]>}
 */
export async function listFilesUnder(bucket, folder, { pageSize = storagePageSize } = {}) {
  const files = [];
  const folders = [folder];
  while (folders.length > 0) {
    const current = /** @type {string} */ (folders.shift());
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await bucket.list(current, {
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new PlacePhotoFilesError("list", codeOf(error));
      const entries = data ?? [];
      for (const entry of entries) {
        const path = `${current}/${entry.name}`;
        if (entry.id === null || entry.id === undefined) folders.push(path);
        else files.push(path);
      }
      if (entries.length < pageSize) break;
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
 * Removes every file of the user `userId` in the bucket pantry-photo, then
 * lists the user's folder again: anything still there is a PlacePhotoFilesError,
 * so a caller never goes on believing the files are gone. Returns how many
 * files went. Only for a user's id, so it never lists the whole bucket.
 * @param {{ from: (bucket: string) => StorageBucket }} storage the service role's `supabase.storage`
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function removeUserPlacePhotos(storage, userId) {
  if (!uuidPattern.test(userId)) throw new PlacePhotoFilesError("list", "not_a_user_id");
  const bucket = storage.from(placePhotoBucket);
  const removed = await removeFiles(bucket, await listFilesUnder(bucket, userId));
  const left = await listFilesUnder(bucket, userId);
  if (left.length > 0) throw new PlacePhotoFilesError("remove", `${left.length}_left`);
  return removed;
}
