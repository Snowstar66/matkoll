import { describe, expect, it } from "vitest";
import { combineFoodPreferences, type FoodProfileRow, hasContent, peopleToImport, personFromRow, personInputSchema, personKeyOf, rowFromPerson } from "./food-profile";
import { newPerson } from "./people";
import type { Person } from "./profile";

const userId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";

const anna: Person = { ...newPerson("m-" + otherId, "Anna", "member"), allergies: ["notter"], tastes: { fisk: -1 }, dislikes: ["koriander"], likes: ["pasta"], drink: "vin" };

describe("personKeyOf", () => {
  it("gives Du the signed-in member's key, and other ids as they are", () => {
    expect(personKeyOf("me", userId)).toBe(`m-${userId}`);
    expect(personKeyOf("me", null)).toBeNull();
    expect(personKeyOf("p-abc123", null)).toBe("p-abc123");
    expect(personKeyOf("bad id!", userId)).toBeNull();
    expect(personKeyOf("x".repeat(81), userId)).toBeNull();
  });
});

describe("rowFromPerson and personFromRow", () => {
  it("stores Du under the member key without a name, and reads it back as Du", () => {
    const mine = { ...newPerson("me", "Du", "member"), drink: "kaffe" as const, tastes: { pasta: 2 as const } };
    const row = rowFromPerson(mine, userId)!;
    expect(row).toMatchObject({ personKey: `m-${userId}`, kind: "member", name: null, drink: "kaffe", tastes: { pasta: 2 } });
    expect(personFromRow(row, userId)).toMatchObject({ id: "me", name: "Du", kind: "member", drink: "kaffe", tastes: { pasta: 2 } });
  });

  it("keeps the name only for people without an account", () => {
    expect(rowFromPerson(anna, userId)).toMatchObject({ personKey: `m-${otherId}`, name: null });
    const guest = { ...newPerson("p-xyz", "Bo", "guest"), allergies: ["gluten" as const] };
    expect(rowFromPerson(guest, userId)).toMatchObject({ personKey: "p-xyz", kind: "guest", name: "Bo", allergies: ["gluten"] });
    expect(personFromRow(rowFromPerson(guest, userId)!, userId)).toEqual(guest);
  });

  it("gives a member row the placeholder name until the household's name is put on it", () => {
    expect(personFromRow(rowFromPerson(anna, userId)!, userId)).toMatchObject({ id: `m-${otherId}`, name: "Medlem" });
  });

  it("cleans tags and refuses a person that is not one", () => {
    const dirty = { ...anna, dislikes: ["<b>x</b>", " vitlök ", "vitlök"], likes: ["https://x.se"] };
    expect(rowFromPerson(dirty, userId)).toMatchObject({ dislikes: ["vitlök"], likes: [] });
    expect(rowFromPerson({ id: "me" }, userId)).toBeNull();
    expect(rowFromPerson(newPerson("me", "Du", "member"), null)).toBeNull();
  });
});

describe("personInputSchema", () => {
  it("accepts a person and refuses bad tastes, allergies, drinks and long tags", () => {
    expect(personInputSchema.safeParse(anna).success).toBe(true);
    expect(personInputSchema.safeParse({ ...anna, tastes: { fisk: 3 } }).success).toBe(false);
    expect(personInputSchema.safeParse({ ...anna, tastes: { sten: 1 } }).success).toBe(false);
    expect(personInputSchema.safeParse({ ...anna, allergies: ["pollen"] }).success).toBe(false);
    expect(personInputSchema.safeParse({ ...anna, drink: "mjölk" }).success).toBe(false);
    expect(personInputSchema.safeParse({ ...anna, likes: ["x".repeat(41)] }).success).toBe(false);
    expect(personInputSchema.safeParse({ ...anna, likes: Array.from({ length: 31 }, (_, i) => `t${i}`) }).success).toBe(false);
  });
});

describe("peopleToImport", () => {
  const mine = { ...newPerson("me", "Du", "member"), drink: "ol" as const };
  const guest = newPerson("p-g1", "Gäst", "guest");

  it("takes what the household has no row for, and nothing it has", () => {
    const wanted = peopleToImport([mine, anna, guest], new Set([`m-${otherId}`]), userId);
    expect(wanted.map((person) => person.id)).toEqual(["me", "p-g1"]);
  });

  it("skips an empty member (no row means eats anything) but not a named guest, and everything when Du cannot be keyed", () => {
    expect(peopleToImport([newPerson("me", "Du", "member"), newPerson("m-" + otherId, "Anna", "member")], new Set(), userId)).toEqual([]);
    expect(peopleToImport([mine], new Set(), null)).toEqual([]);
    expect(hasContent(guest)).toBe(true);
  });
});

describe("combineFoodPreferences", () => {
  const rows: FoodProfileRow[] = [
    { personKey: `m-${otherId}`, kind: "member", name: null, allergies: ["notter"], tastes: { fisk: -1 }, dislikes: [], likes: ["pasta"], drink: "vin" },
    { personKey: "p-g1", kind: "guest", name: "Bo", allergies: [], tastes: {}, dislikes: [], likes: [], drink: null },
    { personKey: "m-33333333-3333-4333-8333-333333333333", kind: "member", name: null, allergies: ["soja"], tastes: {}, dislikes: [], likes: [], drink: null },
  ];
  const members = [
    { id: userId, name: "Pontus", isMe: true },
    { id: otherId, name: "Anna", isMe: false },
  ];

  it("gives every member by name (empty without a row), then the people kept by hand, and hides a member who left", () => {
    const { people } = combineFoodPreferences(members, rows);
    expect(people.map((person) => [person.personKey, person.name])).toEqual([
      [`m-${userId}`, "Pontus"],
      [`m-${otherId}`, "Anna"],
      ["p-g1", "Bo"],
    ]);
    expect(people[0]).toMatchObject({ allergies: [], tastes: {}, dislikes: [], likes: [], drink: null });
    expect(people[1]).toMatchObject({ allergies: ["notter"], tastes: { fisk: -1 }, likes: ["pasta"], drink: "vin" });
  });

  it("still lists the members when no row could be read", () => {
    expect(combineFoodPreferences(members, []).people).toHaveLength(2);
    expect(combineFoodPreferences([], [])).toEqual({ people: [] });
  });
});
