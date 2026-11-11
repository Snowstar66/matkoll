import { allergenHits, type AllergenHit } from "./allergens";
import { type DrinkKind, drinkKinds, type Person, type TasteKey } from "./profile";
import { allergenLabels } from "./labels";
import { foldLegacyTags, parseTastes, tasteLists } from "./tastes";
import { type MenuAllergen, type MenuDish, menuAllergens } from "./types";

// Managing the people the advisor chooses for: the saved profiles (read from storage, never trusted), adding,
// changing and removing, who is with tonight, and who a dish does not suit. Pure; storage itself is ui/use-people.

/** The one built-in person: whoever holds the phone. Always there, never removed. */
export const meId = "me";
export const maxPeople = 20;
export const maxNameLength = 40;

export const tasteLabels: Readonly<Record<TasteKey, string>> = {
  kott: "Kött",
  fisk: "Fisk",
  skaldjur: "Skaldjur",
  vegetariskt: "Vegetariskt",
  pasta: "Pasta",
  pizza: "Pizza",
  starkt: "Starkt",
  sott: "Sött",
};

export const drinkLabels: Readonly<Record<DrinkKind, string>> = {
  vatten: "Vatten",
  lask: "Läsk",
  ol: "Öl",
  vin: "Vin",
  cocktail: "Cocktail",
  kaffe: "Kaffe",
  ingen: "Ingen dryck",
};

export const drinkIcons: Readonly<Record<DrinkKind, string>> = {
  vatten: "💧",
  lask: "🥤",
  ol: "🍺",
  vin: "🍷",
  cocktail: "🍹",
  kaffe: "☕",
  ingen: "🚫",
};

export function newPerson(id: string, name: string, kind: Person["kind"]): Person {
  return { id, name: name.trim().slice(0, maxNameLength), kind, allergies: [], tastes: {}, drink: null };
}

/** The built-in "Du". */
export const me: Person = newPerson(meId, "Du", "member");

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** One stored person, or null when it is not one. Unknown fields are dropped; bad parts fall back to "nothing filled in". */
export function parsePerson(value: unknown): Person | null {
  if (!isRecord(value)) return null;
  const { id, name, kind } = value;
  if (typeof id !== "string" || id === "" || id.length > 80) return null;
  if (typeof name !== "string" || name.trim() === "") return null;
  if (kind !== "member" && kind !== "guest") return null;
  const allergies = Array.isArray(value.allergies)
    ? [...new Set(value.allergies.filter((entry): entry is MenuAllergen => (menuAllergens as readonly unknown[]).includes(entry)))]
    : [];
  // The older free lists (Undviker / Älskar) are folded into the tastes; saving the person drops them.
  const tastes = foldLegacyTags(parseTastes(value.tastes), value.dislikes, value.likes);
  const drink = (drinkKinds as readonly unknown[]).includes(value.drink) ? (value.drink as DrinkKind) : null;
  return { id, name: name.trim().slice(0, maxNameLength), kind, allergies, tastes, drink };
}

/** The saved people from the stored text: `{ v: 1, people: [...] }`. Anything broken gives an empty list; a bad entry is skipped. */
export function parsePeople(text: string | null): Person[] {
  if (!text) return [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!isRecord(data) || data.v !== 1 || !Array.isArray(data.people)) return [];
  const seen = new Set<string>();
  const people: Person[] = [];
  for (const entry of data.people) {
    const person = parsePerson(entry);
    if (!person || seen.has(person.id)) continue;
    seen.add(person.id);
    people.push(person);
    if (people.length >= maxPeople) break;
  }
  return people;
}

export function serializePeople(people: readonly Person[]): string {
  return JSON.stringify({ v: 1, people });
}

/** The saved people with "Du" first; "Du" is added (empty) when nothing was saved for it. */
export function withMe(people: readonly Person[]): Person[] {
  const mine = people.find((person) => person.id === meId) ?? me;
  return [{ ...mine, kind: "member" }, ...people.filter((person) => person.id !== meId)];
}

