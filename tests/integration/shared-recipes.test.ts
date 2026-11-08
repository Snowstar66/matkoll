import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { matchIngredientsIn } from "@/features/catalog/actions/match-ingredients";
import { commitIngredients } from "@/features/catalog/data/commit";
import { getSharedIn, listSharedIn, saveSharedIn, saversIn, setSharedIn, sharingIn } from "@/features/recipes/data/shared";
import { sharedChoices, sharedMatchItems } from "@/features/recipes/domain/shared-recipe";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, anonClient, createTestUser, deleteTestUsers, householdOf, type Db, type TestUser } from "./support";

// Delade recept (supabase/migrations/20261108190000_shared_recipes.sql) with two households:
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
      { position: 1, original_text: "2 dl grädde", amount: 2, unit: "dl", is_vague: false, ingredient_id: cream, step_position: 1, is_staple_marked: true },
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

/** What a household saves: the shared recipe's lines matched to its own catalog by name, then the copy. */
async function saveAs(user: TestUser, id: string): Promise<{ copyId: string | null; ingredientIds: (string | null)[] }> {
  const shared = await getSharedIn(user.db, id);
  if (!shared) return { copyId: null, ingredientIds: [] };
  if (shared.savedCopyId) return { copyId: shared.savedCopyId, ingredientIds: [] };
  const matches = await matchIngredientsIn(user.db, sharedMatchItems(shared.lines));
  const ingredientIds = await commitIngredients(user.db, sharedChoices(shared.lines, matches));
  const saved = await saveSharedIn(user.db, id, ingredientIds, shared.version);
  return { copyId: typeof saved === "string" ? null : saved.id, ingredientIds };
}

