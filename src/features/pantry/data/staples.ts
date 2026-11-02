import "server-only";
import { normalizeIngredientText } from "@/features/catalog";
import { STAPLE_UNITS, type Staple, type StapleLimit, type StapleUnit } from "../domain/staples";
import { PantryDataError, type PantryDb } from "./client";

// Basvaror (household_staple): the household's staples. RLS limits every read
// and write to the caller's household; the session client only.

const isStapleUnit = (unit: string | null): unit is StapleUnit =>
  unit !== null && (STAPLE_UNITS as readonly string[]).includes(unit);

type StapleRow = {
  id: string;
  name: string;
  normalized_name: string;
  max_amount: number | null;
  max_unit: string | null;
};

function toStaple(row: StapleRow): Staple {
  // A limit the app does not know (never written by it) counts as always.
  const limit: StapleLimit =
    row.max_amount !== null && isStapleUnit(row.max_unit)
      ? { maxAmount: Number(row.max_amount), maxUnit: row.max_unit }
      : { maxAmount: null, maxUnit: null };
  return { id: row.id, name: row.name, normalizedName: row.normalized_name, ...limit };
}

const columns = "id, name, normalized_name, max_amount, max_unit";

/** The household's staples, in the order they were added. Throws PantryDataError. */
export async function listStaplesIn(db: PantryDb): Promise<Staple[]> {
  const { data, error } = await db.from("household_staple").select(columns).order("created_at").order("id");
  if (error) throw new PantryDataError(`staples_query_failed ${error.code}`);
  return data.map(toStaple);
}

/** What adding a staple gave. */
export type AddStapleOutcome = { kind: "added"; staple: Staple } | { kind: "duplicate" } | { kind: "limit" };

/**
 * Adds a staple to the household: `duplicate` when one of the same normalised
 * name is there, `limit` at 200. Throws PantryDataError for anything else.
 */
export async function addStapleIn(db: PantryDb, name: string, limit: StapleLimit): Promise<AddStapleOutcome> {
  const { data, error } = await db
    .from("household_staple")
    .insert({ name, normalized_name: normalizeIngredientText(name), max_amount: limit.maxAmount, max_unit: limit.maxUnit })
    .select(columns)
    .single();
  if (error?.code === "23505") return { kind: "duplicate" };
  if (error?.code === "MK429") return { kind: "limit" };
  if (error) throw new PantryDataError(`staple_add_failed ${error.code}`);
  return { kind: "added", staple: toStaple(data) };
}

/** Removes the staple `id`; the removed staple, or `null` when it was gone already. Throws PantryDataError. */
export async function removeStapleIn(db: PantryDb, id: string): Promise<Staple | null> {
  const { data, error } = await db.from("household_staple").delete().eq("id", id).select(columns);
  if (error) throw new PantryDataError(`staple_remove_failed ${error.code}`);
  return data[0] ? toStaple(data[0]) : null;
}

/** "Återställ standard": the household's staples become the default list. Throws PantryDataError. */
export async function resetStaplesIn(db: PantryDb): Promise<void> {
  const { error } = await db.rpc("reset_household_staples");
  if (error) throw new PantryDataError(`staples_reset_failed ${error.code}`);
}
