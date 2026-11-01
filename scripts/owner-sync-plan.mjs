// Planning for scripts/owner-sync.mjs, unit-tested in tests/scripts.
import { z } from "zod";

const emailSchema = z.email();

/**
 * OWNER_EMAIL the way the app reads it: trimmed and lower-cased. Throws when it
 * is missing or not an address.
 * @param {string | undefined} raw
 * @returns {string}
 */
export function parseOwnerEmail(raw) {
  const email = (raw ?? "").trim().toLowerCase();
  if (email === "") throw new Error("OWNER_EMAIL is empty; set it to the owner's address");
  if (!emailSchema.safeParse(email).success) throw new Error("OWNER_EMAIL is not a valid address");
  return email;
}

/**
 * The owner's address to use: OWNER_EMAIL, or on your own machine (local Supabase),
 * when it is not set, DEV_AUTO_LOGIN_EMAIL, the user `pnpm dev` signs you in as.
 * @param {{ OWNER_EMAIL?: string, DEV_AUTO_LOGIN_EMAIL?: string }} env
 * @param {string} supabaseUrl
 * @returns {{ email: string, from: "OWNER_EMAIL" | "DEV_AUTO_LOGIN_EMAIL" }}
 */
export function ownerFrom(env, supabaseUrl) {
  if ((env.OWNER_EMAIL ?? "").trim() !== "") return { email: parseOwnerEmail(env.OWNER_EMAIL), from: "OWNER_EMAIL" };
  let local = false;
  try {
    local = ["127.0.0.1", "localhost"].includes(new URL(supabaseUrl).hostname);
  } catch {
    local = false;
  }
  if (local && (env.DEV_AUTO_LOGIN_EMAIL ?? "").trim() !== "") {
    return { email: parseOwnerEmail(env.DEV_AUTO_LOGIN_EMAIL), from: "DEV_AUTO_LOGIN_EMAIL" };
  }
  return { email: parseOwnerEmail(env.OWNER_EMAIL), from: "OWNER_EMAIL" };
}

/**
 * What to change in app_owner so that `owner` is the only address in it.
 * @param {string} owner from parseOwnerEmail
 * @param {string[]} current the addresses in app_owner now
 * @returns {{ add: boolean, remove: string[] }}
 */
export function planOwnerSync(owner, current) {
  return { add: !current.includes(owner), remove: current.filter((email) => email !== owner) };
}
