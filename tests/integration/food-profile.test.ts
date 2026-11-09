import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importFoodProfilesIn, listFoodProfilesIn, removeFoodProfileIn, saveFoodProfileIn } from "@/features/menu-advisor/data/food-profile";
import type { FoodProfileRow } from "@/features/menu-advisor/domain/food-profile";
import { adminClient, anonClient, createTestUser, deleteTestUsers, householdOf, moveToHousehold, type TestUser } from "./support";

// Matpreferenser per hushåll: a household's profiles are read and written by its members only, never seen or changed
// from another household, and the checks refuse what the app would not write. household-isolation.test.ts tries the
// table against B and anon with the other tables; this file tries what is particular to food_profile.

let a: TestUser;
let a2: TestUser;
let b: TestUser;
let outsider: TestUser;
let householdA: string;
let householdB: string;

const row = (personKey: string, extra: Partial<FoodProfileRow> = {}): FoodProfileRow => ({
  personKey,
  kind: "guest",
  name: "Gäst",
  allergies: [],
  tastes: {},
  dislikes: [],
  likes: [],
  drink: null,
  ...extra,
});
const key = () => `p-${randomUUID()}`;
const keys = async (user: TestUser) => (await listFoodProfilesIn(user.db)).map((entry) => entry.personKey);

/** A raw insert as a member, to try what the checks refuse. */
const insert = (user: TestUser, values: Record<string, unknown>) =>
  user.db.from("food_profile").insert({ person_key: key(), kind: "guest", name: "Gäst", ...values } as never);

beforeAll(async () => {
  a = await createTestUser("food-a");
  a2 = await createTestUser("food-a2");
  b = await createTestUser("food-b");
  outsider = await createTestUser("food-outsider");
  householdA = await householdOf(a.id);
  householdB = await householdOf(b.id);
  await moveToHousehold(a2, householdA);
  // No membership: the outsider's own household is removed, so my_household_id() is null.
  await adminClient().from("household_member").delete().eq("user_id", outsider.id);
});

afterAll(async () => {
  await adminClient().from("household").delete().eq("id", householdA);
  await deleteTestUsers();
});

