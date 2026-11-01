import "server-only";
import { guarded, ThingsDataError, type ThingsDb } from "./client";

// Brickor (Story 23.1): the cards taken after a time, for the badge on Förråd.
// RLS limits the read to the household's cards. Ids only.

/** The news keys (`card:<photo id>`) of the cards taken after `since`, newest first, at most `limit`. Throws ThingsDataError. */
export async function listCardNewsIn(db: ThingsDb, since: Date, limit: number): Promise<string[]> {
  const { data, error } = await guarded("list_card_news", async () =>
    db.from("thing_photo").select("id").gt("created_at", since.toISOString()).order("created_at", { ascending: false }).limit(limit),
  );
  if (error) throw new ThingsDataError(`list_card_news_failed ${error.code}`);
  return data.map((row) => `card:${row.id}`);
}
