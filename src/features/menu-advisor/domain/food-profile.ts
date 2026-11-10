import { z } from "zod";
import { maxNameLength, maxPeople, memberPersonId, meId, newPerson, parsePerson } from "./people";
import { maxTagLength, maxTags } from "./preferences";
import { drinkKinds, type Person } from "./profile";
import { maxTastes, tasteKeyPattern, tasteLists, type TasteLists } from "./tastes";
import { menuAllergens } from "./types";

// The household's food preferences as the database keeps them (table food_profile): one row per person, found by a
// stable person key. "Du" on a phone is the member's own key, so the same person is the same row on every phone.
// Pure: converting between the app's Person and a row, picking what one device kept in localStorage that the
// household has no row for yet, and the shape a server reader (AI suggestions, "Laga nu") gets.

/** One stored person. A member's name is the household's, so it is only kept for people without an account. */
export type FoodProfileRow = {
  personKey: string;
  kind: "member" | "guest";
  name: string | null;
  allergies: Person["allergies"];
  /** Everything a person likes or dislikes (domain/tastes.ts). The older Undviker / Älskar columns are folded in here when read and emptied when saved. */
  tastes: Person["tastes"];
  drink: Person["drink"];
};

/** One person for a server reader: member names included, nothing filled in = empty lists and no drink. */
export type HouseholdFoodPerson = Omit<FoodProfileRow, "name"> & { name: string } & TasteLists;
export type HouseholdFoodPreferences = { people: HouseholdFoodPerson[] };

const tasteValue = z.union([z.literal(-2), z.literal(-1), z.literal(1), z.literal(2)]);

/** What a person sent from a phone must look like before it is touched; parsePerson then cleans the tags. */
export const personInputSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(maxNameLength),
  kind: z.enum(["member", "guest"]),
  allergies: z.array(z.enum(menuAllergens)).max(menuAllergens.length),
  tastes: z.record(z.string().regex(tasteKeyPattern), tasteValue).refine((tastes) => Object.keys(tastes).length <= maxTastes),
  // Only a phone that has not updated yet still sends the older lists; they are folded into the tastes.
  dislikes: z.array(z.string().max(maxTagLength)).max(maxTags).optional(),
  likes: z.array(z.string().max(maxTagLength)).max(maxTags).optional(),
  drink: z.enum(drinkKinds).nullable(),
});

export const importInputSchema = z.array(personInputSchema).max(maxPeople + 1);

/** The key a person is stored under, or null when it cannot be known (the signed-in member's id is needed for "Du"). */
export function personKeyOf(id: string, meUserId: string | null): string | null {
  if (id === meId) return meUserId ? memberPersonId(meUserId) : null;
  return /^[A-Za-z0-9_-]{1,80}$/.test(id) ? id : null;
}

/** The row to store for this person, or null when it is not a valid person or its key is unknown. */
export function rowFromPerson(input: unknown, meUserId: string | null): FoodProfileRow | null {
  const person = parsePerson(input);
  if (!person) return null;
  const personKey = personKeyOf(person.id, meUserId);
  if (!personKey) return null;
  const ofHousehold = person.id === meId || personKey.startsWith("m-");
  return {
    personKey,
    kind: person.id === meId ? "member" : person.kind,
    name: ofHousehold ? null : person.name,
    allergies: person.allergies,
    tastes: person.tastes,
    drink: person.drink,
  };
}

/** A stored row as the app's person: the signed-in member's own row is "Du" (id "me"), as on a phone that never had an account. */
export function personFromRow(row: FoodProfileRow, meUserId: string | null): Person | null {
  const mine = meUserId !== null && row.personKey === memberPersonId(meUserId);
  return parsePerson({ ...row, id: mine ? meId : row.personKey, name: mine ? "Du" : (row.name ?? "Medlem"), kind: mine ? "member" : row.kind });
}

/** Whether anything is filled in. An empty member needs no row (no row means "eats anything"); a kept guest always has one. */
export function hasContent(person: Person): boolean {
  const ofHousehold = person.id === meId || person.id.startsWith("m-");
  return (
    !ofHousehold ||
    person.allergies.length > 0 ||
    Object.keys(person.tastes).length > 0 ||
    person.drink !== null
  );
}

/** The people to import from this device: those with something filled in that the household has no row for. Nothing stored is overwritten. */
export function peopleToImport(local: readonly Person[], storedKeys: ReadonlySet<string>, meUserId: string | null): Person[] {
  return local.filter((person) => {
    const key = personKeyOf(person.id, meUserId);
    return key !== null && !storedKeys.has(key) && hasContent(person);
  });
}

/** The household's people for a server reader: the members (empty preferences without a row), then the people kept by hand. */
export function combineFoodPreferences(members: readonly { id: string; name: string; isMe: boolean }[], rows: readonly FoodProfileRow[]): HouseholdFoodPreferences {
  const byKey = new Map(rows.map((row) => [row.personKey, row]));
  const people: HouseholdFoodPerson[] = members.map((member) => {
    const key = memberPersonId(member.id);
    const row = byKey.get(key);
    return {
      personKey: key,
      kind: "member",
      name: newPerson(key, member.name, "member").name || "Medlem",
      allergies: row?.allergies ?? [],
      tastes: row?.tastes ?? {},
      drink: row?.drink ?? null,
      ...tasteLists(row?.tastes ?? {}),
    };
  });
  for (const row of rows) {
    // A member who left the household is hidden, as on the phones.
    if (row.personKey.startsWith("m-")) continue;
    people.push({ ...row, name: row.name ?? "Medlem", ...tasteLists(row.tastes) });
  }
  return { people };
}
