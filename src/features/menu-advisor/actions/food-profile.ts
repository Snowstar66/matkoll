"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { FoodProfileDataError, importFoodProfilesIn, listFoodProfilesIn, removeFoodProfileIn, saveFoodProfileIn } from "../data/food-profile";
import { importInputSchema, peopleToImport, personFromRow, personInputSchema, personKeyOf, rowFromPerson } from "../domain/food-profile";
import { meId } from "../domain/people";
import type { Person } from "../domain/profile";

// The household's food preferences (Menyrådgivare), saved for every phone in the household. Nothing is revalidated:
// the screens keep what they show. Fails with `unauthorized`, `validation` or `food_profile_failed`.

function failed(error: unknown): Result<never> {
  if (!(error instanceof FoodProfileDataError)) throw error;
  console.error("food_profile_failed", { reason: error.detail });
  return fail("food_profile_failed");
}

/** Saves one person for the household (a member with their own key, a kept guest or a person added by hand). */
export async function saveFoodProfile(person: Person): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = personInputSchema.safeParse(person);
  const row = parsed.success ? rowFromPerson(parsed.data, user.data.id) : null;
  if (!row) return fail("validation");
  try {
    await saveFoodProfileIn(await createClient(), row);
    return ok();
  } catch (error) {
    return failed(error);
  }
}

/** Removes a person kept for the household by their id on the phone. "Du" and the members cannot be removed. */
export async function removeFoodProfile(id: string): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const key = typeof id === "string" && id !== meId ? personKeyOf(id, user.data.id) : null;
  if (!key) return fail("validation");
  try {
    await removeFoodProfileIn(await createClient(), key);
    return ok();
  } catch (error) {
    return failed(error);
  }
}

/**
 * The one-time move of what a phone kept in localStorage: adds the people the household has no row for, never
 * overwriting a row that exists, and gives back everything the household now has (as people, "Du" first by id).
 */
export async function importLocalProfiles(people: Person[]): Promise<Result<Person[]>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = importInputSchema.safeParse(people);
  if (!parsed.success) return fail("validation");
  try {
    const db = await createClient();
    const stored = await listFoodProfilesIn(db);
    const wanted = peopleToImport(parsed.data, new Set(stored.map((row) => row.personKey)), user.data.id);
    await importFoodProfilesIn(
      db,
      wanted.flatMap((person) => rowFromPerson(person, user.data.id) ?? []),
    );
    const after = wanted.length > 0 ? await listFoodProfilesIn(db) : stored;
    return ok(after.flatMap((row) => personFromRow(row, user.data.id) ?? []));
  } catch (error) {
    return failed(error);
  }
}
