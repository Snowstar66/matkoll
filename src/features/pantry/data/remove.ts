import "server-only";
import { z } from "zod";
import { locationSchema, type Location } from "@/features/catalog";
import { pantryRowSchema, type PantryRow } from "../domain/pantry-item-form";
import { PantryDataError, pantryWriteError, type PantryDb } from "./client";

const idSchema = z.uuid();

type DbRow = {
  id: string;
  site_id?: string;
  ingredient_id: string;
  location: string;
  amount: number | null;
  unit: string | null;
  label?: string | null;
  created_at?: string;
};

/**
 * A row's label and time as PantryRow has them (Story 11.2), when the
 * database gave them. A time is ISO 8601 with an offset, as PostgREST and
 * to_jsonb write a timestamptz.
 */
function labelAndTime(row: { label?: string | null; created_at?: string }): Pick<PantryRow, "label" | "createdAt"> {
  return {
    ...(row.label === undefined ? {} : { label: row.label }),
    ...(row.created_at === undefined ? {} : { createdAt: row.created_at }),
  };
}

/**
 * A row from the database as the domain's PantryRow, with its place, label
 * and time when the database gave them; the check lists equal the domain's.
 */
function toPantryRow(row: DbRow): PantryRow {
  const parsed = pantryRowSchema.safeParse({
    id: row.id,
    ...(row.site_id === undefined ? {} : { siteId: row.site_id }),
    ingredientId: row.ingredient_id,
    location: row.location,
    amount: row.amount === null ? null : Number(row.amount),
    unit: row.unit,
    ...labelAndTime(row),
  });
  if (!parsed.success) throw new PantryDataError("invalid_row");
  return parsed.data;
}

/**
 * What removePantryItemIn deleted: the row as it was, for "Ångra", or null
 * when the deleted row could not be read back as a pantry row (it is gone
 * all the same, but cannot be put back).
 */
export type RemovedPantryRow = { row: PantryRow | null };

/**
 * removePantryItem (AD-19) for the signed-in user: deletes the row for good
 * (AD-20) and returns it as it was, for "Ångra". The delete names the user as
 * well as relying on RLS, so another user's row is never touched. Returns
 * null when the user has no row with the id (another user's, or gone already).
 * The delete has happened before the row is read back, so a row that does
 * not parse never throws: it gives `{ row: null }`.
 *
 * Throws PantryDataError: `invalid_id` before anything is deleted, or
 * `remove_failed <code>` when Postgres refuses.
 */
export async function removePantryItemIn(db: PantryDb, userId: string, id: string): Promise<RemovedPantryRow | null> {
  if (!idSchema.safeParse(id).success) throw new PantryDataError("invalid_id");
  const { data, error } = await db
    .from("pantry_item")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id, site_id, ingredient_id, location, amount, unit, label, created_at");
  if (error) throw new PantryDataError(`remove_failed ${error.code}`);
  const [row] = data;
  if (!row) return null;
  try {
    return { row: toPantryRow(row) };
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    return { row: null };
  }
}

/**
 * restorePantryItem (AD-19, AD-20) for the signed-in user: puts a removed
 * row back with the same id, amount, unit and location (restore_pantry_item),
 * on its own place when the row has `siteId` (sent as the row's site_id and
 * as `site`), otherwise on the selected one; also when another place has
 * been selected since (FR-33). A place that is gone is MK410.
 * Refused, with nothing changed, when the location has the item again (a row
 * with the same key, or one of the other kind: unlimited or amounts) or a
 * row has the id.
 *
 * Throws PantryDataError: `invalid_row` before anything is written,
 * `site_gone` for a place that is gone (MK410), or `restore_failed <code>`
 * when Postgres refuses otherwise (23505 for the cases above).
 */
export async function restorePantryItemIn(db: PantryDb, row: PantryRow): Promise<PantryRow> {
  const parsed = pantryRowSchema.safeParse(row);
  if (!parsed.success) throw new PantryDataError("invalid_row");
  const { id, siteId, ingredientId, location, amount, unit, label, createdAt } = parsed.data;
  const { data, error } = await db.rpc("restore_pantry_item", {
    item: {
      id,
      ...(siteId ? { site_id: siteId } : {}),
      ingredient_id: ingredientId,
      location,
      amount,
      unit,
      // Story 11.2: a row without them comes back without a label, added now.
      label: label ?? null,
      ...(createdAt ? { created_at: createdAt } : {}),
    },
    ...(siteId ? { site: siteId } : {}),
  });
  if (error) throw pantryWriteError("restore_failed", error.code);
  return toPantryRow(data);
}

