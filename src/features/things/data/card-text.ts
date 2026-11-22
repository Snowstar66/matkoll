import { z } from "zod";
import { guarded, ThingsDataError, type ThingsDb } from "./client";

// The words of a card: the user's own name (user_title) and the AI's line and short name (summary, ai_title). Every call
// uses the signed-in user's session client, so RLS limits it to the household's own rows (AD-4). Errors carry only a
// fixed reason and the Postgres code.

/** The user's own name for the card, or none (`null`: the AI's short name or where the card is shows again). `false` when the card is gone. Throws ThingsDataError. */
export async function setCardTitleIn(db: ThingsDb, id: string, title: string | null): Promise<boolean> {
  return guarded("update", async () => {
    const { data, error } = await db.from("thing_photo").update({ user_title: title }).eq("id", id).select("id");
    if (error) throw new ThingsDataError(`update_failed ${error.code}`);
    return data.length > 0;
  });
}

/** The AI's new line and short name (each may be `null`). `false` when the card is gone. Throws ThingsDataError. */
export async function saveCardSummaryIn(db: ThingsDb, id: string, text: { summary: string | null; title: string | null }): Promise<boolean> {
  return guarded("update", async () => {
    const { data, error } = await db.from("thing_photo").update({ summary: text.summary, ai_title: text.title }).eq("id", id).select("id");
    if (error) throw new ThingsDataError(`update_failed ${error.code}`);
    return data.length > 0;
  });
}

const namesSchema = z.array(z.object({ name: z.string(), position: z.number().int(), id: z.uuid() }));

/** The names of the föremål on a card in the card's order (at most 60). Throws ThingsDataError. */
export async function loadCardNamesIn(db: ThingsDb, id: string): Promise<string[]> {
  return guarded("query", async () => {
    const { data, error } = await db.from("thing_item").select("id, name, position").eq("photo_id", id).is("same_as", null).order("position").order("id").limit(60);
    if (error) throw new ThingsDataError(`query_failed ${error.code}`);
    const parsed = namesSchema.safeParse(data);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    return parsed.data.map((row) => row.name);
  });
}
