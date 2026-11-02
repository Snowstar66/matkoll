import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadCatalogSnapshot } from "@/features/catalog/data/queries";
import { addStapleIn, listStaplesIn, removeStapleIn, resetStaplesIn } from "@/features/pantry/data/staples";
import { isStaple, stapleRules } from "@/features/pantry";
import { adminClient, anonClient, createTestUser, deleteTestUsers, householdOf, localSql, moveToHousehold, type TestUser } from "./support";

// Basvaror (Pontus 2026-11-02): every household has the default staples, from
// the migration's backfill and, for a new one, from the trigger on household;
// a member adds and removes the household's staples, never another
// household's; "Återställ standard" gives the defaults back to the caller's
// household only; at most 200. household-isolation.test.ts tries the table
// against B and anon with the other tables; this file tries what is
// particular to staples.

let a: TestUser;
let a2: TestUser;
let b: TestUser;
let householdA: string;
let householdB: string;

const defaultNames = () => localSql<{ name: string }>("select name from public.household_staple_defaults()").map((row) => row.name);
const names = async (user: TestUser) => (await listStaplesIn(user.db)).map((staple) => staple.name).sort();

beforeAll(async () => {
  a = await createTestUser("staple-a");
  a2 = await createTestUser("staple-a2");
  b = await createTestUser("staple-b");
  householdA = await householdOf(a.id);
  householdB = await householdOf(b.id);
  await moveToHousehold(a2, householdA);
});

afterAll(async () => {
  await adminClient().from("household").delete().eq("id", householdA);
  await deleteTestUsers();
});

