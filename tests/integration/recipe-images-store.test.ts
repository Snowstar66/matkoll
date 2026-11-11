import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { recipeImageBucket, recipeImageFile, recipeImageFolder, recipeImageHouseholdCap } from "@/features/recipes/domain/recipe-image";
import { adminClient, createTestUser, deleteTestUsers, householdOf, localSql, type Db, type TestUser } from "./support";

// storeRecipeImage and its helpers against real Storage and a real session: the picture is
// fetched (stubbed here: no network in a test), decoded by sharp, stored under
// <household>/<recipe>/full and /thumb and the recipe is pointed at them; a failure keeps
// the recipe as it was; the cap is honoured; a copy saved from another household gets its own
// files in its own household's folder; and removing a recipe's pictures takes both files.

const fetchRecipeImage = vi.fn();
vi.mock("@/server/fetch", () => ({ fetchRecipeImage: (...args: unknown[]) => fetchRecipeImage(...args) }));

const { storeRecipeImage, recipeImageFolderOf, removeRecipeImages, sweepRecipeImages } = await import("@/features/recipes/actions/store-recipe-image");
const { downloadImageIn, getImageStateIn } = await import("@/features/recipes/data/image");

const address = "https://img.koket.se/pannkakor.jpg";
let a: TestUser;
let b: TestUser;
let householdA: string;
let householdB: string;
let jpeg: Uint8Array;

async function makeRecipe(user: TestUser, imageUrl: string | null = address): Promise<string> {
  const { data, error } = await user.db
    .from("recipe")
    .insert({ title: "Pannkakor", original_servings: 4, source_kind: "url", source_url: "https://www.koket.se/pannkakor", image_url: imageUrl })
    .select("id")
    .single();
  expect(error).toBeNull();
  return data!.id;
}

const filesOf = (household: string) =>
  localSql<{ name: string }>(`select name from storage.objects where bucket_id = '${recipeImageBucket}' and left(name, 37) = '${household}/' order by name`).map(
    (row) => row.name,
  );

async function emptyFolders(): Promise<void> {
  for (const household of [householdA, householdB]) {
    const names = filesOf(household);
    for (let start = 0; start < names.length; start += 100) await adminClient().storage.from(recipeImageBucket).remove(names.slice(start, start + 100));
  }
}

const meta = async (db: Db, folder: string, size: "full" | "thumb") => {
  const blob = await downloadImageIn(db as never, folder, size);
  expect(blob, `${size} is stored`).not.toBeNull();
  return sharp(new Uint8Array(await blob!.arrayBuffer())).metadata();
};

beforeAll(async () => {
  jpeg = new Uint8Array(
    await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 200, g: 80, b: 40 } } })
      .withExif({ IFD0: { Make: "Secret camera" } })
      .jpeg()
      .toBuffer(),
  );
  a = await createTestUser("rimgs-a");
  b = await createTestUser("rimgs-b");
  householdA = await householdOf(a.id);
  householdB = await householdOf(b.id);
});

afterEach(async () => {
  fetchRecipeImage.mockReset().mockResolvedValue({ ok: true, bytes: jpeg });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await emptyFolders();
});

afterAll(async () => {
  await emptyFolders();
  await deleteTestUsers();
});

