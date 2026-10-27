// Pure planning for scripts/users-sync.mjs, unit-tested in tests/scripts.
import { z } from "zod";

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

/**
 * Deletes one user that is not in ALLOWED_EMAILS (`--prune`), in order: the
 * user's photo files first (`removePhotos`, Story 10.3: no foreign key takes
 * them with the user, AD-26), then the user (`deleteUser`), whose rows go with
 * it (on delete cascade). When the files cannot be removed, the user is kept,
 * so nothing is left that no user owns. Returns how many files went, or the
 * step that failed and its code; never a path.
 * @param {{ id: string }} user
 * @param {{
 *   removePhotos: (userId: string) => Promise<number>,
 *   deleteUser: (userId: string) => Promise<{ error: { code?: string, status?: number } | null }>,
 * }} actions
 * @returns {Promise<{ ok: true, removedPhotos: number } | { ok: false, step: "photos" | "user", code: string }>}
 */
export async function pruneUser(user, { removePhotos, deleteUser }) {
  let removedPhotos;
  try {
    removedPhotos = await removePhotos(user.id);
  } catch (error) {
    const code = /** @type {{ code?: unknown }} */ (error ?? {}).code;
    return { ok: false, step: "photos", code: typeof code === "string" ? code : "error" };
  }
  const { error } = await deleteUser(user.id);
  if (error) return { ok: false, step: "user", code: String(error.code ?? error.status ?? "error") };
  return { ok: true, removedPhotos };
}
