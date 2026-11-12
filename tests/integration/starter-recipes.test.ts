import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { matchIngredientsIn } from "@/features/catalog/actions/match-ingredients";
import { commitIngredients } from "@/features/catalog/data/commit";
import { recipeImageBucket, recipeImageFile, recipeImageFolder } from "@/features/recipes/domain/recipe-image";
import { sharedChoices, sharedMatchItems } from "@/features/recipes/domain/shared-recipe";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, anonClient, createTestUser, deleteTestUsers, householdOf, localSql, type Db, type TestUser } from "./support";

// Kom igång med recept (supabase/migrations/20261112120000_starter_recipes.sql), against the real
// database and Storage with real sessions: the app owner O keeps a pack of O's own recipes; B and C are
// other households that choose and copy; anon is nobody. The pack's table is closed to every client,
// the owner's functions answer only the owner, a copy is the recipe's texts exactly as written with a
// picture of its own in the household's folder, never twice, within the household's recipe cap, and
// "Ta bort startrecepten" takes only untouched copies.

const fetchRecipeImage = vi.fn();
vi.mock("@/server/fetch", () => ({ fetchRecipeImage: (...args: unknown[]) => fetchRecipeImage(...args) }));

const { copyStarterImage, removeRecipeImages } = await import("@/features/recipes/actions/store-recipe-image");
const { setImagePathIn, uploadImageIn } = await import("@/features/recipes/data/image");
const { deleteUntouchedStarterIn, getStarterIn, listStarterIn, listStarterPackIn, saveStarterIn, starterCopiesIn, starterImageFolderIn, starterRoomIn } =
  await import("@/features/recipes/data/starter");

let owner: TestUser;
let b: TestUser;
let c: TestUser;
let householdO: string;
let householdB: string;
let householdC: string;
let recipeO = "";
let secondO = "";
let privateO = "";
let item = "";
let secondItem = "";
let webp: Uint8Array;

async function addIngredient(db: Db, name: string, section = "Kött och fisk"): Promise<string> {
  const { data, error } = await db.from("ingredient").insert({ name, normalized_name: name.toLowerCase(), section, location: "Kyl" }).select("id").single();
  if (error) throw error;
  return data.id;
}

/** A recipe of `db`'s household with two steps and three lines, as the app saves one. */
async function addRecipe(db: Db, title: string, ingredient: string | null): Promise<string> {
  const { data, error } = await db.rpc("save_recipe", {
    recipe: { id: randomUUID(), title, original_servings: 4, total_minutes: 40, image_url: "https://img.example.test/kottbullar.jpg", source_kind: "url", source_url: "https://www.example.test/kottbullar" },
    steps: [
      { position: 0, text: "Blanda färs, ströbröd och grädde. Låt vila.", title: "Smeten" },
      { position: 1, text: "Forma bollar och stek i smör." },
    ],
    lines: [
      { position: 0, original_text: "500 g köttfärs", amount: 500, unit: "g", is_vague: false, ingredient_id: ingredient, step_position: 0, section: "Köttbullar" },
      { position: 1, original_text: "2 dl grädde", amount: 2, unit: "dl", is_vague: false, ingredient_id: null, step_position: 0, is_staple_marked: true },
      { position: 2, original_text: "Salt och peppar", amount: null, unit: null, is_vague: true, ingredient_id: null, step_position: null },
    ],
  } as never);
  if (error) throw error;
  return data as unknown as string;
}

/** The owner's stored picture of `recipe`, as the app keeps one (WebP, full and thumb). */
async function storePicture(user: TestUser, household: string, recipe: string): Promise<string> {
  const folder = recipeImageFolder(household, recipe);
  await uploadImageIn(user.db as never, recipeImageFile(folder, "full"), webp);
  await uploadImageIn(user.db as never, recipeImageFile(folder, "thumb"), webp);
  expect(await setImagePathIn(user.db as never, recipe, folder)).toBe(true);
  return folder;
}

const filesOf = (household: string) =>
  localSql<{ name: string }>(`select name from storage.objects where bucket_id = '${recipeImageBucket}' and left(name, 37) = '${household}/' order by name`).map((row) => row.name);

async function emptyFolders(): Promise<void> {
  for (const household of [householdO, householdB, householdC]) {
    const names = filesOf(household);
    if (names.length > 0) await adminClient().storage.from(recipeImageBucket).remove(names);
  }
}

