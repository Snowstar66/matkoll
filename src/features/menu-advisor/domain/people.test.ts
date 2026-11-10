import { describe, expect, it } from "vitest";
import { withTaste } from "./tastes";
import {
  isHouseholdPerson,
  profileHref,
  profileSummary,
  memberPersonId,
  withMembers,
  companySummary,
  maxPeople,
  me,
  meId,
  newPerson,
  parsePeople,
  removePerson,
  serializePeople,
  toggleAllergy,
  unfitFor,
  upsertPerson,
  withMe,
} from "./people";

const anna = { ...newPerson("a", "Anna", "member"), allergies: ["notter" as const], drink: "vin" as const, tastes: { fisk: 2 as const } };

describe("reading stored people", () => {
  it("round-trips what was saved", () => {
    expect(parsePeople(serializePeople([anna]))).toEqual([anna]);
  });

  it("never throws on broken storage: null, junk, wrong version, wrong shape", () => {
    for (const text of [null, "", "{", "[]", "null", '{"v":2,"people":[]}', '{"v":1,"people":"x"}', '{"v":1}']) {
      expect(parsePeople(text)).toEqual([]);
    }
  });

  it("skips a bad entry and keeps the good ones, repairs bad parts and drops what it does not know", () => {
    const text = JSON.stringify({
      v: 1,
      people: [
        null,
        { id: "x" },
        { id: "b", name: "  ", kind: "member" },
        { id: "c", name: "Cia", kind: "alien" },
        { id: "d", name: "Dan", kind: "guest", allergies: ["gluten", "gluten", "kryptonit", 3], tastes: { kott: 9, fisk: -2, pasta: 0, extra: 1 }, drink: "tequila", surprise: 1 },
        { id: "d", name: "Dubbel", kind: "guest" },
      ],
    });
    expect(parsePeople(text)).toEqual([{ id: "d", name: "Dan", kind: "guest", allergies: ["gluten"], tastes: { fisk: -2, extra: 1 }, drink: null }]);
  });

  it("keeps at most maxPeople", () => {
    const many = Array.from({ length: maxPeople + 5 }, (_, index) => newPerson(`p${index}`, `P${index}`, "guest"));
    expect(parsePeople(serializePeople(many))).toHaveLength(maxPeople);
  });
});

describe("managing people", () => {
  it("always has Du first, and a saved Du keeps its profile", () => {
    expect(withMe([])).toEqual([me]);
    const mine = { ...me, allergies: ["agg" as const] };
    expect(withMe([anna, mine]).map((person) => person.id)).toEqual([meId, "a"]);
    expect(withMe([anna, mine])[0].allergies).toEqual(["agg"]);
  });

  it("upserts by id and removes, but never removes Du", () => {
    const changed = upsertPerson([anna], { ...anna, name: "Anna L" });
    expect(changed).toHaveLength(1);
    expect(changed[0].name).toBe("Anna L");
    expect(upsertPerson(changed, newPerson("b", "Bo", "guest"))).toHaveLength(2);
    expect(removePerson([anna, me], "a")).toEqual([me]);
    expect(removePerson([anna, me], meId)).toEqual([anna, me]);
  });

  it("sets a taste and clears it with 0, so nothing filled in means eats anything", () => {
    const hated = withTaste(newPerson("z", "Zed", "guest"), "skaldjur", -2);
    expect(hated.tastes).toEqual({ skaldjur: -2 });
    expect(withTaste(hated, "skaldjur", 0).tastes).toEqual({});
  });

  it("toggles an allergy, keeping the order of the list", () => {
    const one = toggleAllergy(toggleAllergy(newPerson("z", "Zed", "guest"), "soja"), "gluten");
    expect(one.allergies).toEqual(["gluten", "soja"]);
    expect(toggleAllergy(one, "soja").allergies).toEqual(["gluten"]);
  });
});

describe("the company", () => {
  it("is told in a short line: members by name, guests counted", () => {
    const guests = [newPerson("g1", "Gunnar", "guest"), newPerson("g2", "Greta", "guest")];
    expect(companySummary([me, ...guests])).toBe("Du + 2 gäster");
    expect(companySummary([me, anna, guests[0]])).toBe("Du + Anna + 1 gäst");
    expect(companySummary([])).toBe("Ingen vald");
  });

  it("says who a dish does not suit, with the hits, and nobody when no allergies are filled in", () => {
    const dish = { allergener: ["gluten" as const], kan_innehalla: ["notter" as const] };
    const unfit = unfitFor(dish, [me, anna]);
    expect(unfit).toHaveLength(1);
    expect(unfit[0].person.name).toBe("Anna");
    expect(unfit[0].hits).toEqual([{ allergen: "notter", source: "kan_innehalla" }]);
    expect(unfitFor(dish, [me])).toEqual([]);
  });
});