describe("food_profile", () => {
  it("saves a person for the household, as the caller, and every member sees and changes it", async () => {
    const k = key();
    await saveFoodProfileIn(a.db, row(k, { name: "Bo", allergies: ["gluten", "notter"], tastes: { fisk: -2, pasta: 1 }, dislikes: ["koriander"], likes: ["pasta"], drink: "vin" }));
    const stored = await adminClient().from("food_profile").select("household_id, user_id, saved").eq("person_key", k).single();
    expect(stored.data).toEqual({ household_id: householdA, user_id: a.id, saved: true });

    const seen = (await listFoodProfilesIn(a2.db)).find((entry) => entry.personKey === k);
    expect(seen).toEqual(row(k, { name: "Bo", allergies: ["gluten", "notter"], tastes: { fisk: -2, pasta: 1 }, dislikes: ["koriander"], likes: ["pasta"], drink: "vin" }));

    await saveFoodProfileIn(a2.db, row(k, { name: "Bo", drink: "ol" }));
    const changed = (await listFoodProfilesIn(a.db)).find((entry) => entry.personKey === k);
    expect(changed).toMatchObject({ drink: "ol", allergies: [], tastes: {} });
    const rows = await adminClient().from("food_profile").select("id").eq("household_id", householdA).eq("person_key", k);
    expect(rows.data).toHaveLength(1);
  });

  it("keeps a member's row without a name, under the member key", async () => {
    const k = `m-${a2.id}`;
    await saveFoodProfileIn(a.db, row(k, { kind: "member", name: null, drink: "kaffe" }));
    expect((await listFoodProfilesIn(a2.db)).find((entry) => entry.personKey === k)).toMatchObject({ kind: "member", name: null, drink: "kaffe" });
    await removeFoodProfileIn(a2.db, k);
  });

  it("never lets another household see, change or remove it", async () => {
    const k = key();
    await saveFoodProfileIn(a.db, row(k, { name: "Hemlig", allergies: ["agg"] }));
    expect(await keys(b)).not.toContain(k);
    const update = await b.db.from("food_profile").update({ name: "Kapad" }).eq("person_key", k).select("id");
    expect(update.data).toEqual([]);
    await removeFoodProfileIn(b.db, k);
    expect(await keys(a)).toContain(k);
    expect((await listFoodProfilesIn(a.db)).find((entry) => entry.personKey === k)?.name).toBe("Hemlig");
  });

  it("lets the same person key exist in two households, each with its own row", async () => {
    const k = key();
    await saveFoodProfileIn(a.db, row(k, { name: "Likadan", drink: "vin" }));
    await saveFoodProfileIn(b.db, row(k, { name: "Likadan", drink: "ol" }));
    expect((await listFoodProfilesIn(a.db)).find((entry) => entry.personKey === k)?.drink).toBe("vin");
    expect((await listFoodProfilesIn(b.db)).find((entry) => entry.personKey === k)?.drink).toBe("ol");
    await removeFoodProfileIn(b.db, k);
  });

  it("refuses a row for another household, and a changed owner, key or kind", async () => {
    const forB = await a.db.from("food_profile").insert({ household_id: householdB, person_key: key(), kind: "guest", name: "X" } as never);
    expect(forB.error).not.toBeNull();
    const k = key();
    await saveFoodProfileIn(a.db, row(k));
    for (const change of [{ household_id: householdB }, { user_id: a2.id }, { person_key: key() }, { kind: "member" }]) {
      const result = await a.db.from("food_profile").update(change as never).eq("person_key", k);
      expect(result.error, JSON.stringify(change)).not.toBeNull();
    }
  });

  it("denies someone who is not a member of a household, and anon", async () => {
    expect((await insert(outsider, {})).error).not.toBeNull();
    expect(await keys(outsider)).toEqual([]);
    const anon = await anonClient().from("food_profile").select("id");
    expect(anon.error).not.toBeNull();
    const anonInsert = await insert({ db: anonClient() } as TestUser, {});
    expect(anonInsert.error).not.toBeNull();
  });

  it("refuses what the app would never write", async () => {
    const bad: [string, Record<string, unknown>][] = [
      ["an allergy that does not exist", { allergies: ["pollen"] }],
      ["a repeated-out-of-range allergy list", { allergies: ["gluten", "laktos", "notter", "skaldjur", "agg", "fisk", "soja", "sesam", "gluten"] }],
      ["a taste of 3", { tastes: { kott: 3 } }],
      ["a taste of 0", { tastes: { kott: 0 } }],
      ["an unknown taste key", { tastes: { sten: 1 } }],
      ["a taste that is text", { tastes: { kott: "mycket" } }],
      ["tastes as a list", { tastes: [1] }],
      ["31 tags", { dislikes: Array.from({ length: 31 }, (_, i) => `t${i}`) }],
      ["a tag of 41 characters", { likes: ["x".repeat(41)] }],
      ["an empty tag", { likes: [""] }],
      ["a tag with markup", { dislikes: ["<script>"] }],
      ["a tag with braces", { likes: ["{x}"] }],
      ["a tag with a web address", { likes: ["http://x.se"] }],
      ["a tag with spaces around it", { likes: [" lök"] }],
      ["a drink that does not exist", { drink: "mjölk" }],
      ["a kind that does not exist", { kind: "robot" }],
      ["a guest without a name", { kind: "guest", name: null }],
      ["a name with markup", { name: "<b>x</b>" }],
      ["a name of 41 characters", { name: "x".repeat(41) }],
      ["a person key with a space", { person_key: "p a" }],
      ["an empty person key", { person_key: "" }],
    ];
    for (const [what, values] of bad) {
      const result = await insert(a, values);
      expect(result.error, what).not.toBeNull();
    }
    expect(await insert(a, { tastes: { kott: 2, sott: -2 }, dislikes: ["x".repeat(40)], allergies: ["gluten"] })).toMatchObject({ error: null });
  });

  it("imports only the people the household has no row for, and leaves a row that exists as it is", async () => {
    const existing = key();
    const fresh = key();
    await saveFoodProfileIn(a.db, row(existing, { name: "Kvar", drink: "vin", allergies: ["soja"] }));
    await importFoodProfilesIn(a2.db, [row(existing, { name: "Överskriven", drink: "ol" }), row(fresh, { name: "Ny", drink: "kaffe" })]);
    const all = await listFoodProfilesIn(a.db);
    expect(all.find((entry) => entry.personKey === existing)).toMatchObject({ name: "Kvar", drink: "vin", allergies: ["soja"] });
    expect(all.find((entry) => entry.personKey === fresh)).toMatchObject({ name: "Ny", drink: "kaffe" });
    await importFoodProfilesIn(a2.db, [row(fresh, { name: "Ändrad" })]);
    expect((await listFoodProfilesIn(a.db)).find((entry) => entry.personKey === fresh)?.name).toBe("Ny");
  });

  it("follows updated_at on every change", async () => {
    const k = key();
    await saveFoodProfileIn(a.db, row(k));
    const before = await adminClient().from("food_profile").select("created_at, updated_at").eq("person_key", k).eq("household_id", householdA).single();
    await new Promise((resolve) => setTimeout(resolve, 15));
    await saveFoodProfileIn(a.db, row(k, { drink: "vin" }));
    const after = await adminClient().from("food_profile").select("created_at, updated_at").eq("person_key", k).eq("household_id", householdA).single();
    expect(after.data?.created_at).toBe(before.data?.created_at);
    expect(new Date(after.data!.updated_at).getTime()).toBeGreaterThan(new Date(before.data!.updated_at).getTime());
  });

  it("stops at 60 people per household, with the service role's insert too", async () => {
    const admin = adminClient();
    const have = (await admin.from("food_profile").select("id", { count: "exact", head: true }).eq("household_id", householdB)).count ?? 0;
    const more = Array.from({ length: 60 - have }, () => ({ household_id: householdB, user_id: b.id, person_key: key(), kind: "guest", name: "G" }));
    expect((await admin.from("food_profile").insert(more)).error).toBeNull();
    const over = await insert(b, {});
    expect(over.error?.code).toBe("MK429");
    await admin.from("food_profile").delete().eq("household_id", householdB);
  });

  it("goes away with its household", async () => {
    const k = key();
    await saveFoodProfileIn(b.db, row(k));
    await adminClient().from("household").delete().eq("id", householdB);
    const left = await adminClient().from("food_profile").select("id").eq("household_id", householdB);
    expect(left.data).toEqual([]);
  });
});
