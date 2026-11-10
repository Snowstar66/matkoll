import "server-only";
import { cache } from "react";
import { getMemberPeople } from "@/features/household/server";
import { createClient } from "@/lib/supabase/server";
import { FoodProfileDataError, listFoodProfilesIn } from "./data/food-profile";
import { combineFoodPreferences, type FoodProfileRow, type HouseholdFoodPreferences, personFromRow } from "./domain/food-profile";
import { type FitPerson, hasFitPreferences } from "./domain/dish-fit";
import type { Person } from "./domain/profile";

// Server-only entry (AD-1): the household's food preferences, saved in the database for every phone.

export type { FoodProfileRow, HouseholdFoodPerson, HouseholdFoodPreferences } from "./domain/food-profile";

/** The household's stored rows, or null when they cannot be read (logged by reason only). Memoised per request. */
export const listFoodProfiles = cache(async (): Promise<FoodProfileRow[] | null> => {
  try {
    return await listFoodProfilesIn(await createClient());
  } catch (error) {
    if (!(error instanceof FoodProfileDataError)) throw error;
    console.error("food_profile_unavailable", { reason: error.detail });
    return null;
  }
});

/**
 * What the household eats and avoids, for the server to steer AI suggestions and "Laga nu" with: every member
 * (a member without a row has nothing filled in) and every person kept by hand, with allergies, tastes (-2..2 per
 * kind of food), dislikes and likes (from tastes, also the older free lists), and the usual drink. Does not need the Menyrådgivare option (that is
 * per device); what is filled in may be used. Unreadable gives an empty list (logged). Memoised per request.
 */
export const getHouseholdFoodPreferences = cache(async (): Promise<HouseholdFoodPreferences> => {
  const [members, rows] = await Promise.all([getMemberPeople(), listFoodProfiles()]);
  return combineFoodPreferences(members ?? [], rows ?? []);
});

/**
 * The people with something filled in, as plain names and lists (never e-mail or ids), for holding a recipe or an AI
 * suggestion against ("Anna undviker koriander", allergies, "Älskar"). Empty when nobody has anything filled in or the
 * preferences cannot be read (logged by reason only): a help, never the job, so it never throws. One read per request.
 */
export const getFoodFitPeople = cache(async (): Promise<FitPerson[]> => {
  try {
    const { people } = await getHouseholdFoodPreferences();
    const fit = people.map(({ name, allergies, dislikes, likes, strongDislikes, strongLikes }): FitPerson => ({ name, allergies, dislikes, likes, strongDislikes, strongLikes }));
    return hasFitPreferences(fit) ? fit : [];
  } catch (error) {
    console.error("food_preferences_unavailable", { reason: error instanceof Error ? error.name : "unknown" });
    return [];
  }
});

/** The saved people for the profile and advisor screens, as phones know them ("Du" is id "me"); null when they cannot be read. */
export async function getSavedFoodPeople(): Promise<Person[] | null> {
  const [members, rows] = await Promise.all([getMemberPeople(), listFoodProfiles()]);
  if (!rows) return null;
  const meUserId = members?.find((member) => member.isMe)?.id ?? null;
  return rows.flatMap((row) => personFromRow(row, meUserId) ?? []);
}
