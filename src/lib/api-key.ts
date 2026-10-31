import "server-only";
import { createHash, randomBytes } from "node:crypto";

// Personal API keys (Story 17.9): "lk_" and 32 random bytes in base64url. Only
// sha256(key) is stored, so a leaked table gives nobody a working key; a key
// with 256 bits of randomness needs no pepper or slow hash.

const keyPattern = /^lk_[A-Za-z0-9_-]{43}$/;

/** A new key, to show once. */
export function newApiKey(): string {
  return `lk_${randomBytes(32).toString("base64url")}`;
}

/** Lowercase hex sha256 of the key: what api_key.key_hash holds. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/** Whether `key` has the shape of one of ours; anything else is refused before the database is asked. */
export function looksLikeApiKey(key: string): boolean {
  return keyPattern.test(key);
}

/** The key in an `Authorization: Bearer <key>` header, or null. */
export function bearerKey(header: string | null): string | null {
  const match = /^Bearer ([^\s]+)$/i.exec(header?.trim() ?? "");
  return match && looksLikeApiKey(match[1]!) ? match[1]! : null;
}