const saveAsB = (id: string) => saveAs(b, id);

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
    expect((await b.db.rpc("save_shared_recipe", { shared_recipe_id: recipeA, ingredient_ids: [null, null, null] as never, expected_version: "x" })).error?.code).toBe("P0002");
    expect(await saversIn(b.db, recipeA)).toEqual([]);
    expect((await b.db.from("recipe").select("id").eq("id", recipeA)).data).toEqual([]);
    expect((await b.db.from("recipe_ingredient").select("id").eq("recipe_id", recipeA)).data).toEqual([]);
    expect((await b.db.from("household").select("name").eq("id", householdA)).data).toEqual([]);
    const anon = anonClient();
    for (const [name, args] of [
      ["list_shared_recipes", {}],
      ["get_shared_recipe", { shared_recipe_id: recipeA }],
      ["save_shared_recipe", { shared_recipe_id: recipeA, ingredient_ids: [], expected_version: "x" }],
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
    expect(shared?.lines.map((line) => [line.ingredientName, line.ingredientSection, line.stepIndex, line.group, line.isStapleMarked])).toEqual([
      ["Kycklingfilé", "Kött och fisk", 0, "Kyckling", false],
      ["Grädde", "Mejeri", 1, null, true],
      [null, null, null, null, false],
    ]);
    expect(shared?.version).toMatch(/^[0-9a-f]{32}$/);
    // The other recipe is not shared.
    expect(await getSharedIn(b.db, otherA)).toBeNull();
  });

  it("saves exactly one copy in B, on B's own catalog, and tells A who saved it", async () => {
    const first = await saveAsB(recipeA);
    expect(first.copyId).toBeTruthy();
    const second = await saveAsB(recipeA);
    expect(second.copyId, "saving again gives the same copy").toBe(first.copyId);
    // Straight to the function too: the copy already saved.
    expect((await b.db.rpc("save_shared_recipe", { shared_recipe_id: recipeA, ingredient_ids: [] as never, expected_version: "x" })).data).toBe(first.copyId);
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
    expect(lines.map((line) => line.is_staple_marked)).toEqual([false, true, false]);
    // B's copy is B's: it can never be shared again.
    expect((await b.db.from("recipe").update({ is_shared: true }).eq("id", first.copyId!)).error?.code).toBe("42501");
    expect((await rowOf(first.copyId!))?.is_shared).toBe(false);

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
    const version = (await getSharedIn(b.db, otherA))!.version;
    const withAIds = await b.db.rpc("save_shared_recipe", {
      shared_recipe_id: otherA,
      ingredient_ids: [aIngredients.get("Kycklingfilé"), aIngredients.get("Grädde"), null] as never,
      expected_version: version,
    });
    expect(withAIds.error?.code).toBe("23503");
    // The two-argument version, without the check, is no longer callable.
    expect((await b.db.rpc("save_shared_recipe" as never, { shared_recipe_id: otherA, ingredient_ids: [null, null, null] } as never)).error?.code).toBe("42501");
    // The lines changed after B read them: refused, nothing saved.
    expect((await a.db.from("recipe_ingredient").update({ original_text: "700 g kycklingfilé" }).eq("recipe_id", otherA).eq("position", 0)).error).toBeNull();
    const stale = await b.db.rpc("save_shared_recipe", { shared_recipe_id: otherA, ingredient_ids: [null, null, null] as never, expected_version: version });
    expect(stale.error?.code).toBe("40001");
    expect((await b.db.rpc("save_shared_recipe", { shared_recipe_id: otherA, ingredient_ids: [null] as never, expected_version: (await getSharedIn(b.db, otherA))!.version })).error?.code).toBe("22023");
    expect((await adminClient().from("recipe").select("id").eq("household_id", householdB).eq("shared_from_recipe_id", otherA)).data).toEqual([]);
    expect(await setSharedIn(a.db, otherA, false)).toBe(true);
  });

  it("takes a recipe out of Delade at once when A stops, and B's copy stays", async () => {
    const copyId = (await saveAsB(recipeA)).copyId!;
    expect(await setSharedIn(a.db, recipeA, false)).toBe(true);
    expect((await listSharedIn(b.db)).map((row) => row.id)).not.toContain(recipeA);
    expect(await getSharedIn(b.db, recipeA)).toBeNull();
    expect((await b.db.rpc("save_shared_recipe", { shared_recipe_id: recipeA, ingredient_ids: [] as never, expected_version: "x" })).error?.code).toBe("P0002");
    expect(await rowOf(copyId)).not.toBeNull();
  });

  it("shares all of A's recipes and new ones with dela alla, never a saved copy, and Sluta dela alla stops them all", async () => {
    expect(await sharingIn(a.db)).toEqual({ shareAll: false, sharedCount: 0, nameIsDefault: false });
    // B's own unshared recipe is B's: A's dela alla never touches it.
    const bOwn = await addRecipe(b.db, "Bergs gryta", (await addIngredient(b.db, "Lök", "Frukt och grönt")), (await addIngredient(b.db, "Mjölk", "Mejeri")));
    expect((await a.db.rpc("set_recipe_share_all", { share: true })).data).toBe(2);
    expect((await rowOf(bOwn))?.is_shared).toBe(false);
    expect(await sharingIn(a.db)).toEqual({ shareAll: true, sharedCount: 2, nameIsDefault: false });
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
    expect((await b.db.rpc("set_recipe_share_all", { share: true })).data).toBe(2);
    expect((await rowOf(bRecipe))?.is_shared).toBe(true);
    expect((await rowOf(copyId))?.is_shared).toBe(false);
    expect((await listSharedIn(a.db)).map((row) => row.id)).toContain(bRecipe);

    expect((await a.db.rpc("stop_sharing_recipes")).data).toBe(2);
    expect(await sharingIn(a.db)).toEqual({ shareAll: false, sharedCount: 0, nameIsDefault: false });
    const left = (await listSharedIn(b.db)).map((row) => row.id);
    for (const id of [recipeA, otherA, later]) expect(left).not.toContain(id);
    // B's own dela alla is B's.
    expect(await sharingIn(b.db)).toEqual({ shareAll: true, sharedCount: 2, nameIsDefault: false });
    expect((await b.db.rpc("stop_sharing_recipes")).data).toBe(2);
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

// The review's hardening (20261108200000_shared_recipes_hardening.sql), with a third household C
// that keeps the name it got with its account.
describe("Delade recept with a third household", () => {
  let c: TestUser;
  let householdC: string;
  let soup = "";

  async function household(id: string) {
    return (await adminClient().from("household").select("name, name_is_default").eq("id", id).single()).data;
  }

  beforeAll(async () => {
    c = await createTestUser("delade-c");
    householdC = await householdOf(c.id);
    const chicken = aIngredients.get("Kycklingfilé")!;
    const cream = aIngredients.get("Grädde")!;
    soup = await addRecipe(a.db, "Ärtsoppa", chicken, cream);
    // A plain-http image address: other households never get it.
    expect((await a.db.from("recipe").update({ image_url: "http://img.example.test/pixel.gif" }).eq("id", soup)).error).toBeNull();
    expect(await setSharedIn(a.db, soup, true)).toBe(true);
  });

  it("shows a household that never chose a name as Ett hushåll, and its own name once it has", async () => {
    expect(await household(householdC)).toMatchObject({ name_is_default: true });
    expect(await household(householdA)).toEqual({ name: "Lindqvists", name_is_default: false });
    const ownC = await addRecipe(c.db, "Cs paj", await addIngredient(c.db, "Ägg", "Mejeri"), await addIngredient(c.db, "Mjöl", "Skafferi"));
    expect(await setSharedIn(c.db, ownC, true)).toBe(true);
    const listed = (await listSharedIn(b.db)).find((row) => row.id === ownC);
    expect(listed?.householdName).toBe("Ett hushåll");
    expect((await getSharedIn(b.db, ownC))?.householdName).toBe("Ett hushåll");
    expect(JSON.stringify(await b.db.rpc("list_shared_recipes")), "C's default name").not.toContain((await household(householdC))!.name);
    const copy = (await saveAsB(ownC)).copyId!;
    expect((await rowOf(copy))?.shared_from_name).toBe("Ett hushåll");
    expect(await saversIn(c.db, ownC)).toEqual(["Bergs"]);

    expect((await c.db.rpc("rename_household", { new_name: "Ceders" })).error).toBeNull();
    expect(await household(householdC)).toEqual({ name: "Ceders", name_is_default: false });
    expect((await getSharedIn(b.db, ownC))?.householdName).toBe("Ceders");
    // A rename does not reach copies already saved.
    expect((await rowOf(copy))?.shared_from_name).toBe("Ett hushåll");
  });

  it("gives an image address only when it is https, in the list, the recipe and the copy", async () => {
    expect((await listSharedIn(b.db)).find((row) => row.id === soup)?.imageUrl).toBeNull();
    expect((await getSharedIn(b.db, soup))?.imageUrl).toBeNull();
    const copy = (await saveAs(c, soup)).copyId!;
    expect((await rowOf(copy))?.image_url).toBeNull();
  });

  it("names savers only to the owner, and gives each household its own copy and no one else's", async () => {
    const cCopy = (await saveAs(c, soup)).copyId!;
    const bCopy = (await saveAsB(soup)).copyId!;
    expect(cCopy).not.toBe(bCopy);
    expect(await saversIn(a.db, soup)).toEqual(["Ceders", "Bergs"]);
    expect(await saversIn(b.db, soup), "B asking for A's recipe").toEqual([]);
    expect(await saversIn(c.db, soup), "C asking for A's recipe").toEqual([]);
    expect((await listSharedIn(b.db)).find((row) => row.id === soup)?.savedCopyId).toBe(bCopy);
    expect((await listSharedIn(c.db)).find((row) => row.id === soup)?.savedCopyId).toBe(cCopy);
    expect((await getSharedIn(b.db, soup))?.savedCopyId).toBe(bCopy);
    expect((await getSharedIn(c.db, soup))?.savedCopyId).toBe(cCopy);
  });

  it("refuses every function to a signed-in user without a household", async () => {
    const lone = await createTestUser("delade-utan-hushall");
    expect((await adminClient().from("household_member").delete().eq("user_id", lone.id)).error).toBeNull();
    for (const [name, args] of [
      ["list_shared_recipes", {}],
      ["get_shared_recipe", { shared_recipe_id: soup }],
      ["save_shared_recipe", { shared_recipe_id: soup, ingredient_ids: [], expected_version: "x" }],
      ["shared_recipe_savers", { own_recipe_id: soup }],
      ["recipe_sharing", {}],
      ["set_recipe_share_all", { share: true }],
      ["stop_sharing_recipes", {}],
    ] as const) {
      expect((await lone.db.rpc(name, args as never)).error?.code, `${name} without a household`).toBe("42501");
    }
  });

  it("lists at most 100 recipes of one household", async () => {
    const many = await createTestUser("delade-manga");
    const householdMany = await householdOf(many.id);
    const rows = Array.from({ length: 101 }, (_, index) => ({
      user_id: many.id,
      household_id: householdMany,
      title: `Recept ${index}`,
      original_servings: 2,
      source_kind: "text",
      is_shared: true,
      created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      shared_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    }));
    expect((await adminClient().from("recipe").insert(rows)).error).toBeNull();
    const listed = (await b.db.rpc("list_shared_recipes")).data ?? [];
    expect(listed.filter((row) => row.title.startsWith("Recept ") && /^Recept \d+$/.test(row.title)).length).toBeLessThanOrEqual(100);
    expect(listed.some((row) => row.title === "Recept 0"), "the oldest is the one left out").toBe(false);
    await adminClient().from("recipe").delete().eq("household_id", householdMany);
  });

  it("names a deleted household's copies Ett hushåll", async () => {
    const pie = (await adminClient().from("recipe").select("id").eq("household_id", householdC).eq("title", "Cs paj").single()).data!.id;
    expect(await setSharedIn(c.db, pie, false)).toBe(true);
    expect(await setSharedIn(c.db, pie, true)).toBe(true);
    // B's copy from before the rename says Ett hushåll; give it C's chosen name to see it go.
    const bCopy = (await adminClient().from("recipe").select("id").eq("household_id", householdB).eq("shared_from_recipe_id", pie).single()).data!.id;
    expect((await adminClient().from("recipe").update({ shared_from_name: "Ceders" }).eq("id", bCopy)).error).toBeNull();
    expect((await adminClient().auth.admin.deleteUser(c.id)).error).toBeNull();
    expect(await household(householdC)).toBeNull();
    expect(await rowOf(bCopy)).toMatchObject({ shared_from_name: "Ett hushåll", title: "Cs paj" });
    // A's recipe that C had saved: A's savers no longer name C.
    expect(await saversIn(a.db, soup)).toEqual(["Bergs"]);
  });
});

// "Nyast först" and the first-share name question (20261108210000_shared_recipes_polish.sql):
// recipe.shared_at, the order of Delade, and recipe_sharing().name_is_default. P shares, Q looks.
describe("Delade recept, shared_at and the default name", () => {
  let p: TestUser;
  let q: TestUser;
  let householdP: string;
  let householdQ: string;

  async function addRow(title: string, createdAt: string, extra: Record<string, unknown> = {}): Promise<string> {
    const { data, error } = await adminClient()
      .from("recipe")
      .insert({ user_id: p.id, household_id: householdP, title, original_servings: 2, source_kind: "text", created_at: createdAt, ...extra })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  const listedTitles = async () => ((await q.db.rpc("list_shared_recipes")).data ?? []).map((row) => row.title);
  const pause = () => new Promise((resolve) => setTimeout(resolve, 20));

  beforeAll(async () => {
    p = await createTestUser("delade-p");
    q = await createTestUser("delade-q");
    householdP = await householdOf(p.id);
    householdQ = await householdOf(q.id);
  });

  it("sets shared_at when a recipe is shared, clears it when it stops, and keeps updated_at", async () => {
    const id = await addRow("Pajen", "2026-01-01T00:00:00Z");
    const before = await rowOf(id);
    expect(before).toMatchObject({ is_shared: false, shared_at: null });
    const at = Date.now();
    expect(await setSharedIn(p.db, id, true)).toBe(true);
    const shared = await rowOf(id);
    expect(Date.parse(shared!.shared_at!)).toBeGreaterThanOrEqual(at - 5000);
    expect(shared!.updated_at, "sharing alone is not a change of the recipe").toBe(before!.updated_at);
    // Staying shared while the recipe changes keeps the moment.
    expect((await p.db.from("recipe").update({ title: "Pajen 2" }).eq("id", id)).error).toBeNull();
    expect((await rowOf(id))!.shared_at).toBe(shared!.shared_at);
    // A signed-in user cannot write it.
    await p.db.from("recipe").update({ shared_at: "2020-01-01T00:00:00Z" }).eq("id", id);
    expect((await rowOf(id))!.shared_at).toBe(shared!.shared_at);
    expect(await setSharedIn(p.db, id, false)).toBe(true);
    expect(await rowOf(id)).toMatchObject({ is_shared: false, shared_at: null });
    // Shared again, it is new again.
    await pause();
    expect(await setSharedIn(p.db, id, true)).toBe(true);
    expect(Date.parse((await rowOf(id))!.shared_at!)).toBeGreaterThan(Date.parse(shared!.shared_at!));
    await adminClient().from("recipe").delete().eq("id", id);
  });

  it("lists the newest shared first, whatever the recipes' own dates, and returns shared_at", async () => {
    const old = await addRow("Gammal men nydelad", "2025-01-01T00:00:00Z");
    const fresh = await addRow("Ny men tidigare delad", "2026-11-01T00:00:00Z");
    expect(await setSharedIn(p.db, fresh, true)).toBe(true);
    await pause();
    expect(await setSharedIn(p.db, old, true)).toBe(true);
    const rows = (await q.db.rpc("list_shared_recipes")).data ?? [];
    const titles = rows.map((row) => row.title);
    expect(titles.indexOf("Gammal men nydelad")).toBeGreaterThanOrEqual(0);
    expect(titles.indexOf("Gammal men nydelad")).toBeLessThan(titles.indexOf("Ny men tidigare delad"));
    const shown = rows.find((row) => row.id === old)!;
    expect(Date.parse(shown.shared_at)).toBe(Date.parse((await rowOf(old))!.shared_at!));
    expect((await listSharedIn(q.db)).find((row) => row.id === old)!.sharedAt).toBe(shown.shared_at);
    // Stopping and sharing again moves it to the top.
    expect(await setSharedIn(p.db, fresh, false)).toBe(true);
    await pause();
    expect(await setSharedIn(p.db, fresh, true)).toBe(true);
    const again = await listedTitles();
    expect(again.indexOf("Ny men tidigare delad")).toBeLessThan(again.indexOf("Gammal men nydelad"));
    await adminClient().from("recipe").delete().in("id", [old, fresh]);
  });

  it("keeps the 100 newest shared of a household, by when they were shared", async () => {
    const many = await createTestUser("delade-manga-nyast");
    const householdMany = await householdOf(many.id);
    const rows = Array.from({ length: 101 }, (_, index) => ({
      user_id: many.id,
      household_id: householdMany,
      title: `Delad ${index}`,
      original_servings: 2,
      source_kind: "text",
      is_shared: true,
      // Saved in the opposite order to how they were shared: the last saved was shared first.
      created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, 200 - index)).toISOString(),
      shared_at: new Date(Date.UTC(2026, 5, 1, 0, 0, index)).toISOString(),
    }));
    expect((await adminClient().from("recipe").insert(rows)).error).toBeNull();
    const listed = ((await q.db.rpc("list_shared_recipes")).data ?? []).filter((row) => /^Delad \d+$/.test(row.title));
    expect(listed).toHaveLength(100);
    expect(listed.some((row) => row.title === "Delad 0"), "the one shared longest ago is left out").toBe(false);
    expect(listed[0].title).toBe("Delad 100");
    await adminClient().from("recipe").delete().eq("household_id", householdMany);
  });

  it("sets shared_at for the recipes dela alla marks and for new ones, and clears it when they all stop", async () => {
    const one = await addRow("Ett", "2026-01-01T00:00:00Z");
    const two = await addRow("Två", "2026-01-02T00:00:00Z");
    expect((await p.db.rpc("set_recipe_share_all", { share: true })).error).toBeNull();
    for (const id of [one, two]) expect((await rowOf(id))!.shared_at, "marked by dela alla").not.toBeNull();
    const added = await addRow("Tre", "2026-01-03T00:00:00Z");
    expect(await rowOf(added)).toMatchObject({ is_shared: true });
    expect((await rowOf(added))!.shared_at, "auto-shared on insert").not.toBeNull();
    expect((await p.db.rpc("stop_sharing_recipes")).error).toBeNull();
    for (const id of [one, two, added]) expect(await rowOf(id)).toMatchObject({ is_shared: false, shared_at: null });
    await adminClient().from("recipe").delete().in("id", [one, two, added]);
  });

  it("keeps is_shared and shared_at in step in every row, the backfill's shape", async () => {
    const { data, error } = await adminClient().from("recipe").select("id, is_shared, shared_at");
    expect(error).toBeNull();
    expect((data ?? []).filter((row) => row.is_shared !== (row.shared_at !== null))).toEqual([]);
    // A service-role insert of an unshared recipe cannot carry a date; a shared one may (repairs).
    const loose = await addRow("Lös", "2026-01-01T00:00:00Z", { shared_at: "2026-02-02T00:00:00Z" });
    expect((await rowOf(loose))!.shared_at).toBeNull();
    const dated = await addRow("Daterad", "2026-01-01T00:00:00Z", { is_shared: true, shared_at: "2026-02-02T00:00:00Z" });
    expect(Date.parse((await rowOf(dated))!.shared_at!)).toBe(Date.parse("2026-02-02T00:00:00Z"));
    await adminClient().from("recipe").delete().in("id", [loose, dated]);
  });

  it("gives a saved copy no shared_at", async () => {
    const id = await addRow("Delas och sparas", "2026-01-01T00:00:00Z");
    expect(await setSharedIn(p.db, id, true)).toBe(true);
    const saved = await saveAs(q, id);
    expect(saved.copyId).not.toBeNull();
    expect(await rowOf(saved.copyId!)).toMatchObject({ is_shared: false, shared_at: null });
    await adminClient().from("recipe").delete().in("id", [id, saved.copyId!]);
  });

  it("tells each household only its own name_is_default, and a rename clears it", async () => {
    expect(await sharingIn(p.db)).toMatchObject({ nameIsDefault: true });
    expect(await sharingIn(q.db)).toMatchObject({ nameIsDefault: true });
    expect((await q.db.rpc("rename_household", { new_name: "Quists" })).error).toBeNull();
    expect(await sharingIn(q.db)).toMatchObject({ nameIsDefault: false });
    expect(await sharingIn(p.db), "P's flag is P's own").toMatchObject({ nameIsDefault: true });
    const row = (await p.db.rpc("recipe_sharing")).data ?? [];
    expect(Object.keys(row[0]).sort()).toEqual(["name_is_default", "share_all", "shared_count"]);
    expect(householdQ).not.toBe(householdP);
  });

  it("still refuses anon, and both functions still need a member", async () => {
    const anon = anonClient();
    for (const name of ["list_shared_recipes", "recipe_sharing"] as const) {
      expect((await anon.rpc(name)).error, `${name} for anon`).not.toBeNull();
    }
    const lone = await createTestUser("delade-utan-hushall-2");
    expect((await adminClient().from("household_member").delete().eq("user_id", lone.id)).error).toBeNull();
    for (const name of ["list_shared_recipes", "recipe_sharing"] as const) {
      expect((await lone.db.rpc(name)).error?.code, `${name} without a household`).toBe("42501");
    }
  });
});