describe("household_staple", () => {
  it("gives a new household the default staples, with their limits and no maker", async () => {
    const staples = await listStaplesIn(b.db);
    expect(staples.map((staple) => staple.name).sort()).toEqual(defaultNames().sort());
    expect(staples.find((staple) => staple.name === "Salt")).toMatchObject({ normalizedName: "salt", maxAmount: null, maxUnit: null });
    expect(staples.find((staple) => staple.name === "Vetemjöl")).toMatchObject({ maxAmount: 1, maxUnit: "dl" });
    expect(staples.find((staple) => staple.name === "Smör")).toMatchObject({ maxAmount: 50, maxUnit: "g" });
    const makers = await adminClient().from("household_staple").select("user_id").eq("household_id", householdB);
    expect(new Set(makers.data?.map((row) => row.user_id))).toEqual(new Set([null]));
  });

  it("has given every household there is the defaults, once, however often they are given", () => {
    const missing = localSql<{ id: string }>(`
      select h.id from public.household h
      where (select count(*) from public.household_staple s where s.household_id = h.id) = 0`);
    expect(missing, "households without staples").toEqual([]);
    const before = localSql<{ n: number }>(`select count(*)::int as n from public.household_staple where household_id = '${householdB}'`)[0].n;
    localSql(`select public.household_staple_seed('${householdB}')`);
    expect(localSql<{ n: number }>(`select count(*)::int as n from public.household_staple where household_id = '${householdB}'`)[0].n).toBe(before);
  });

  it("lets a member add one for the household, and refuses the same name twice", async () => {
    const added = await addStapleIn(a.db, "Kardemumma", { maxAmount: 1, maxUnit: "tsk" });
    expect(added).toMatchObject({ kind: "added", staple: { name: "Kardemumma", normalizedName: "kardemumma", maxAmount: 1, maxUnit: "tsk" } });
    expect(await names(a2), "the other member sees it").toContain("Kardemumma");
    expect(await names(b), "another household does not").not.toContain("Kardemumma");
    expect(await addStapleIn(a2.db, "kardemumma", { maxAmount: null, maxUnit: null })).toEqual({ kind: "duplicate" });
    const row = await adminClient().from("household_staple").select("household_id, user_id").eq("normalized_name", "kardemumma").eq("household_id", householdA).single();
    expect(row.data).toEqual({ household_id: householdA, user_id: a.id });
  });

  it("lets a member remove one, gives it back for Ångra, and B can neither remove nor see it", async () => {
    const salt = (await listStaplesIn(a.db)).find((staple) => staple.name === "Salt")!;
    expect(await removeStapleIn(b.db, salt.id), "B removes A's salt").toBeNull();
    expect(await names(a)).toContain("Salt");
    const removed = await removeStapleIn(a2.db, salt.id);
    expect(removed).toMatchObject({ name: "Salt", maxAmount: null });
    expect(await names(a)).not.toContain("Salt");
    expect(await removeStapleIn(a2.db, salt.id), "gone already").toBeNull();
    expect((await addStapleIn(a.db, removed!.name, removed!)).kind).toBe("added");
    expect(await names(a)).toContain("Salt");
  });

  it("never changes a staple in place, and refuses limits the app does not know", async () => {
    const any = (await listStaplesIn(a.db))[0]!;
    const update = await a.db.from("household_staple").update({ max_amount: 9 } as never).eq("id", any.id).select("id");
    expect(update.error?.code).toBe("42501");
    const badUnit = await a.db.from("household_staple").insert({ name: "Ost", normalized_name: "ost", max_amount: 1, max_unit: "st" }).select("id");
    expect(badUnit.error?.code).toBe("23514");
    const halfLimit = await a.db.from("household_staple").insert({ name: "Ost", normalized_name: "ost", max_amount: 1 }).select("id");
    expect(halfLimit.error?.code).toBe("23514");
    const asOther = await a.db.from("household_staple").insert({ name: "Ost", normalized_name: "ost", user_id: a2.id } as never).select("id");
    expect(asOther.error?.code).toBe("42501");
  });

  it("gives the caller's household the defaults back with Återställ standard, and nothing else", async () => {
    const bBefore = await names(b);
    await resetStaplesIn(a2.db);
    expect(await names(a)).toEqual(defaultNames().sort());
    expect(await names(b), "B's are as they were").toEqual(bBefore);
    expect((await anonClient().rpc("reset_household_staples")).error?.code).toBe("42501");
  });

  it("allows at most 200 staples a household", async () => {
    const room = 200 - (await listStaplesIn(b.db)).length;
    const rows = Array.from({ length: room }, (_, index) => ({ name: `Krydda ${index}`, normalized_name: `krydda ${index}` }));
    expect((await b.db.from("household_staple").insert(rows)).error).toBeNull();
    expect(await addStapleIn(b.db, "En till", { maxAmount: null, maxUnit: null })).toEqual({ kind: "limit" });
    await resetStaplesIn(b.db);
  });

  it("matches a recipe line by the catalog ingredient named by a staple, or by its synonym", async () => {
    const pepper = await a.db
      .from("ingredient")
      .insert({ name: "Svartpeppar", normalized_name: "svartpeppar", section: "Skafferi", location: "Skafferi" })
      .select("id")
      .single();
    expect(pepper.error).toBeNull();
    const synonym = await a.db.from("ingredient_synonym").insert({ ingredient_id: pepper.data!.id, normalized: "vitpeppar" });
    expect(synonym.error).toBeNull();
    const staples = await listStaplesIn(a.db);
    const { ingredients, synonyms } = await loadCatalogSnapshot(a.db, staples.map((staple) => staple.normalizedName));
    const ids: Record<string, string[]> = {};
    for (const [name, id] of [...ingredients, ...synonyms]) (ids[name] ??= []).push(id);
    const rules = stapleRules(staples, ids);
    expect(isStaple(rules, { ingredientId: pepper.data!.id, amount: 1, unit: "krm" })).toBe(true);
    expect(isStaple(rules, { ingredientId: null, name: "Svartpeppar", amount: null, unit: null })).toBe(true);
    // B's catalog does not know A's pepper.
    const forB = await loadCatalogSnapshot(b.db, ["svartpeppar"]);
    expect(forB.ingredients.size).toBe(0);
  });
});
