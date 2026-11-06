import { z } from "zod";
import { boxOfRow } from "../domain/thing-card";
import type { ClosedBox } from "../domain/thing-closed";
import { ThingsDataError, type ThingsDb } from "./client";

const itemSchema = z.array(
  z.object({
    id: z.uuid(),
    name: z.string().min(1),
    where_hint: z.string().nullable(),
    photo_id: z.uuid(),
    box_left: z.number().nullable(),
    box_top: z.number().nullable(),
    box_width: z.number().nullable(),
    box_height: z.number().nullable(),
  }),
);
const photoSchema = z.array(z.object({ id: z.uuid(), width: z.number().int(), height: z.number().int() }));

/** At most this many cards are asked about at once. */
const maxCards = 100;

/**
 * The containers (category "Förvaring & lådor") on the given cards, in the
 * order of the cards (newest first). The caller passes the cards the AI said
 * have closed boxes. Throws ThingsDataError `query_failed <code>` or `invalid_row`.
 */
export async function loadClosedBoxesIn(db: ThingsDb, cards: readonly { id: string; takenAt: Date }[]): Promise<ClosedBox[]> {
  const wanted = cards.slice(0, maxCards);
  if (wanted.length === 0) return [];
  const ids = wanted.map((card) => card.id);
  const [items, photos] = await Promise.all([
    db
      .from("thing_item")
      .select("id, name, where_hint, photo_id, box_left, box_top, box_width, box_height")
      .in("photo_id", ids)
      .eq("category", "Förvaring & lådor")
      .is("same_as", null)
      .order("position")
      .order("id"),
    db.from("thing_photo").select("id, width, height").in("id", ids),
  ]);
  if (items.error) throw new ThingsDataError(`query_failed ${items.error.code}`);
  if (photos.error) throw new ThingsDataError(`query_failed ${photos.error.code}`);
  const parsedItems = itemSchema.safeParse(items.data);
  const parsedPhotos = photoSchema.safeParse(photos.data);
  if (!parsedItems.success || !parsedPhotos.success) throw new ThingsDataError("invalid_row");
  const size = new Map(parsedPhotos.data.map((photo) => [photo.id, photo]));
  const index = new Map(wanted.map((card, position) => [card.id, position]));
  return parsedItems.data
    .map((row) => ({
      id: row.id,
      name: row.name,
      whereHint: row.where_hint,
      cardId: row.photo_id,
      takenAt: (wanted[index.get(row.photo_id) ?? 0] as { takenAt: Date }).takenAt.toISOString(),
      box: boxOfRow(row),
      photoWidth: size.get(row.photo_id)?.width ?? 0,
      photoHeight: size.get(row.photo_id)?.height ?? 0,
    }))
    .sort((a, b) => (index.get(a.cardId) ?? 0) - (index.get(b.cardId) ?? 0));
}
