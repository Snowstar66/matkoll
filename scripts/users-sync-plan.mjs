// Planning for scripts/users-sync.mjs, and its steps against the service
// role's client (passed in, so a fake stands in for it), unit-tested in
// tests/scripts.
import { z } from "zod";
import { removeDeletedUsersPhotos, removeUserPlacePhotos } from "./pantry-photo-files.mjs";

const emailSchema = z.email();

/**
 * Parses ALLOWED_EMAILS the way the app does: comma-separated, trimmed,
 * lower-cased, empty entries ignored. Throws on an invalid address.
 * @param {string | undefined} raw
 * @returns {string[]}
 */
export function parseAllowedEmails(raw) {
  const emails = (raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
  const invalid = emails.filter((email) => !emailSchema.safeParse(email).success);
  if (invalid.length > 0) {
    throw new Error(`ALLOWED_EMAILS has ${invalid.length} invalid address(es)`);
  }
  return [...new Set(emails)];
}

/**
 * Decides which users to create, keep, warn about and delete. Users are only
 * deleted when `prune` is set.
 * @param {string[]} allowed normalised addresses from parseAllowedEmails
 * @param {{ id: string, email?: string | null }[]} existing users in Supabase Auth
 * @param {{ prune?: boolean }} [options]
 */
export function planUserSync(allowed, existing, { prune = false } = {}) {
  const existingEmails = new Set(existing.map((user) => (user.email ?? "").toLowerCase()));
  const allowedSet = new Set(allowed);
  const create = allowed.filter((email) => !existingEmails.has(email));
  const keep = existing.filter((user) => allowedSet.has((user.email ?? "").toLowerCase()));
  const extra = existing.filter((user) => !allowedSet.has((user.email ?? "").toLowerCase()));
  return { create, keep, extra, remove: prune ? extra : [] };
}

/** How long a pruned user is banned: for good (Supabase takes a Go duration). */
export const pruneBanDuration = "876000h";

/**
 * @typedef {{ code?: unknown, status?: unknown } | null} AdminError
 * @typedef {{
 *   auth: { admin: {
 *     updateUserById: (id: string, attributes: { ban_duration: string }) => Promise<{ error: AdminError }>,
 *     deleteUser: (id: string) => Promise<{ error: AdminError }>,
 *     getUserById: (id: string) => Promise<{ data: { user: unknown } | null, error: AdminError }>,
 *   } },
 *   storage: { from: (bucket: string) => import("./pantry-photo-files.mjs").StorageBucket },
 *   from: (table: string) => { delete: () => { eq: (column: string, value: string) => PromiseLike<{ error: AdminError }> } },
 * }} AdminClient the service role's Supabase client, or a fake in tests
 */

/** @param {unknown} error */
function codeOf(error) {
  const fields = /** @type {{ code?: unknown, status?: unknown }} */ (error ?? {});
  return String(fields.code ?? fields.status ?? "error");
}

/**
 * Deletes the users not in ALLOWED_EMAILS (`--prune`, `plan.remove`), each
 * in order (Story 10.3, AD-26):
 *
 * 1. The user is banned, so no new session and no refreshed token can upload
 *    a photo while the files go. A token already given out still works until
 *    it expires (at most an hour); step 4 and the next users:sync take what
 *    such a token uploads.
 * 2. The user's photo files are removed (removeUserPlacePhotos): no foreign
 *    key takes them with the user. When they cannot be, the user is kept
 *    (banned), so nothing is left that no user owns.
 * 3. The user is deleted; the rows go with it (on delete cascade). When that
 *    fails after the files are gone, the user's pantry_photo rows are deleted,
 *    so no row points at a missing file.
 * 4. The user's folder is listed once more, and anything there is removed.
 *
 * A failure for one user is reported and the others go on. Returns the lines
 * to print, with the user's id and counts only (never an address or a path),
 * and whether every user went (`ok`); the script exits with an error when not.
 * @param {{ remove: { id: string }[] }} plan
 * @param {AdminClient} supabase
 * @returns {Promise<{ lines: { level: "info" | "error", text: string }[], ok: boolean }>}
 */
export async function pruneExtraUsers(plan, supabase) {
  /** @type {{ level: "info" | "error", text: string }[]} */
  const lines = [];
  let ok = true;
  /** @param {string} text */
  const failure = (text) => {
    ok = false;
    lines.push({ level: "error", text });
  };

  for (const { id } of plan.remove) {
    const banned = await supabase.auth.admin.updateUserById(id, { ban_duration: pruneBanDuration });
    if (banned.error) {
      failure(`could not prune ${id}: could not ban it (${codeOf(banned.error)}); the user is kept`);
      continue;
    }

    let removedPhotos;
    try {
      removedPhotos = await removeUserPlacePhotos(supabase.storage, id);
    } catch (error) {
      failure(`could not remove the photos of ${id} (${codeOf(error)}); the user is kept, banned`);
      continue;
    }

    const deleted = await supabase.auth.admin.deleteUser(id);
    if (deleted.error) {
      const rows = await supabase.from("pantry_photo").delete().eq("user_id", id);
      failure(
        rows.error
          ? `could not delete ${id} (${codeOf(deleted.error)}); its ${removedPhotos} photo file(s) are removed, but its photo rows are not (${codeOf(rows.error)}); the user is kept, banned`
          : `could not delete ${id} (${codeOf(deleted.error)}); its ${removedPhotos} photo file(s) and their rows are removed; the user is kept, banned`,
      );
      continue;
    }

    try {
      removedPhotos += await removeUserPlacePhotos(supabase.storage, id);
    } catch (error) {
      failure(`deleted ${id}, but photo files are left (${codeOf(error)}); the next users:sync removes them`);
      continue;
    }
    lines.push({ level: "info", text: `deleted  ${id} and ${removedPhotos} photo file(s)` });
  }
  return { lines, ok };
}

/**
 * Removes the photo files of users that no longer exist (Story 10.3): a user
 * deleted outside `--prune`, such as in the Supabase dashboard, leaves its
 * folder in the bucket, which the app's sweep never reaches. A folder goes
 * only when Supabase Auth says its user is not found. Returns the lines to
 * print, with user ids and counts only, and whether every such folder went.
 * @param {AdminClient} supabase
 * @returns {Promise<{ lines: { level: "info" | "error", text: string }[], ok: boolean }>}
 */
export async function removeDeletedUsersFiles(supabase) {
  /** @type {{ level: "info" | "error", text: string }[]} */
  const lines = [];
  let result;
  try {
    result = await removeDeletedUsersPhotos(supabase.storage, async (id) => {
      const { data, error } = await supabase.auth.admin.getUserById(id);
      if (!error) return Boolean(data?.user);
      const fields = /** @type {{ code?: unknown, status?: unknown }} */ (error);
      if (fields.status === 404 || fields.code === "user_not_found") return false;
      throw error;
    });
  } catch (error) {
    return { lines: [{ level: "error", text: `could not list the photo folders (${codeOf(error)})` }], ok: false };
  }
  for (const { userId, files } of result.removed) {
    lines.push({ level: "info", text: `removed  ${files} photo file(s) of the deleted user ${userId}` });
  }
  for (const { userId, code } of result.failed) {
    lines.push({ level: "error", text: `could not remove the photos of the deleted user ${userId} (${code})` });
  }
  if (result.notUsers > 0) {
    lines.push({ level: "info", text: `skipped  ${result.notUsers} photo folder(s) not named by a user id` });
  }
  return { lines, ok: result.failed.length === 0 };
}