async function rowOf(id: string) {
  const { data, error } = await adminClient().from("recipe").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

/** What copyStarterRecipe does, step by step with `user`'s session: read, match by name, save, picture. */
async function copyAs(user: TestUser, packItem: string): Promise<{ id: string } | "gone" | "changed" | "cap"> {
  const starter = await getStarterIn(user.db as never, packItem);
  if (!starter) return "gone";
  if (starter.savedCopyId) return { id: starter.savedCopyId };
  const matches = await matchIngredientsIn(user.db as never, sharedMatchItems(starter.lines));
  const ids = await commitIngredients(user.db as never, sharedChoices(starter.lines, matches));
  const saved = await saveStarterIn(user.db as never, packItem, ids, starter.version);
  if (typeof saved === "string") return saved;
  await copyStarterImage(user.db as never, saved.id, await starterImageFolderIn(user.db as never, packItem));
  return saved;
}

/** Everything a function gave a member, as text, for what must never be in it. */
function leaks(answer: unknown): string[] {
  const text = JSON.stringify(answer);
  return [owner.id, owner.email, householdO, privateO, "matkoll.test", "is_favorite", "offer_names", "user_id", "household_id"].filter((secret) => text.includes(secret));
}

beforeAll(async () => {
  localSupabaseUrl();
  webp = new Uint8Array(await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 180, g: 90, b: 40 } } }).webp().toBuffer());
  fetchRecipeImage.mockResolvedValue({ ok: false, reason: "network" });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  owner = await createTestUser("start-o");
  b = await createTestUser("start-b");
  c = await createTestUser("start-c");
  householdO = await householdOf(owner.id);
  householdB = await householdOf(b.id);
  householdC = await householdOf(c.id);
  const { error } = await adminClient().from("app_owner").upsert({ user_id: owner.id });
  if (error) throw error;
  const mince = await addIngredient(owner.db, "Köttfärs");
  recipeO = await addRecipe(owner.db, "Köttbullar med gräddsås", mince);
  secondO = await addRecipe(owner.db, "Pytt i panna", mince);
  privateO = await addRecipe(owner.db, "Ägarens hemliga gryta", mince);
  await storePicture(owner, householdO, recipeO);
  await storePicture(owner, householdO, privateO);
});

afterAll(async () => {
  await adminClient().from("app_owner").delete().eq("user_id", owner?.id ?? "");
  await adminClient().from("starter_pack_item").delete().in("recipe_id", [recipeO, secondO, privateO].filter(Boolean));
  await emptyFolders();
  await deleteTestUsers();
});

