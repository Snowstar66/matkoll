import "server-only";
import { ShoppingDataError, type ShoppingDb } from "./client";

/** What the database function said: the labels added, a refused key, or the rate limit. */
export type QuickAddOutcome = { kind: "added"; labels: string[] } | { kind: "invalid_key" } | { kind: "rate_limited" };

/**
 * Story 17.9: adds own items for the owner of the key whose sha256 is `hash`
 * (add_items_by_api_key). The function checks the key, counts the call against
 * the key's 30 a minute and inserts as the key's user; a missing and a revoked
 * key answer the same (MK401). `db` has no session. Throws ShoppingDataError
 * for anything else.
 */
export async function addItemsByApiKeyIn(db: ShoppingDb, hash: string, labels: string[]): Promise<QuickAddOutcome> {
  const { data, error } = await db.rpc("add_items_by_api_key", { hash, labels });
  if (error) {
    if (error.code === "MK401") return { kind: "invalid_key" };
    if (error.code === "MK429") return { kind: "rate_limited" };
    throw new ShoppingDataError(`quick_add_failed ${error.code}`, error.code);
  }
  return { kind: "added", labels: data };
}
