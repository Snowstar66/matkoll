import "server-only";
import { ShoppingDataError, type ShoppingDb } from "./client";

// Brickor (Story 23.1): what was added to the shopping list after a time, for
// the badge on Inköpslista. Own items added and lines checked off; RLS limits
// the reads to the household's rows. Ids and line keys only, never a label.

/**
 * The news keys of own items added (`item:<id>`) and lines checked off
 * (`check:<line key>`) after `since`, newest first, at most `limit` of each.
 * Throws ShoppingDataError.
 */
export async function listShoppingNewsIn(db: ShoppingDb, since: Date, limit: number): Promise<string[]> {
  const after = since.toISOString();
  const [items, checks] = await Promise.all([
    db.from("shopping_custom_item").select("id").gt("created_at", after).order("created_at", { ascending: false }).limit(limit),
    db.from("shopping_check").select("line_key").gt("created_at", after).order("created_at", { ascending: false }).limit(limit),
  ]);
  if (items.error) throw new ShoppingDataError(`list_news_failed ${items.error.code}`, items.error.code);
  if (checks.error) throw new ShoppingDataError(`list_news_failed ${checks.error.code}`, checks.error.code);
  return [...items.data.map((row) => `item:${row.id}`), ...checks.data.map((row) => `check:${row.line_key}`)];
}
