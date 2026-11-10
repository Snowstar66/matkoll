import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { FoodProfileRow } from "../domain/food-profile";
import { parsePerson } from "../domain/people";

// The table food_profile (supabase/migrations/20261109100000_food_profile.sql). Every call runs with the signed-in
// member's session, so RLS keeps it to the member's own household. Errors carry a fixed reason and the database's
// code, never a name or a preference.

type Db = SupabaseClient<Database>;
type StoredRow = Pick<Database["public"]["Tables"]["food_profile"]["Row"], "person_key" | "kind" | "name" | "allergies" | "tastes" | "dislikes" | "likes" | "drink">;

export class FoodProfileDataError extends Error {
  constructor(readonly detail: string) {
    super(`food_profile_data: ${detail}`);
    this.name = "FoodProfileDataError";
  }
}

/** One stored row as the app's row; what the checks would have refused cannot be there, but a stray value is dropped anyway. */
function toRow(data: StoredRow): FoodProfileRow | null {
  const person = parsePerson({ id: data.person_key, name: data.name ?? "Medlem", kind: data.kind, allergies: data.allergies, tastes: data.tastes, dislikes: data.dislikes, likes: data.likes, drink: data.drink });
  if (!person) return null;
  return {
    personKey: data.person_key,
    kind: person.kind,
    name: data.name,
    allergies: person.allergies,
    tastes: person.tastes,
    drink: person.drink,
  };
}

/** The household's rows, oldest first. Throws FoodProfileDataError. */
export async function listFoodProfilesIn(db: Db): Promise<FoodProfileRow[]> {
  const { data, error } = await db
    .from("food_profile")
    .select("person_key, kind, name, allergies, tastes, dislikes, likes, drink")
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw new FoodProfileDataError(`list_failed ${error.code}`);
  return data.flatMap((row) => toRow(row) ?? []);
}

const content = (row: FoodProfileRow) => ({
  name: row.name,
  allergies: row.allergies,
  tastes: row.tastes as NonNullable<Json>,
  // The older columns are left empty: what they held was folded into the tastes when the row was read.
  dislikes: [] as string[],
  likes: [] as string[],
  drink: row.drink,
  saved: true,
});

/** Saves one person: changes the row of that key, or adds it. Two phones adding the same person at once end as one row. */
export async function saveFoodProfileIn(db: Db, row: FoodProfileRow): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const updated = await db.from("food_profile").update(content(row)).eq("person_key", row.personKey).select("id");
    if (updated.error) throw new FoodProfileDataError(`save_failed ${updated.error.code}`);
    if (updated.data.length > 0) return;
    const inserted = await db.from("food_profile").insert({ person_key: row.personKey, kind: row.kind, ...content(row) });
    if (!inserted.error) return;
    // Someone added the same person between our update and insert: update theirs.
    if (inserted.error.code !== "23505") throw new FoodProfileDataError(`save_failed ${inserted.error.code}`);
  }
  throw new FoodProfileDataError("save_failed conflict");
}

export async function removeFoodProfileIn(db: Db, personKey: string): Promise<void> {
  const { error } = await db.from("food_profile").delete().eq("person_key", personKey);
  if (error) throw new FoodProfileDataError(`remove_failed ${error.code}`);
}

/** Adds the people the household has no row for yet; a row that exists is left exactly as it is. */
export async function importFoodProfilesIn(db: Db, rows: readonly FoodProfileRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db.from("food_profile").upsert(
    rows.map((row) => ({ person_key: row.personKey, kind: row.kind, ...content(row) })),
    { onConflict: "household_id,person_key", ignoreDuplicates: true },
  );
  if (error) throw new FoodProfileDataError(`import_failed ${error.code}`);
}
