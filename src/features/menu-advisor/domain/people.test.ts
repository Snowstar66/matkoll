import { describe, expect, it } from "vitest";
import {
  isHouseholdPerson,
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
  withTaste,
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
    expect(parsePeople(text)).toEqual([{ id: "d", name: "Dan", kind: "guest", allergies: ["gluten"], tastes: { fisk: -2 }, drink: null }]);
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