/** A household member as the page hands it over (read on the server): the profile data is added from this device. */
export type HouseholdPerson = { id: string; name: string; isMe: boolean };

const memberPrefix = "m-";

/** The profile id of a household member (stable per member, so it follows the member between devices' names). */
export function memberPersonId(userId: string): string {
  return `${memberPrefix}${userId}`;
}

/** Whether this person comes from the household (name and presence are not editable here). */
export function isHouseholdPerson(person: Pick<Person, "id">): boolean {
  return person.id === meId || person.id.startsWith(memberPrefix);
}

/**
 * The saved people with the household's members merged in: "Du", then the other members by name (taste, drink and
 * allergies from what is saved for their id, empty otherwise), then the people added by hand. With no member list
 * (null: it could not be read) the saved people stand as they are; a saved member that is gone from the list is hidden.
 */
export function withMembers(saved: readonly Person[], members: readonly HouseholdPerson[] | null): Person[] {
  const base = withMe(saved);
  if (!members) return base;
  const [mine, ...rest] = base;
  const others = members
    .filter((member) => !member.isMe)
    .map((member) => {
      const id = memberPersonId(member.id);
      const stored = rest.find((person) => person.id === id);
      return { ...(stored ?? newPerson(id, member.name, "member")), name: member.name.trim().slice(0, maxNameLength) || "Medlem", kind: "member" as const };
    });
  const byHand = rest.filter((person) => !person.id.startsWith(memberPrefix));
  return [mine, ...others, ...byHand];
}

/**
 * Where the household's profiles are listed (Inställningar → Medlemmar), and the page of one person. The person is a
 * query parameter, not a path segment: a dynamic segment under Inställningar makes the settings shell (it reads the
 * selected segment) block prerendering.
 */
export const profilesHref = "/installningar/medlemmar#smak-och-allergier";
export const profilesBackHref = "/installningar/medlemmar";
export function profileHref(personId: string): string {
  return `/installningar/medlemmar/smak-och-allergier?person=${encodeURIComponent(personId)}`;
}

/** One short line for a list row: "Allergi: gluten · Undviker: vitlök", or "Inget ifyllt: äter allt". */
export function profileSummary(person: Person): string {
  const { dislikes, likes } = tasteLists(person.tastes);
  const parts = [
    person.allergies.length > 0 ? `Allergi: ${person.allergies.map((allergen) => allergenLabels[allergen].toLowerCase()).join(", ")}` : null,
    dislikes.length > 0 ? `Undviker: ${dislikes.join(", ")}` : null,
    likes.length > 0 ? `Älskar: ${likes.join(", ")}` : null,
    person.drink ? drinkLabels[person.drink] : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Inget ifyllt: äter allt";
}

/** Adds the person, or replaces the one with the same id. Beyond maxPeople a new person is not added. */
export function upsertPerson(people: readonly Person[], person: Person): Person[] {
  if (people.some((entry) => entry.id === person.id)) return people.map((entry) => (entry.id === person.id ? person : entry));
  return people.length >= maxPeople ? [...people] : [...people, person];
}

export function removePerson(people: readonly Person[], id: string): Person[] {
  return id === meId ? [...people] : people.filter((person) => person.id !== id);
}

export function toggleAllergy(person: Person, allergen: MenuAllergen): Person {
  const allergies = person.allergies.includes(allergen) ? person.allergies.filter((entry) => entry !== allergen) : [...person.allergies, allergen];
  return { ...person, allergies: menuAllergens.filter((entry) => allergies.includes(entry)) };
}

/** Who a dish does not suit: the people whose allergies the dish has or may have, with the hits. */
export type Unfit = { person: Person; hits: AllergenHit[] };

export function unfitFor(dish: Pick<MenuDish, "allergener" | "kan_innehalla">, company: readonly Person[]): Unfit[] {
  return company.flatMap((person) => {
    const hits = allergenHits(dish, person.allergies);
    return hits.length > 0 ? [{ person, hits }] : [];
  });
}