describe("Startrecept", () => {
  it("closes the pack's table to every client, and the owner's functions to everyone but the owner", async () => {
    for (const [who, db] of [["owner", owner.db], ["B", b.db], ["anon", anonClient()]] as const) {
      expect((await db.from("starter_pack_item").select("id")).error?.code, `${who} reads the table`).toBe("42501");
      expect((await db.from("starter_pack_item").insert({ recipe_id: recipeO })).error?.code, `${who} writes the table`).toBe("42501");
    }
    expect((await b.db.rpc("starter_pack_add", { pack_recipe: recipeO })).error?.code).toBe("42501");
    expect((await b.db.rpc("starter_pack_items")).error?.code).toBe("42501");
    expect(await listStarterPackIn(b.db as never)).toBeNull();
    const anon = anonClient();
    for (const [name, args] of [
      ["starter_pack_list", {}],
      ["get_starter_recipe", { item: randomUUID() }],
      ["save_starter_recipe", { item: randomUUID(), ingredient_ids: [], expected_version: "x" }],
      ["starter_image_folder", { item: randomUUID() }],
      ["starter_recipe_room", {}],
      ["starter_copies", {}],
      ["delete_untouched_starter_copies", { recipe_ids: null }],
      ["starter_recipe_fingerprint", { recipe: recipeO }],
      ["recipe_image_in_starter_pack", { object_name: `${householdO}/${recipeO}/full` }],
      ["starter_pack_items", {}],
      ["starter_pack_add", { pack_recipe: recipeO }],
      ["starter_pack_remove", { item: randomUUID() }],
      ["starter_pack_set_note", { item: randomUUID(), item_note: "x" }],
      ["starter_pack_move", { item: randomUUID(), step: 1 }],
    ] as const) {
      expect((await anon.rpc(name as never, args as never)).error?.code, `anon calls ${name}`).toBe("42501");
    }
  });

  it("starts empty, and the owner adds only the owner household's own recipes, each once", async () => {
    expect(await listStarterIn(b.db as never)).toEqual([]);
    expect(await listStarterPackIn(owner.db as never)).toEqual([]);
    const own = await addRecipe(c.db, "C:s eget", null);
    expect((await owner.db.rpc("starter_pack_add", { pack_recipe: own })).error?.code, "another household's recipe").toBe("P0002");
    const added = await owner.db.rpc("starter_pack_add", { pack_recipe: recipeO });
    expect(added.error).toBeNull();
    item = added.data!;
    expect((await owner.db.rpc("starter_pack_add", { pack_recipe: recipeO })).data, "added again: the same item").toBe(item);
    secondItem = (await owner.db.rpc("starter_pack_add", { pack_recipe: secondO })).data!;
    const pack = await listStarterPackIn(owner.db as never);
    expect(pack?.map((entry) => [entry.recipeId, entry.position, entry.copies])).toEqual([
      [recipeO, 0, 0],
      [secondO, 1, 0],
    ]);
  });

  it("lets the owner order and note the pack, within the note's limit", async () => {
    expect((await owner.db.rpc("starter_pack_move", { item: secondItem, step: -1 })).data).toBe(true);
    expect((await owner.db.rpc("starter_pack_move", { item: secondItem, step: -1 })).data, "already first").toBe(false);
    expect((await owner.db.rpc("starter_pack_move", { item: secondItem, step: 2 })).error?.code).toBe("22023");
    expect((await listStarterIn(b.db as never)).map((row) => row.itemId)).toEqual([secondItem, item]);
    expect((await owner.db.rpc("starter_pack_move", { item: secondItem, step: 1 })).data).toBe(true);
    expect((await owner.db.rpc("starter_pack_set_note", { item, item_note: "  Barnens favorit  " })).data).toBe(true);
    expect((await owner.db.rpc("starter_pack_set_note", { item, item_note: "x".repeat(141) })).error?.code).toBe("23514");
    expect((await owner.db.rpc("starter_pack_set_note", { item: randomUUID(), item_note: "x" })).data).toBe(false);
    expect((await b.db.rpc("starter_pack_set_note", { item, item_note: "Kapat" })).error?.code).toBe("42501");
    expect((await listStarterIn(b.db as never)).map((row) => [row.itemId, row.note])).toEqual([
      [item, "Barnens favorit"],
      [secondItem, null],
    ]);
  });

  it("shows a member the pack recipes with their texts as written, and nothing of the owner's household", async () => {
    const rows = await listStarterIn(b.db as never);
    expect(rows[0]).toMatchObject({ itemId: item, title: "Köttbullar med gräddsås", servings: 4, totalMinutes: 40, hasImage: true, copyId: null });
    expect(rows[0]?.lineTexts).toEqual(["500 g köttfärs", "2 dl grädde", "Salt och peppar"]);
    expect(leaks((await b.db.rpc("starter_pack_list")).data), "the list").toEqual([]);
    const raw = (await b.db.rpc("get_starter_recipe", { item })).data;
    expect(leaks(raw), "the recipe").toEqual([]);
    const starter = await getStarterIn(b.db as never, item);
    expect(starter).toMatchObject({
      id: item,
      title: "Köttbullar med gräddsås",
      householdName: "Startrecept",
      sourceUrl: "https://www.example.test/kottbullar",
      note: "Barnens favorit",
      hasImage: true,
      savedCopyId: null,
      steps: [{ title: "Smeten", text: "Blanda färs, ströbröd och grädde. Låt vila." }, { title: null, text: "Forma bollar och stek i smör." }],
    });
    // A recipe of the owner's that is not in the pack is not there, by any id.
    expect(await getStarterIn(b.db as never, privateO)).toBeNull();
    expect(await starterImageFolderIn(b.db as never, privateO)).toBeNull();
    // The owner's household sees its own recipe as added already.
    expect((await listStarterIn(owner.db as never)).find((row) => row.itemId === item)?.copyId).toBe(recipeO);
    expect((await saveStarterIn(owner.db as never, item, [], "x")) as { id: string }).toEqual({ id: recipeO });
  });

  it("lets a member read a pack recipe's stored picture, but not remove it, and no other picture of the owner's", async () => {
    const folder = await starterImageFolderIn(b.db as never, item);
    expect(folder).toBe(`${householdO}/${recipeO}`);
    const files = b.db.storage.from(recipeImageBucket);
    expect((await files.download(`${folder}/full`)).error).toBeNull();
    expect((await files.download(`${householdO}/${privateO}/full`)).error, "a picture outside the pack").not.toBeNull();
    await files.remove([`${folder}/full`, `${folder}/thumb`]);
    expect(filesOf(householdO), "B removed nothing").toContain(`${folder}/full`);
    expect((await files.upload(`${householdO}/${recipeO}/extra`, webp, { contentType: "image/webp" })).error, "B adds nothing there").not.toBeNull();
  });

  it("copies a pack recipe into B exactly as written, with its picture in B's own folder, once, and not shared by dela alla", async () => {
    expect((await b.db.rpc("set_recipe_share_all", { share: true })).error).toBeNull();
    const before = await starterRoomIn(b.db as never);
    const saved = await copyAs(b, item);
    expect(typeof saved).toBe("object");
    const copyId = (saved as { id: string }).id;
    expect((await copyAs(b, item)) as { id: string }, "copied again: the same copy").toEqual({ id: copyId });
    expect(((await b.db.rpc("save_starter_recipe", { item, ingredient_ids: [], expected_version: "x" })).data), "straight to the function").toBe(copyId);
    expect((await adminClient().from("recipe").select("id").eq("household_id", householdB).eq("starter_item_id", item)).data).toHaveLength(1);
    expect((await starterRoomIn(b.db as never)).count).toBe(before.count + 1);

    const copy = await rowOf(copyId);
    const original = await rowOf(recipeO);
    expect(copy).toMatchObject({
      household_id: householdB,
      user_id: b.id,
      title: original!.title,
      original_servings: original!.original_servings,
      total_minutes: original!.total_minutes,
      source_kind: original!.source_kind,
      source_url: original!.source_url,
      image_url: original!.image_url,
      is_shared: false,
      is_favorite: false,
      starter_item_id: item,
      image_path: `${householdB}/${copyId}`,
      shared_from_recipe_id: null,
    });
    expect(copy?.starter_fingerprint).toMatch(/^[0-9a-f]{32}$/);
    const textsOf = async (id: string) => ({
      steps: ((await adminClient().from("recipe_step").select("title, text").eq("recipe_id", id).order("position")).data ?? []),
      lines: ((await adminClient().from("recipe_ingredient").select("original_text, amount, unit, is_vague, section, is_staple_marked").eq("recipe_id", id).order("position")).data ?? []),
    });
    expect(await textsOf(copyId), "steps and lines exactly as the owner's").toEqual(await textsOf(recipeO));
    const lines = (await adminClient().from("recipe_ingredient").select("ingredient_id, household_id, step_id").eq("recipe_id", copyId).order("position")).data ?? [];
    expect(lines.every((line) => line.household_id === householdB)).toBe(true);
    const catalog = (await adminClient().from("ingredient").select("household_id").eq("id", lines[0]!.ingredient_id!)).data;
    expect(catalog, "the line's ingredient is B's own").toEqual([{ household_id: householdB }]);
    expect(lines[0]!.step_id).not.toBeNull();
    expect(filesOf(householdB)).toEqual([`${householdB}/${copyId}/full`, `${householdB}/${copyId}/thumb`]);
    expect(fetchRecipeImage, "the picture is copied, not fetched from the site").not.toHaveBeenCalled();
    // B's list says it is added.
    expect((await listStarterIn(b.db as never)).find((row) => row.itemId === item)?.copyId).toBe(copyId);
    expect((await starterCopiesIn(b.db as never))).toEqual([{ recipeId: copyId, untouched: true }]);
    expect((await b.db.rpc("set_recipe_share_all", { share: false })).error).toBeNull();
  });

  it("never lets a member write where a copy came from", async () => {
    const own = await addRecipe(b.db, "B:s egen soppa", null);
    expect((await b.db.from("recipe").update({ starter_item_id: item, starter_fingerprint: "x" }).eq("id", own)).error?.code).toBe("42501");
    const copy = (await listStarterIn(b.db as never)).find((row) => row.itemId === item)!.copyId!;
    expect((await b.db.from("recipe").update({ starter_fingerprint: "x" }).eq("id", copy)).error?.code).toBe("42501");
    expect(
      (await b.db.from("recipe").insert({ title: "Fusk", original_servings: 2, source_kind: "text", starter_item_id: item, starter_fingerprint: "x" })).error?.code,
    ).toBe("42501");
  });

  it("refuses a copy when the lines changed since they were read, and when the household has its recipe cap", async () => {
    const starter = await getStarterIn(c.db as never, secondItem);
    // The owner changes a line in between.
    const line = (await adminClient().from("recipe_ingredient").select("id").eq("recipe_id", secondO).eq("position", 2).single()).data!;
    expect((await adminClient().from("recipe_ingredient").update({ original_text: "Salt, peppar" }).eq("id", line.id)).error).toBeNull();
    expect(await saveStarterIn(c.db as never, secondItem, [null, null, null], starter!.version)).toBe("changed");
    // C fills its list to the cap (400) and no copy is made.
    localSql(`with made as (insert into public.recipe (household_id, user_id, title, original_servings, source_kind)
      select '${householdC}', '${c.id}', 'Fyllnad ' || n, 2, 'text' from generate_series(1, 399) as n returning 1) select count(*) as n from made`);
    expect(await starterRoomIn(c.db as never)).toEqual({ count: 400, cap: 400 });
    const fresh = await getStarterIn(c.db as never, secondItem);
    expect(await saveStarterIn(c.db as never, secondItem, [null, null, null], fresh!.version)).toBe("cap");
    expect((await adminClient().from("recipe").select("id").eq("household_id", householdC).not("starter_item_id", "is", null)).data).toEqual([]);
    localSql(`with gone as (delete from public.recipe where household_id = '${householdC}' and title like 'Fyllnad %' returning 1) select count(*) as n from gone`);
  });

  it("removes only the untouched copies with Ta bort startrecepten, never a changed, favourite or own recipe", async () => {
    const changed = (await listStarterIn(b.db as never)).find((row) => row.itemId === item)!.copyId!;
    const second = await copyAs(b, secondItem);
    const untouched = (second as { id: string }).id;
    const own = (await b.db.from("recipe").select("id").eq("title", "B:s egen soppa").single()).data!.id;
    expect(filesOf(householdB).length).toBeGreaterThan(0);
    // B renames one copy: it is B's own now.
    expect((await b.db.from("recipe").update({ title: "Mormors köttbullar" }).eq("id", changed)).error).toBeNull();
    expect((await starterCopiesIn(b.db as never)).sort((x, y) => x.recipeId.localeCompare(y.recipeId))).toEqual(
      [
        { recipeId: changed, untouched: false },
        { recipeId: untouched, untouched: true },
      ].sort((x, y) => x.recipeId.localeCompare(y.recipeId)),
    );
    // A favourite is kept too.
    expect((await b.db.from("recipe").update({ is_favorite: true }).eq("id", untouched)).error).toBeNull();
    expect(await deleteUntouchedStarterIn(b.db as never, null)).toEqual([]);
    expect((await b.db.from("recipe").update({ is_favorite: false }).eq("id", untouched)).error).toBeNull();
    // C asks to remove B's: nothing (RLS).
    expect(await deleteUntouchedStarterIn(c.db as never, [untouched, changed])).toEqual([]);
    const deleted = await deleteUntouchedStarterIn(b.db as never, null);
    // This one has no stored picture (the pack recipe has none, and the site could not be reached).
    expect(deleted).toEqual([{ id: untouched, folder: null }]);
    for (const row of deleted) await removeRecipeImages(b.db as never, row.folder);
    expect(await rowOf(untouched)).toBeNull();
    expect(await rowOf(changed)).not.toBeNull();
    expect(await rowOf(own)).not.toBeNull();
    expect(filesOf(householdB).some((name) => name.startsWith(`${householdB}/${untouched}/`))).toBe(false);
    // It may be chosen again.
    expect((await listStarterIn(b.db as never)).find((row) => row.itemId === secondItem)?.copyId).toBeNull();
  });

  it("keeps the copies when the owner takes a recipe out of the pack, and the pack forgets it", async () => {
    const copy = (await listStarterIn(b.db as never)).find((row) => row.itemId === item)!.copyId!;
    expect((await b.db.rpc("starter_pack_remove", { item })).error?.code).toBe("42501");
    expect((await owner.db.rpc("starter_pack_remove", { item })).data).toBe(true);
    expect((await owner.db.rpc("starter_pack_remove", { item })).data).toBe(false);
    expect((await listStarterIn(b.db as never)).map((row) => row.itemId)).toEqual([secondItem]);
    expect(await getStarterIn(b.db as never, item)).toBeNull();
    expect(await saveStarterIn(b.db as never, item, [], "x")).toBe("gone");
    expect(await rowOf(copy)).toMatchObject({ starter_item_id: item });
    // Its picture is no longer readable by other households.
    expect((await b.db.storage.from(recipeImageBucket).download(`${householdO}/${recipeO}/full`)).error).not.toBeNull();
    // A recipe the owner deletes leaves the pack with it.
    const gone = await addRecipe(owner.db, "Tillfälligt", null);
    const goneItem = (await owner.db.rpc("starter_pack_add", { pack_recipe: gone })).data!;
    expect((await owner.db.from("recipe").delete().eq("id", gone)).error).toBeNull();
    expect((await listStarterIn(b.db as never)).map((row) => row.itemId)).not.toContain(goneItem);
  });
});
