import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeIngredientText } from "@/features/catalog";
import { loadNutritionByNames } from "@/features/nutrition/data/queries";
import { KOSTRAD_GROUPS } from "@/features/nutrition";
import { adminClient, anonClient, createTestUser, deleteTestUsers, localSql, type TestUser } from "./support";

// ingredient_nutrition against local Supabase: reference data that signed-in
// users can read and nobody can change through the API.

let user: TestUser;

beforeAll(async () => {
  user = await createTestUser("nutrition");
});

afterAll(async () => {
  await deleteTestUsers();
});

describe("ingredient_nutrition", () => {
  it("is readable by a signed-in user", async () => {
    const { data, error } = await user.db.from("ingredient_nutrition").select("*", { count: "exact" }).eq("normalized_name", "morot");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ kostrad_group: "gronsak", lmv_number: 289 });
    expect(data![0].kcal).toBeGreaterThan(0);
  });

  it("seeds only known groups, and values only for counted ones", async () => {
    const { data, error } = await adminClient().from("ingredient_nutrition").select("kostrad_group, kcal").limit(2000);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(400);
    for (const row of data!) {
      expect(KOSTRAD_GROUPS).toContain(row.kostrad_group);
      expect(row.kcal === null).toBe(row.kostrad_group === "ej_raknad");
    }
  });

  it("is not readable without a session", async () => {
    const { data, error } = await anonClient().from("ingredient_nutrition").select("normalized_name").limit(1);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("cannot be written by a signed-in user", async () => {
    const insert = await user.db
      .from("ingredient_nutrition")
      .insert({ normalized_name: "testvara", kostrad_group: "ovrigt", kcal: 1, protein_g: 0, fat_g: 0, carbs_g: 0, fiber_g: 0, lmv_number: 1 });
    // 42501: insufficient privilege (no grant), for the signed-in user and for the service role alike
    expect(insert.error?.code).toBe("42501");
    const update = await user.db.from("ingredient_nutrition").update({ kcal: 1 }).eq("normalized_name", "morot").select();
    expect(update.error?.code).toBe("42501");
    const remove = await user.db.from("ingredient_nutrition").delete().eq("normalized_name", "morot").select();
    expect(remove.error?.code).toBe("42501");
    const service = await adminClient()
      .from("ingredient_nutrition")
      .insert({ normalized_name: "testvara", kostrad_group: "ovrigt", kcal: 1, protein_g: 0, fat_g: 0, carbs_g: 0, fiber_g: 0, lmv_number: 1 });
    expect(service.error?.code).toBe("42501");
    const { data } = await adminClient().from("ingredient_nutrition").select("kcal").eq("normalized_name", "morot").single();
    expect(data!.kcal).not.toBe(1);
  });

  it("refuses rows that break the checks, each by its own constraint", () => {
    // Run as the database owner (the service role has no insert grant), so only the checks can refuse.
    const insert = (name: string, group: string, kcal: string, lmv = "1", extra = "") =>
      localSql(
        `insert into public.ingredient_nutrition (normalized_name, kostrad_group, kcal, protein_g, fat_g, carbs_g, fiber_g, lmv_number, grams_per_slice)
         values ('${name}', '${group}', ${kcal}, ${kcal === "null" ? "null" : 0}, ${kcal === "null" ? "null" : 0}, ${kcal === "null" ? "null" : 0}, ${kcal === "null" ? "null" : 0}, ${lmv}, ${extra || "null"}) returning normalized_name`,
      );
    // A row that is fine goes in, so the cases below fail for their own reason; it is removed again.
    expect(() => insert("teststrul", "ovrigt", "1")).not.toThrow();
    localSql("delete from public.ingredient_nutrition where normalized_name = 'teststrul' returning normalized_name");
    expect(() => insert("teststrul", "okänd", "1")).toThrow(/ingredient_nutrition_group_check/);
    expect(() => insert("Stor", "ovrigt", "1")).toThrow(/ingredient_nutrition_name_check/);
    // ej_raknad must have no values and no food number; a counted group must have all of them
    expect(() => insert("teststrul", "ej_raknad", "1")).toThrow(/ingredient_nutrition_values_check/);
    expect(() => insert("teststrul", "ovrigt", "null", "null")).toThrow(/ingredient_nutrition_values_check/);
    expect(() => insert("teststrul", "ovrigt", "5000")).toThrow(/ingredient_nutrition_amounts_check/);
    expect(() => insert("teststrul", "ovrigt", "1", "1", "0")).toThrow(/ingredient_nutrition_amounts_check/);
    expect(() => insert("morot", "ovrigt", "1")).toThrow(/ingredient_nutrition_pkey/);
    expect(() =>
      localSql(
        "insert into public.ingredient_nutrition (normalized_name, kostrad_group, kcal, protein_g, fat_g, carbs_g, fiber_g, lmv_number, grams_per_package) values ('teststrul', 'ovrigt', 1, 0, 0, 0, 0, 1, 0) returning normalized_name",
      ),
    ).toThrow(/ingredient_nutrition_package_check/);
  });

  it("has package weights, which loadNutritionByNames reads as gramsPerPackage", async () => {
    const found = await loadNutritionByNames(user.db, ["krossade tomater", "färsk basilika", "morot"]);
    expect(found["krossade tomater"].gramsPerPackage).toBe(400);
    expect(found["färsk basilika"].gramsPerPackage).toBe(20);
    expect(found.morot.gramsPerPackage).toBeNull();
  });

  it("loadNutritionByNames finds rows by normalised name and leaves the rest out", async () => {
    const found = await loadNutritionByNames(user.db, ["morot", normalizeIngredientText("Kycklingfilé"), "salt", "finnsinte", ""]);
    expect(Object.keys(found).sort()).toEqual(["kycklingfilé", "morot", "salt"]);
    expect(found.morot.per100g?.kcal).toBeGreaterThan(0);
    expect(found.salt).toMatchObject({ group: "ej_raknad", per100g: null, lmvNumber: null });
    expect(found["kycklingfilé"].group).toBe("fagel");
  });

  it("loadNutritionByNames handles more than one chunk of names", async () => {
    const names = Array.from({ length: 250 }, (_, index) => `varan ${index}`);
    expect(await loadNutritionByNames(user.db, [...names, "morot"])).toHaveProperty("morot");
  });
});
