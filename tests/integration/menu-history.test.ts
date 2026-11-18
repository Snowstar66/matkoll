import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listMenuHistoryIn } from "@/features/mealplan/data/queries";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, createTestUser, deleteTestUsers, type Db, type TestUser } from "./support";

// "Hur ofta på menyn": listMenuHistoryIn reads every dish of every planned week of the household, with its week and weekday,
// and nobody else's, also past the API's 1 000-row page.

let a: TestUser;
let b: TestUser;

async function addRecipe(db: Db, title: string): Promise<string> {
  const id = randomUUID();
  const { error } = await db.rpc("save_recipe", {
    recipe: { id, title, original_servings: 4, total_minutes: 30, image_url: null, source_kind: "text", source_url: null },
    steps: [],
    lines: [{ position: 0, original_text: "1 dl vatten", amount: 1, unit: "dl", is_vague: false, ingredient_id: null, step_position: null }],
  } as never);
  if (error) throw error;
  return id;
}

async function plan(user: TestUser, weekStart: string, dishes: { recipeId: string; title: string; weekday: number | null }[]) {
  const admin = adminClient();
  const made = await admin.from("meal_plan").insert({ user_id: user.id, name: `Vecka ${weekStart}`, is_current: false, week_start: weekStart }).select("id").single();
  if (made.error) throw made.error;
  const rows = dishes.map((dish, index) => ({ user_id: user.id, meal_plan_id: made.data.id, recipe_id: dish.recipeId, recipe_title: dish.title, servings: 4, position: index, weekday: dish.weekday }));
  const inserted = await admin.from("meal_plan_recipe").insert(rows);
  if (inserted.error) throw inserted.error;
}

beforeAll(async () => {
  localSupabaseUrl();
  a = await createTestUser("historik-a");
  b = await createTestUser("historik-b");
});

afterAll(async () => {
  await deleteTestUsers();
});

describe("listMenuHistoryIn", () => {
  it("returns each dish with its week and weekday, from the household only", async () => {
    const soppa = await addRecipe(a.db, "Soppa");
    const gryta = await addRecipe(a.db, "Gryta");
    const other = await addRecipe(b.db, "Annans");
    await plan(a, "2026-09-07", [{ recipeId: soppa, title: "Soppa", weekday: 2 }, { recipeId: gryta, title: "Gryta", weekday: null }]);
    await plan(a, "2026-09-14", [{ recipeId: soppa, title: "Soppa", weekday: 4 }]);
    await plan(b, "2026-09-07", [{ recipeId: other, title: "Annans", weekday: 1 }]);

    const rows = await listMenuHistoryIn(a.db);
    expect(rows.filter((row) => row.recipeId === soppa).map((row) => [row.weekStart, row.weekday]).sort()).toEqual([["2026-09-07", 2], ["2026-09-14", 4]]);
    expect(rows.find((row) => row.recipeId === gryta)).toMatchObject({ weekStart: "2026-09-07", weekday: null });
    expect(rows.some((row) => row.recipeId === other)).toBe(false);
  });

  it("reads past the 1 000-row page", async () => {
    const recipe = await addRecipe(a.db, "Många");
    const admin = adminClient();
    const made = await admin.from("meal_plan").insert({ user_id: a.id, name: "Stor", is_current: false, week_start: "2026-01-05" }).select("id").single();
    if (made.error) throw made.error;
    const rows = Array.from({ length: 1_050 }, (_, index) => ({ user_id: a.id, meal_plan_id: made.data.id, recipe_id: recipe, recipe_title: "Många", servings: 4, position: index, weekday: null }));
    for (let start = 0; start < rows.length; start += 500) {
      const inserted = await admin.from("meal_plan_recipe").insert(rows.slice(start, start + 500));
      if (inserted.error) throw inserted.error;
    }
    const history = await listMenuHistoryIn(a.db);
    expect(history.filter((row) => row.recipeId === recipe)).toHaveLength(1_050);
  });
});
