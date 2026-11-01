import { z } from "zod";
import type { RoomSnapshot } from "../domain/thing-clear";
import { guarded, ThingsDataError, type ThingsDb } from "./client";

// "Ta bort rummet" for an empty room (Pontus 1 Nov): the room's places are
// deleted when none of them has a card (in any state) or a thing, and are put
// back with the same ids by "Ångra". Plain queries under RLS, so only the
// user's own rows are reached. Errors carry only a fixed reason and the
// Postgres code.

const placeRowSchema = z.object({
  id: z.uuid(),
  room: z.string(),
  part: z.string().nullable(),
  room_key: z.string(),
  part_key: z.string(),
  kind: z.enum(["part", "box"]),
  created_at: z.string(),
});

/**
 * Removes the room `roomKey` of the boende `siteId` when it is empty, and
 * gives back its places as they were. `gone` when the room is not there,
 * `not_empty` when one of its places has a card or a thing (nothing is
 * removed then). Only the places that were checked are deleted, so a place
 * made meanwhile keeps the room; a card taken on one of them between the check
 * and the delete (two requests apart) would go with it. Throws
 * ThingsDataError `query_failed <code>`, `remove_failed <code>` or `invalid_row`.
 */
export async function removeEmptyRoomIn(
  db: ThingsDb,
  siteId: string,
  roomKey: string,
): Promise<{ kind: "removed"; snapshot: RoomSnapshot } | { kind: "gone" } | { kind: "not_empty" }> {
  return guarded("remove", async () => {
    const places = await db
      .from("thing_place")
      .select("id, room, part, room_key, part_key, kind, created_at")
      .eq("site_id", siteId)
      .eq("room_key", roomKey);
    if (places.error) throw new ThingsDataError(`query_failed ${places.error.code}`);
    const parsed = z.array(placeRowSchema).safeParse(places.data);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    if (parsed.data.length === 0) return { kind: "gone" };

    const ids = parsed.data.map((place) => place.id);
    const [cards, things] = await Promise.all([
      db.from("thing_photo").select("id", { count: "exact", head: true }).in("place_id", ids),
      db.from("thing_item").select("id", { count: "exact", head: true }).in("place_id", ids),
    ]);
    if (cards.error) throw new ThingsDataError(`query_failed ${cards.error.code}`);
    if (things.error) throw new ThingsDataError(`query_failed ${things.error.code}`);
    if (cards.count !== 0 || things.count !== 0) return { kind: "not_empty" };

    const removed = await db.from("thing_place").delete().in("id", ids).select("id");
    if (removed.error) throw new ThingsDataError(`remove_failed ${removed.error.code}`);
    if (removed.data.length === 0) return { kind: "gone" };
    return {
      kind: "removed",
      snapshot: {
        siteId,
        places: parsed.data.map((place) => ({
          id: place.id,
          room: place.room,
          part: place.part,
          roomKey: place.room_key,
          partKey: place.part_key,
          kind: place.kind,
          createdAt: place.created_at,
        })),
      },
    };
  });
}

/**
 * "Ångra": puts the removed room's places back with the same ids. `taken`
 * when the boende has a room of that name again (made since), `site_gone`
 * when the boende went. Places that are back already (a second "Ångra") count
 * as restored. Throws ThingsDataError `restore_failed <code>`.
 */
export async function restoreRoomIn(db: ThingsDb, snapshot: RoomSnapshot): Promise<"restored" | "taken" | "site_gone"> {
  return guarded("restore", async () => {
    const inserted = await db.from("thing_place").insert(
      snapshot.places.map((place) => ({
        id: place.id,
        site_id: snapshot.siteId,
        room: place.room,
        part: place.part,
        room_key: place.roomKey,
        part_key: place.partKey,
        kind: place.kind,
        created_at: place.createdAt,
      })),
    );
    if (!inserted.error) return "restored";
    if (inserted.error.code === "23503") return "site_gone";
    if (inserted.error.code !== "23505") throw new ThingsDataError(`restore_failed ${inserted.error.code}`);
    // A unique key: the same rows back already, or another room of that name.
    const back = await db
      .from("thing_place")
      .select("id", { count: "exact", head: true })
      .in(
        "id",
        snapshot.places.map((place) => place.id),
      );
    if (back.error) throw new ThingsDataError(`restore_failed ${back.error.code}`);
    return back.count === snapshot.places.length ? "restored" : "taken";
  });
}