const answerRowSchema = z.object({
  id: z.uuid(),
  site_id: z.uuid().optional(),
  ingredient_id: z.string(),
  location: z.string(),
  amount: z.union([z.number(), z.string()]).nullable(),
  unit: z.string().nullable(),
  label: z.string().nullable().optional(),
  created_at: z.string().optional(),
});
type AnswerRow = z.infer<typeof answerRowSchema>;

/**
 * The rows in a function's answer. The write has committed when the answer
 * is read, so a row that does not parse is left out here, never thrown: the
 * server keeps it, and "Ångra" puts it back all the same.
 */
function answerRows(value: unknown): AnswerRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    const parsed = answerRowSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

/** An answer row as a PantryRow, with its place when the answer has it, or null when it is not one the domain knows. */
function asPantryRow(row: AnswerRow): PantryRow | null {
  const parsed = pantryRowSchema.safeParse({
    id: row.id,
    ...(row.site_id === undefined ? {} : { siteId: row.site_id }),
    ingredientId: row.ingredient_id,
    location: row.location,
    amount: row.amount === null ? null : Number(row.amount),
    unit: row.unit,
    ...labelAndTime(row),
  });
  return parsed.success ? parsed.data : null;
}

/**
 * What emptyPantryPlaceIn removed: how many rows (all of which "Ångra" can
 * put back, from the server's record) and their ids, so the list can hide
 * them at once.
 */
export type EmptiedPlace = { removed: number; removedIds: string[] };

/**
 * emptyPantryPlace (AD-19) for the signed-in user: deletes every row in the
 * location of the place `siteId` (Story 8.4, sent as `site`; `null` is the
 * place selected when the call arrives) for good (AD-20) and stores them
 * under `operationId` for "Ångra" (pantry_removal), in one transaction under
 * pantry_lock() (empty_pantry_place). Rows another tab added meanwhile go
 * too; other places are never touched. The same operation id again (a retry
 * after a lost answer) removes nothing more and gives the same answer, also
 * when the place has been removed since. The answer is one value, so it is
 * never cut short.
 *
 * Throws PantryDataError: `invalid_location`, `invalid_operation` or
 * `invalid_site` before anything is deleted, `site_gone` for a place that is
 * removed or not the user's (MK410), or `empty_failed <code>` when Postgres
 * refuses otherwise (MK409 for an operation id of another place's emptying);
 * nothing is deleted then. Never throws once the delete has committed.
 */
export async function emptyPantryPlaceIn(
  db: PantryDb,
  location: Location,
  operationId: string,
  siteId: string | null,
): Promise<EmptiedPlace> {
  const place = locationSchema.safeParse(location);
  if (!place.success) throw new PantryDataError("invalid_location");
  if (!idSchema.safeParse(operationId).success) throw new PantryDataError("invalid_operation");
  if (siteId !== null && !idSchema.safeParse(siteId).success) throw new PantryDataError("invalid_site");
  const { data, error } = await db.rpc("empty_pantry_place", {
    place: place.data,
    operation_id: operationId,
    ...(siteId === null ? {} : { site: siteId }),
  });
  if (error) throw pantryWriteError("empty_failed", error.code);
  const answer = (data ?? {}) as { removed?: unknown; items?: unknown };
  const removedIds = answerRows(answer.items).map((row) => row.id);
  const removed = typeof answer.removed === "number" ? answer.removed : removedIds.length;
  return { removed, removedIds };
}

/** What "Ångra" put back: every restored id, the restored rows the domain knows, and how many were skipped. */
export type RestoredRemoval = { restoredIds: string[]; rows: PantryRow[]; skipped: number };

/**
 * restorePantryRemoval (AD-19, AD-20) for the signed-in user: "Ångra" for a
 * removal operation (restore_pantry_removal). Puts the rows the server
 * stored back with the same ids, amounts, units and locations, in one
 * transaction under pantry_lock(), and forgets the record. A row is skipped
 * when its id is taken, the location has the item again (the same unit, or
 * either one unlimited), or its catalog ingredient is gone.
 *
 * Throws PantryDataError: `invalid_operation` before calling, or
 * `restore_failed <code>` when Postgres refuses (P0002 for an operation that
 * is unknown, already undone or pruned); nothing is restored then.
 */
export async function restorePantryRemovalIn(db: PantryDb, operationId: string): Promise<RestoredRemoval> {
  if (!idSchema.safeParse(operationId).success) throw new PantryDataError("invalid_operation");
  const { data, error } = await db.rpc("restore_pantry_removal", { operation_id: operationId });
  if (error) throw new PantryDataError(`restore_failed ${error.code}`);
  const answer = (data ?? {}) as { restored?: unknown; skipped?: unknown };
  const restored = answerRows(answer.restored);
  return {
    restoredIds: restored.map((row) => row.id),
    rows: restored.flatMap((row) => asPantryRow(row) ?? []),
    skipped: typeof answer.skipped === "number" ? answer.skipped : 0,
  };
}