describe("household members as people", () => {
  const members = [
    { id: "u1", name: "Pontus", isMe: true },
    { id: "u2", name: "Martina", isMe: false },
  ];

  it("puts Du first, the other members after, then people added by hand", () => {
    const hand = newPerson("p-1", "Gunnar", "guest");
    expect(withMembers([hand], members).map((person) => person.name)).toEqual(["Du", "Martina", "Gunnar"]);
  });

  it("takes the name from the household and the rest from what is saved for the member id", () => {
    const saved = { ...newPerson(memberPersonId("u2"), "Gammalt namn", "member"), drink: "ol" as const, allergies: ["notter" as const] };
    expect(withMembers([saved], members)[1]).toMatchObject({ id: "m-u2", name: "Martina", drink: "ol", allergies: ["notter"] });
  });

  it("hides a saved member who has left, and keeps everything saved when the members cannot be read", () => {
    const gone = newPerson(memberPersonId("u9"), "Borta", "member");
    expect(withMembers([gone], members).map((person) => person.id)).toEqual(["me", "m-u2"]);
    expect(withMembers([gone], null).map((person) => person.id)).toEqual(["me", "m-u9"]);
    expect(withMembers([], null).map((person) => person.name)).toEqual(["Du"]);
  });

  it("knows which people come from the household", () => {
    expect(isHouseholdPerson({ id: "me" })).toBe(true);
    expect(isHouseholdPerson({ id: memberPersonId("u2") })).toBe(true);
    expect(isHouseholdPerson({ id: "p-1" })).toBe(false);
  });
});

describe("older free-text preferences in storage", () => {
  it("folds Undviker into -2 and Älskar into +2, as the presets they name or as own things", () => {
    const text = JSON.stringify({ v: 1, people: [{ id: "a", name: "Anna", kind: "member", dislikes: [" Koriander ", "koriander", "<img>", "Vitlök"], likes: ["nasi goreng", "Pasta"] }] });
    const [anna] = parsePeople(text);
    expect(anna!.tastes).toEqual({ koriander: -2, vitlok: -2, "nasi goreng": 2, pasta: 2 });
    expect(anna).not.toHaveProperty("dislikes");
    expect(anna).not.toHaveProperty("likes");
  });

  it("never overwrites a taste that is already set, and a thing in both lists is avoided", () => {
    const text = JSON.stringify({ v: 1, people: [{ id: "a", name: "Anna", kind: "member", tastes: { vitlok: 1 }, dislikes: ["vitlök", "ost"], likes: ["Ost", "paprika"] }] });
    expect(parsePeople(text)[0]!.tastes).toEqual({ vitlok: 1, ost: -2, paprika: 2 });
  });

  it("reads people saved before dislikes and likes existed", () => {
    const old = JSON.stringify({ v: 1, people: [{ id: "a", name: "Anna", kind: "member", allergies: ["notter"], tastes: { fisk: 2 }, drink: "vin" }] });
    expect(parsePeople(old)[0]).toMatchObject({ tastes: { fisk: 2 }, allergies: ["notter"] });
  });

  it("round-trips preset and own tastes, and drops bad keys and values", () => {
    const anna = { ...newPerson("a", "Anna", "member"), tastes: { vitlok: -2 as const, "nasi goreng": 2 as const } };
    expect(parsePeople(serializePeople([anna]))).toEqual([anna]);
    const text = JSON.stringify({ v: 1, people: [{ id: "a", name: "Anna", kind: "member", tastes: { "<b>": 1, Vitlok: 1, "-x": 1, ris: 3, soppa: 0, tacos: -1 } }] });
    expect(parsePeople(text)[0]!.tastes).toEqual({ tacos: -1 });
  });

  it("keeps at most 40 own things", () => {
    const tastes = Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`sak ${index}`, 1]));
    expect(Object.keys(parsePeople(JSON.stringify({ v: 1, people: [{ id: "a", name: "Anna", kind: "member", tastes }] }))[0]!.tastes)).toHaveLength(40);
  });
});

describe("profileSummary", () => {
  it("says nothing is filled in when it is empty", () => {
    expect(profileSummary(newPerson("p-1", "Anna", "member"))).toBe("Inget ifyllt: äter allt");
  });

  it("puts allergies first, then what is avoided and loved", () => {
    const person = { ...newPerson("p-1", "Anna", "member"), allergies: ["gluten" as const], tastes: { vitlok: -2 as const, lok: -1 as const, pasta: 1 as const } };
    expect(profileSummary(person)).toBe("Allergi: gluten · Undviker: lök, vitlök · Älskar: pasta");
  });

  it("notes what is avoided and the drink when only those are filled in", () => {
    const person = { ...newPerson("p-1", "Anna", "member"), tastes: { fisk: -1 as const }, drink: "vin" as const };
    expect(profileSummary(person)).toBe("Undviker: fisk · Vin");
  });
});

describe("profileHref", () => {
  it("is the person's page under Medlemmar", () => {
    expect(profileHref("m-abc")).toBe("/installningar/medlemmar/smak-och-allergier?person=m-abc");
  });
});
