import "server-only";
import { SettingsDataError, type SettingsDb } from "./client";
import type { ApiKeyView } from "../domain/api-key";

// The user's rows in api_key (Story 17.9). RLS limits every call to them, and the
// table's column grants keep the hash from ever being read back.

const columns = "id, label, created_at, last_used_at, revoked_at";

/** The user's keys, working ones first and then the revoked, newest first. Throws SettingsDataError. */
export async function listApiKeysIn(db: SettingsDb): Promise<ApiKeyView[]> {
  const { data, error } = await db.from("api_key").select(columns).order("created_at", { ascending: false });
  if (error) throw new SettingsDataError(`list_api_keys_failed ${error.code}`);
  const keys = data.map((row) => ({
    id: row.id,
    label: row.label,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  }));
  return [...keys.filter((key) => !key.revokedAt), ...keys.filter((key) => key.revokedAt)];
}

/** Stores the hash of a new key for the signed-in user. `limit` is true when they have too many working keys (MK402). */
export async function insertApiKeyIn(db: SettingsDb, keyHash: string, label: string): Promise<"added" | "limit"> {
  const { error } = await db.from("api_key").insert({ key_hash: keyHash, label });
  if (error?.code === "MK402") return "limit";
  if (error) throw new SettingsDataError(`insert_api_key_failed ${error.code}`);
  return "added";
}

/** Revokes a working key of the user's; revoking one already revoked, or not theirs, changes nothing. */
export async function revokeApiKeyIn(db: SettingsDb, id: string): Promise<void> {
  const { error } = await db.from("api_key").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null);
  if (error) throw new SettingsDataError(`revoke_api_key_failed ${error.code}`);
}
