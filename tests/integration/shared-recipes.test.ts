import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { matchIngredientsIn } from "@/features/catalog/actions/match-ingredients";
import { commitIngredients } from "@/features/catalog/data/commit";
import { getSharedIn, listSharedIn, saveSharedIn, saversIn, setSharedIn, sharingIn } from "@/features/recipes/data/shared";
import { sharedChoices, sharedMatchItems } from "@/features/recipes/domain/shared-recipe";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, anonClient, createTestUser, deleteTestUsers, householdOf, type Db, type TestUser } from "./support";

// Delade recept (supabase/migrations/20261108150000_shared_recipes.sql) with two households:
// A (Lindqvists) shares, B (Bergs) finds, uses and saves. Nothing of A's is readable by B but
// through the security definer functions, only while it is shared, and only the recipe itself.

let a: TestUser;
let b: TestUser;
let householdA: string;
let householdB: string;
/** A's catalog ingredients, by name. */
const aIngredients = new Map<string, string>();

async function addIngredient(db: Db, name: string, section = "Kött och fisk"): Promise<string> {
  const { data, error } = await db
    .from("ingredient")
    .insert({ name, normalized_name: name.toLowerCase(), section, location: "Kyl" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** A recipe of `db`'s household with two steps and three lines (two with an ingredient, one vague without). */
async function addRecipe(db: Db, title: string, chicken: string, cream: string): Promise<string> {
  const { data, error } = await db.rpc("save_recipe", {
    recipe: {
      id: randomUUID(),
      title,
      original_servings: 4,
      total_minutes: 45,
      image_url: "https://img.example.test/caesar.jpg",
      source_kind: "url",
      source_url: "https://www.tasteline.com/recept/caesarkyckling",
    },
    steps: [
      { position: 0, text: "Stek kycklingen i 10 minuter.", title: "Kyckling" },
      { position: 1, text: "Servera." },
    ],
    lines: [
      { position: 0, original_text: "600 g kycklingfilé", amount: 600, unit: "g", is_vague: false, ingredient_id: chicken, step_position: 0, section: "Kyckling" },
      { position: 1, original_text: "2 dl grädde", amount: 2, unit: "dl", is_vague: false, ingredient_id: cream, step_position: 1 },
      { position: 2, original_text: "salt", amount: null, unit: null, is_vague: true, ingredient_id: null, step_position: null },
    ],
  } as never);
  if (error) throw error;
  return data as unknown as string;
}

async function rowOf(id: string) {
  const { data, error } = await adminClient().from("recipe").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

/** What B saves: the shared recipe's lines matched to B's own catalog by name, then the copy. */
async function saveAsB(id: string): Promise<{ copyId: string | null; ingredientIds: (string | null)[] }> {
  const shared = await getSharedIn(b.db, id);
  if (!shared) return { copyId: null, ingredientIds: [] };
  const matches = await matchIngredientsIn(b.db, sharedMatchItems(shared.lines));
  const ingredientIds = await commitIngredients(b.db, sharedChoices(shared.lines, matches));
  return { copyId: shared.savedCopyId ?? (await saveSharedIn(b.db, id, ingredientIds)), ingredientIds };
}

/** Everything a function gave B, as text, for what must never be in it. */
function leaks(answer: unknown): string[] {
  const text = JSON.stringify(answer);
  const secrets = [a.id, a.email, householdA, ...aIngredients.values(), "matkoll.test", "is_favorite", "offer_names", "user_id", "household_id"];
  return secrets.filter((secret) => text.includes(secret));
}

let recipeA = "";
let otherA = "";

beforeAll(async () => {
  localSupabaseUrl();
  a = await createTestUser("delade-a");
  b = await createTestUser("delade-b");
  householdA = await householdOf(a.id);
  householdB = await householdOf(b.id);
  expect((await a.db.rpc("rename_household", { new_name: "Lindqvists" })).error).toBeNull();
  expect((await b.db.rpc("rename_household", { new_name: "Bergs" })).error).toBeNull();
  aIngredients.set("Kycklingfilé", await addIngredient(a.db, "Kycklingfilé"));
  aIngredients.set("Grädde", await addIngredient(a.db, "Grädde", "Mejeri"));
  recipeA = await addRecipe(a.db, "Caesarkyckling", aIngredients.get("Kycklingfilé")!, aIngredients.get("Grädde")!);
  otherA = await addRecipe(a.db, "Kycklinggryta", aIngredients.get("Kycklingfilé")!, aIngredients.get("Grädde")!);
  // Things of A's that are never shared: the heart and the offers it was saved from.
  expect((await a.db.from("recipe").update({ is_favorite: true, offer_names: ["Kycklingfilé"] }).eq("id", recipeA)).error).toBeNull();
  // B already has chicken in its catalog (matched by name); cream it lacks (created when saving).
  await addIngredient(b.db, "Kycklingfilé");
});

afterAll(async () => {
  await deleteTestUsers();
});

describe("Delade recept", () => {
  it("keeps an unshared recipe from B in every function and table, and from anon", async () => {
    expect((await listSharedIn(b.db)).map((row) => row.id)).not.toContain(recipeA);
    expect(await getSharedIn(b.db, recipeA)).toBeNull();
    expect((await b.db.rpc("save_shared_recipe", { shared_recipe_id: recipeA, ingredient_ids: [null, null, null] as never })).error?.code).toBe("P0002");
    expect(await saversIn(b.db, recipeA)).toEqual([]);
    expect((await b.db.from("recipe").select("id").eq("id", recipeA)).data).toEqual([]);
    expect((await b.db.from("recipe_ingredient").select("id").eq("recipe_id", recipeA)).data).toEqual([]);
    expect((await b.db.from("household").select("name").eq("id", householdA)).data).toEqual([]);
    const anon = anonClient();
    for (const [name, args] of [
      ["list_shared_recipes", {}],
      ["get_shared_recipe", { shared_recipe_id: recipeA }],
      ["save_shared_recipe", { shared_recipe_id: recipeA, ingredient_ids: [] }],
      ["shared_recipe_savers", { own_recipe_id: recipeA }],
      ["recipe_sharing", {}],
      ["set_recipe_share_all", { share: true }],
      ["stop_sharing_recipes", {}],
    ] as const) {
      expect((await anon.rpc(name, args as never)).error?.code, `anon calls ${name}`).toBe("42501");
    }
  });

  it("shows a shared recipe to B, never to A itself, with only the recipe and no ids or people of A's", async () => {
    const before = await rowOf(recipeA);
    expect(await setSharedIn(a.db, recipeA, true)).toBe(true);
    // Sharing is not an edit: Ändra recept's lock stays.
    expect((await rowOf(recipeA))?.updated_at).toBe(before?.updated_at);
    expect(await setSharedIn(b.db, recipeA, false), "B cannot unshare A's recipe").toBe(false);

    const listed = (await b.db.rpc("list_shared_recipes")).data ?? [];
    const row = listed.find((entry) => entry.id === recipeA);
    expect(row).toMatchObject({ title: "Caesarkyckling", household_name: "Lindqvists", saved_copy_id: null, original_servings: 4, total_minutes: 45 });
    expect(row?.line_texts).toEqual(["600 g kycklingfilé", "2 dl grädde", "salt"]);
    expect(leaks(listed.filter((entry) => entry.id === recipeA)), "the list gives B").toEqual([]);
    expect((await a.db.rpc("list_shared_recipes")).data?.map((entry) => entry.id) ?? [], "A's own").not.toContain(recipeA);
    expect(await getSharedIn(a.db, recipeA), "A opening its own as shared").toBeNull();

    const raw = (await b.db.rpc("get_shared_recipe", { shared_recipe_id: recipeA })).data;
    expect(leaks(raw), "the recipe gives B").toEqual([]);
    const shared = await getSharedIn(b.db, recipeA);
    expect(shared).toMatchObject({
      title: "Caesarkyckling",
      householdName: "Lindqvists",
      imageUrl: "https://img.example.test/caesar.jpg",
      sourceUrl: "https://www.tasteline.com/recept/caesarkyckling",
      savedCopyId: null,
      steps: [{ title: "Kyckling", text: "Stek kycklingen i 10 minuter." }, { title: null, text: "Servera." }],
    });
    expect(shared?.lines.map((line) => [line.ingredientName, line.ingredientSection, line.stepIndex, line.group])).toEqual([
      ["Kycklingfilé", "Kött och fisk", 0, "Kyckling"],
      ["Grädde", "Mejeri", 1, null],
      [null, null, null, null],
    ]);
    // The other recipe is not shared.
    expect(await getSharedIn(b.db, otherA)).toBeNull();
  });

  it("saves exactly one copy in B, on B's own catalog, and tells A who saved it", async () => {
    const first = await saveAsB(recipeA);
    expect(first.copyId).toBeTruthy();
    const second = await saveAsB(recipeA);
    expect(second.copyId, "saving again gives the same copy").toBe(first.copyId);
    // Straight to the function too: the copy already saved.
    expect((await b.db.rpc("save_shared_recipe", { shared_recipe_id: recipeA, ingredient_ids: [] as never })).data).toBe(first.copyId);
    const copies = await adminClient().from("recipe").select("id").eq("household_id", householdB).eq("shared_from_recipe_id", recipeA);
    expect(copies.data).toHaveLength(1);

    const copy = await rowOf(first.copyId!);
    expect(copy).toMatchObject({
      household_id: householdB,
      user_id: b.id,
      title: "Caesarkyckling",
      is_shared: false,
      is_favorite: false,
      offer_names: [],
      shared_from_recipe_id: recipeA,
      shared_from_name: "Lindqvists",
      source_url: "https://www.tasteline.com/recept/caesarkyckling",
      image_url: "https://img.example.test/caesar.jpg",
    });
    const lines = (await adminClient().from("recipe_ingredient").select("*").eq("recipe_id", first.copyId!).order("position")).data ?? [];
    expect(lines.map((line) => line.original_text)).toEqual(["600 g kycklingfilé", "2 dl grädde", "salt"]);
    expect(lines.every((line) => line.household_id === householdB)).toBe(true);
    const ids = lines.flatMap((line) => (line.ingredient_id ? [line.ingredient_id] : []));
    expect(ids).toHaveLength(2);
    const catalog = (await adminClient().from("ingredient").select("id, name, household_id").in("id", ids)).data ?? [];
    expect(catalog.map((row) => [row.name, row.household_id]).sort()).toEqual([
      ["Grädde", householdB],
      ["Kycklingfilé", householdB],
    ]);
    const steps = (await adminClient().from("recipe_step").select("id, position, title").eq("recipe_id", first.copyId!).order("position")).data ?? [];
    expect(steps.map((step) => step.title)).toEqual(["Kyckling", null]);
    expect(lines.map((line) => line.step_id)).toEqual([steps[0].id, steps[1].id, null]);
    expect(lines[0].section).toBe("Kyckling");

    // B's list says it is saved; A sees B's household name, and B none of A's savers.
    expect((await listSharedIn(b.db)).find((row) => row.id === recipeA)?.savedCopyId).toBe(first.copyId);
    expect(await saversIn(a.db, recipeA)).toEqual(["Bergs"]);
    expect(await saversIn(b.db, recipeA)).toEqual([]);
  });

  it("refuses a copy made by hand, a changed origin and another household's catalog", async () => {
    const copyId = (await saveAsB(recipeA)).copyId!;
    expect((await b.db.from("recipe").update({ shared_from_recipe_id: otherA }).eq("id", copyId)).error?.code).toBe("42501");
    expect((await b.db.from("recipe").update({ shared_from_name: "Kapat" }).eq("id", copyId)).error?.code).toBe("42501");
    const forged = await b.db
      .from("recipe")
      .insert({ title: "Kapat", original_servings: 1, source_kind: "text", shared_from_recipe_id: otherA, shared_from_name: "Kapat" })
      .select("id");
    expect(forged.error?.code).toBe("42501");
    // A's other recipe, shared, saved by B with A's catalog ids: the foreign key refuses it.
    expect(await setSharedIn(a.db, otherA, true)).toBe(true);
    const withAIds = await b.db.rpc("save_shared_recipe", {
      shared_recipe_id: otherA,
      ingredient_ids: [aIngredients.get("Kycklingfilé"), aIngredients.get("Grädde"), null] as never,
    });
    expect(withAIds.error?.code).toBe("23503");
    expect((await b.db.rpc("save_shared_recipe", { shared_recipe_id: otherA, ingredient_ids: [null] as never })).error?.code).toBe("22023");
    expect((await adminClient().from("recipe").select("id").eq("household_id", householdB).eq("shared_from_recipe_id", otherA)).data).toEqual([]);
    expect(await setSharedIn(a.db, otherA, false)).toBe(true);
  });

  it("takes a recipe out of Delade at once when A stops, and B's copy stays", async () => {
    const copyId = (await saveAsB(recipeA)).copyId!;
    expect(await setSharedIn(a.db, recipeA, false)).toBe(true);
    expect((await listSharedIn(b.db)).map((row) => row.id)).not.toContain(recipeA);
    expect(await getSharedIn(b.db, recipeA)).toBeNull();
    expect((await b.db.rpc("save_shared_recipe", { shared_recipe_id: recipeA, ingredient_ids: [] as never })).error?.code).toBe("P0002");
    expect(await rowOf(copyId)).not.toBeNull();
  });

  it("shares all of A's recipes and new ones with dela alla, never a saved copy, and Sluta dela alla stops them all", async () => {
    expect(await sharingIn(a.db)).toEqual({ shareAll: false, sharedCount: 0 });
    expect((await a.db.rpc("set_recipe_share_all", { share: true })).data).toBe(2);
    expect(await sharingIn(a.db)).toEqual({ shareAll: true, sharedCount: 2 });
    const later = await addRecipe(a.db, "Pannkakor", aIngredients.get("Kycklingfilé")!, aIngredients.get("Grädde")!);
    expect((await rowOf(later))?.is_shared, "a new recipe is shared").toBe(true);
    expect((await listSharedIn(b.db)).map((row) => row.id)).toEqual(expect.arrayContaining([recipeA, otherA, later]));
    // One recipe stops on its own, with dela alla on.
    expect(await setSharedIn(a.db, later, false)).toBe(true);
    expect(await getSharedIn(b.db, later)).toBeNull();

    // B with dela alla: B's own recipe is shared, its copy of A's is not.
    const copyId = (await saveAsB(recipeA)).copyId!;
    const ownB = await addIngredient(b.db, "Ost", "Mejeri");
    const bRecipe = await addRecipe(b.db, "Ostpaj", ownB, ownB);
    expect((await b.db.rpc("set_recipe_share_all", { share: true })).data).toBe(1);
    expect((await rowOf(bRecipe))?.is_shared).toBe(true);
    expect((await rowOf(copyId))?.is_shared).toBe(false);
    expect((await listSharedIn(a.db)).map((row) => row.id)).toContain(bRecipe);

    expect((await a.db.rpc("stop_sharing_recipes")).data).toBe(2);
    expect(await sharingIn(a.db)).toEqual({ shareAll: false, sharedCount: 0 });
    const left = (await listSharedIn(b.db)).map((row) => row.id);
    for (const id of [recipeA, otherA, later]) expect(left).not.toContain(id);
    // B's own dela alla is B's.
    expect(await sharingIn(b.db)).toEqual({ shareAll: true, sharedCount: 1 });
    expect((await b.db.rpc("stop_sharing_recipes")).data).toBe(1);
  });

  it("keeps B's copy when A deletes the original", async () => {
    // A stopped sharing above; B's copy is the one it saved then.
    const copies = await adminClient().from("recipe").select("id").eq("household_id", householdB).eq("shared_from_recipe_id", recipeA);
    const copyId = copies.data![0].id;
    expect((await a.db.from("recipe").delete().eq("id", recipeA)).error).toBeNull();
    expect(await rowOf(recipeA)).toBeNull();
    const copy = await rowOf(copyId);
    expect(copy).toMatchObject({ title: "Caesarkyckling", shared_from_name: "Lindqvists", image_url: "https://img.example.test/caesar.jpg" });
    expect((await b.db.from("recipe_ingredient").select("id").eq("recipe_id", copyId)).data).toHaveLength(3);
    expect((await b.db.from("recipe_step").select("id").eq("recipe_id", copyId)).data).toHaveLength(2);
  });
});
