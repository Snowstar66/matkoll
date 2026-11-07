import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeIngredientText } from "@/features/catalog";
import { loadNutritionByNames } from "@/features/nutrition/data/queries";
import { KOSTRAD_GROUPS } from "@/features/nutrition";
import { adminClient, anonClient, createTestUser, deleteTestUsers, type TestUser } from "./support";

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
    expect(insert.error).not.toBeNull();
    const update = await user.db.from("ingredient_nutrition").update({ kcal: 1 }).eq("normalized_name", "morot").select();
    expect(update.error).not.toBeNull();
    const remove = await user.db.from("ingredient_nutrition").delete().eq("normalized_name", "morot").select();
    expect(remove.error).not.toBeNull();
    const { data } = await adminClient().from("ingredient_nutrition").select("kcal").eq("normalized_name", "morot").single();
    expect(data!.kcal).not.toBe(1);
  });

  it("refuses rows that break the checks", async () => {
    const admin = adminClient();
    const base = { normalized_name: "teststrul", kcal: 1, protein_g: 0, fat_g: 0, carbs_g: 0, fiber_g: 0, lmv_number: 1 };
    expect((await admin.from("ingredient_nutrition").insert({ ...base, kostrad_group: "okänd" })).error).not.toBeNull();
    expect((await admin.from("ingredient_nutrition").insert({ ...base, kostrad_group: "ovrigt", normalized_name: "Stor" })).error).not.toBeNull();
    // ej_raknad must have no values, a counted group must have all of them
    expect((await admin.from("ingredient_nutrition").insert({ ...base, kostrad_group: "ej_raknad" })).error).not.toBeNull();
    expect((await admin.from("ingredient_nutrition").insert({ ...base, kostrad_group: "ovrigt", kcal: null })).error).not.toBeNull();
    expect((await admin.from("ingredient_nutrition").insert({ ...base, kostrad_group: "ovrigt", kcal: 5000 })).error).not.toBeNull();
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