describe("storeRecipeImage against Storage", () => {
  it("keeps a full size and a thumbnail as WebP without metadata, and points the recipe at them", async () => {
    fetchRecipeImage.mockResolvedValue({ ok: true, bytes: jpeg });
    const id = await makeRecipe(a);
    expect(await storeRecipeImage(a.db as never, id)).toBe("stored");
    const folder = recipeImageFolder(householdA, id);
    expect(filesOf(householdA)).toEqual([recipeImageFile(folder, "full"), recipeImageFile(folder, "thumb")]);
    const full = await meta(a.db, folder, "full");
    const thumb = await meta(a.db, folder, "thumb");
    expect(full).toMatchObject({ format: "webp", width: 1200, height: 800 });
    expect(thumb).toMatchObject({ format: "webp", width: 640, height: 427 });
    expect(full.exif).toBeUndefined();
    expect(await getImageStateIn(a.db as never, id)).toEqual({ householdId: householdA, imageUrl: address, imagePath: folder });
    expect(await recipeImageFolderOf(a.db as never, id)).toBe(folder);
    // The recipe's own text is untouched.
    const { data } = await a.db.from("recipe").select("title, source_url, original_servings").eq("id", id).single();
    expect(data).toEqual({ title: "Pannkakor", source_url: "https://www.koket.se/pannkakor", original_servings: 4 });
  });

  it("does nothing the second time (no second copy), and nothing for a recipe without an address", async () => {
    const id = await makeRecipe(a);
    expect(await storeRecipeImage(a.db as never, id)).toBe("stored");
    fetchRecipeImage.mockClear();
    expect(await storeRecipeImage(a.db as never, id)).toBe("skipped");
    expect(fetchRecipeImage).not.toHaveBeenCalled();
    expect(filesOf(householdA)).toHaveLength(2);
    expect(await storeRecipeImage(a.db as never, await makeRecipe(a, null))).toBe("skipped");
  });

  it("keeps the recipe with its address when the picture cannot be fetched or is not a picture, and stores nothing", async () => {
    const id = await makeRecipe(a);
    fetchRecipeImage.mockResolvedValue({ ok: false, reason: "blocked_address" });
    expect(await storeRecipeImage(a.db as never, id)).toBe("failed");
    fetchRecipeImage.mockResolvedValue({ ok: true, bytes: new TextEncoder().encode("<html>not a picture</html>") });
    expect(await storeRecipeImage(a.db as never, id)).toBe("failed");
    expect(filesOf(householdA)).toEqual([]);
    expect(await getImageStateIn(a.db as never, id)).toEqual({ householdId: householdA, imageUrl: address, imagePath: null });
    // And a later attempt works.
    fetchRecipeImage.mockResolvedValue({ ok: true, bytes: jpeg });
    expect(await storeRecipeImage(a.db as never, id)).toBe("stored");
  });

  it("does not touch another household's recipe", async () => {
    const id = await makeRecipe(a);
    expect(await storeRecipeImage(b.db as never, id)).toBe("skipped");
    expect(fetchRecipeImage).not.toHaveBeenCalled();
    expect(filesOf(householdA)).toEqual([]);
    expect(filesOf(householdB)).toEqual([]);
  });

  it("says cap, stores nothing and keeps the recipe when the household is at its cap", async () => {
    localSql(`
      insert into storage.objects (bucket_id, name, metadata)
      select '${recipeImageBucket}', '${householdA}/' || gen_random_uuid() || '/full', '{"size": 10}'::jsonb
      from generate_series(1, ${recipeImageHouseholdCap}) returning id`);
    const id = await makeRecipe(a);
    expect(await storeRecipeImage(a.db as never, id)).toBe("cap");
    expect(fetchRecipeImage).not.toHaveBeenCalled();
    expect(filesOf(householdA)).toHaveLength(recipeImageHouseholdCap);
    expect((await getImageStateIn(a.db as never, id))?.imagePath).toBeNull();
  });

  it("stops at the cap when it is reached between the two files, removing the one it uploaded", async () => {
    localSql(`
      insert into storage.objects (bucket_id, name, metadata)
      select '${recipeImageBucket}', '${householdA}/' || gen_random_uuid() || '/full', '{"size": 10}'::jsonb
      from generate_series(1, ${recipeImageHouseholdCap - 1}) returning id`);
    const id = await makeRecipe(a);
    expect(await storeRecipeImage(a.db as never, id)).toBe("cap");
    expect(filesOf(householdA)).toHaveLength(recipeImageHouseholdCap - 1);
    expect((await getImageStateIn(a.db as never, id))?.imagePath).toBeNull();
  });

  it("gives a copy saved from another household its own files in its own household's folder", async () => {
    const original = await makeRecipe(a);
    expect(await storeRecipeImage(a.db as never, original)).toBe("stored");
    expect((await a.db.from("recipe").update({ is_shared: true }).eq("id", original)).error).toBeNull();
    const shared = await b.db.rpc("get_shared_recipe", { shared_recipe_id: original });
    expect(shared.error).toBeNull();
    const version = (shared.data as { version: string }).version;
    const saved = await b.db.rpc("save_shared_recipe", { shared_recipe_id: original, ingredient_ids: [], expected_version: version });
    expect(saved.error).toBeNull();
    const copy = saved.data as unknown as string;
    // The copy has the address, and no picture of its own yet.
    expect(await getImageStateIn(b.db as never, copy)).toEqual({ householdId: householdB, imageUrl: address, imagePath: null });
    expect(await storeRecipeImage(b.db as never, copy)).toBe("stored");
    const copyFolder = recipeImageFolder(householdB, copy);
    expect(filesOf(householdB)).toEqual([recipeImageFile(copyFolder, "full"), recipeImageFile(copyFolder, "thumb")]);
    // Two sets of files, one per household, nothing shared between them.
    const originalFolder = recipeImageFolder(householdA, original);
    expect(filesOf(householdA)).toEqual([recipeImageFile(originalFolder, "full"), recipeImageFile(originalFolder, "thumb")]);
    expect(await downloadImageIn(b.db as never, originalFolder, "full")).toBeNull();
    // Stopping the sharing or deleting the original leaves the copy's files alone.
    await removeRecipeImages(a.db as never, originalFolder);
    expect(filesOf(householdA)).toEqual([]);
    expect(await downloadImageIn(b.db as never, copyFolder, "thumb")).not.toBeNull();
  });
});

describe("removing and sweeping", () => {
  it("removes both files of a deleted recipe with the Storage API", async () => {
    const id = await makeRecipe(a);
    expect(await storeRecipeImage(a.db as never, id)).toBe("stored");
    const folder = await recipeImageFolderOf(a.db as never, id);
    expect(folder).not.toBeNull();
    expect((await a.db.from("recipe").delete().eq("id", id)).error).toBeNull();
    expect(filesOf(householdA)).toHaveLength(2);
    await removeRecipeImages(a.db as never, folder);
    expect(filesOf(householdA)).toEqual([]);
  });

  it("sweeps the files of a recipe that is gone, but never a recipe's own files", async () => {
    const kept = await makeRecipe(a);
    expect(await storeRecipeImage(a.db as never, kept)).toBe("stored");
    const gone = await makeRecipe(a);
    expect(await storeRecipeImage(a.db as never, gone)).toBe("stored");
    expect((await a.db.from("recipe").delete().eq("id", gone)).error).toBeNull();
    // Fresh files are never taken (10 minutes): age them in the database.
    localSql(`update storage.objects set created_at = now() - interval '1 hour' where bucket_id = '${recipeImageBucket}' returning id`);
    await sweepRecipeImages(a.db as never);
    expect(filesOf(householdA)).toEqual([
      recipeImageFile(recipeImageFolder(householdA, kept), "full"),
      recipeImageFile(recipeImageFolder(householdA, kept), "thumb"),
    ]);
  });
});
