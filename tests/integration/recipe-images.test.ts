import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  recipeImageBucket,
  recipeImageFile,
  recipeImageFolder,
  recipeImageHouseholdCap,
  recipeImageMaxFileBytes,
  recipeImageMediaTypes,
} from "@/features/recipes/domain/recipe-image";
import { adminClient, anonClient, createTestUser, deleteTestUsers, householdOf, localSql, moveToHousehold, type Db, type TestUser } from "./support";

// Recipe pictures in the app's own storage (20261112100000_recipe_images.sql), tried
// against Storage with real sessions, the way an attacker with the publishable key would:
// recipe.image_path is tied to the row's household and id; only a household's members read,
// add and remove files under their household's folder and under a recipe of the household;
// another household and anon can neither read, list, sign, copy, overwrite nor remove them;
// the per-household cap holds, also for uploads at the same time; and the files of a deleted
// recipe are found by recipe_image_orphans and removed with the Storage API.

let a: TestUser;
let a2: TestUser;
let b: TestUser;
let householdA: string;
let householdB: string;
let webp: Uint8Array;

const created: string[] = [];

async function makeRecipe(user: TestUser): Promise<string> {
  const { data, error } = await user.db.from("recipe").insert({ title: "Bild", original_servings: 4, source_kind: "text" }).select("id").single();
  expect(error).toBeNull();
  created.push(data!.id);
  return data!.id;
}

const upload = (db: Db, path: string, bytes: Uint8Array = webp, contentType = "image/webp") =>
  db.storage.from(recipeImageBucket).upload(path, bytes, { contentType, upsert: false });

function expectRefused(result: Awaited<ReturnType<typeof upload>>, what: string): void {
  expect(result.data, what).toBeNull();
  expect(result.error, what).not.toBeNull();
}

/** Storage's refusal by the policy: 403 with Postgres's row-level security message (42501). */
function expectPolicyRefusal(result: Awaited<ReturnType<typeof upload>>, what: string): void {
  expectRefused(result, what);
  const error = result.error as { statusCode?: string; message?: string };
  expect(error.statusCode, what).toBe("403");
  expect(error.message, what).toMatch(/row-level security/);
}

/** Puts `count` rows (files without bytes) under `household`'s folder as the superuser and without an owner, so the cap guard lets them in. */
function addRows(household: string, count: number): void {
  if (count <= 0) return;
  localSql(`
    insert into storage.objects (bucket_id, name, metadata)
    select '${recipeImageBucket}', '${household}/' || gen_random_uuid() || '/full', '{"size": 10, "mimetype": "image/webp"}'::jsonb
    from generate_series(1, ${count}) returning id`);
}

const filesOf = (household: string) =>
  localSql<{ name: string }>(`select name from storage.objects where bucket_id = '${recipeImageBucket}' and left(name, 37) = '${household}/' order by name`).map(
    (row) => row.name,
  );

async function emptyFolders(): Promise<void> {
  for (const household of [householdA, householdB]) {
    const names = filesOf(household);
    for (let start = 0; start < names.length; start += 100) {
      const { error } = await adminClient().storage.from(recipeImageBucket).remove(names.slice(start, start + 100));
      if (error) throw error;
    }
  }
}

beforeAll(async () => {
  webp = new Uint8Array(await sharp({ create: { width: 64, height: 48, channels: 3, background: "#c85028" } }).webp().toBuffer());
  a = await createTestUser("rimg-a");
  a2 = await createTestUser("rimg-a2");
  b = await createTestUser("rimg-b");
  householdA = await householdOf(a.id);
  householdB = await householdOf(b.id);
  await moveToHousehold(a2, householdA);
});

afterEach(async () => {
  await emptyFolders();
});

afterAll(async () => {
  await deleteTestUsers();
});

describe("the bucket and the column", () => {
  it("is private, 1.5 MB, WebP and JPEG, with the cap the domain has", () => {
    const [bucket] = localSql<{ public: boolean; file_size_limit: number; types: string }>(
      `select public, file_size_limit, array_to_string(allowed_mime_types, ',') as types from storage.buckets where id = '${recipeImageBucket}'`,
    );
    expect(bucket!.public).toBe(false);
    expect(Number(bucket!.file_size_limit)).toBe(recipeImageMaxFileBytes);
    expect(bucket!.types.split(",")).toEqual([...recipeImageMediaTypes]);
    expect(localSql<{ cap: number }>(`select public.recipe_image_household_cap() as cap`)[0]!.cap).toBe(recipeImageHouseholdCap);
    expect(localSql<{ name: string }>(`select tgname as name from pg_trigger where tgrelid = 'storage.objects'::regclass and tgname = 'recipe_image_cap_guard'`)).toHaveLength(1);
  });

  it("lets a recipe point only at its own household's folder under its own id", async () => {
    const recipe = await makeRecipe(a);
    const own = recipeImageFolder(householdA, recipe);
    expect((await a.db.from("recipe").update({ image_path: own }).eq("id", recipe)).error).toBeNull();
    for (const wrong of [recipeImageFolder(householdB, recipe), recipeImageFolder(householdA, randomUUID()), `${own}/full`, "x", ""]) {
      const result = await a.db.from("recipe").update({ image_path: wrong }).eq("id", recipe);
      expect(result.error?.code, `image_path ${wrong}`).toBe("23514");
    }
    const { data } = await a.db.from("recipe").select("image_path").eq("id", recipe).single();
    expect(data!.image_path).toBe(own);
  });

  it("never lets B change A's recipe", async () => {
    const recipe = await makeRecipe(a);
    const result = await b.db.from("recipe").update({ image_path: recipeImageFolder(householdA, recipe) }).eq("id", recipe).select("id");
    expect(result.data ?? []).toEqual([]);
    expect((await adminClient().from("recipe").select("image_path").eq("id", recipe).single()).data!.image_path).toBeNull();
  });
});

describe("who may add files", () => {
  it("lets a member add the full size and the thumbnail under a recipe of the household, and every member read them", async () => {
    const recipe = await makeRecipe(a);
    const folder = recipeImageFolder(householdA, recipe);
    expect((await upload(a.db, recipeImageFile(folder, "full"))).error).toBeNull();
    expect((await upload(a2.db, recipeImageFile(folder, "thumb"))).error, "another member of the household").toBeNull();
    for (const user of [a, a2]) {
      for (const size of ["full", "thumb"] as const) {
        const downloaded = await user.db.storage.from(recipeImageBucket).download(recipeImageFile(folder, size));
        expect(downloaded.error, `${size} for a member`).toBeNull();
        expect(new Uint8Array(await downloaded.data!.arrayBuffer())).toEqual(webp);
      }
    }
  });

  it("refuses a name that is not <household>/<recipe>/full or thumb", async () => {
    const recipe = await makeRecipe(a);
    const folder = recipeImageFolder(householdA, recipe);
    for (const name of [`${folder}/original`, `${folder}/full.webp`, `${folder}/full/extra`, `${folder}`, `${householdA}/full`, `${householdA}/not-a-uuid/full`, `${folder}/../full`]) {
      expectRefused(await upload(a.db, name), `upload ${name}`);
    }
  });

  it("refuses a file under another household's folder, or under a recipe that is not the household's", async () => {
    const recipeA = await makeRecipe(a);
    const recipeB = await makeRecipe(b);
    expectPolicyRefusal(await upload(a.db, recipeImageFile(recipeImageFolder(householdB, recipeB), "full")), "A into B's folder");
    expectPolicyRefusal(await upload(a.db, recipeImageFile(recipeImageFolder(householdA, recipeB), "full")), "A under B's recipe in A's own folder");
    expectPolicyRefusal(await upload(a.db, recipeImageFile(recipeImageFolder(householdB, recipeA), "full")), "A under A's recipe in B's folder");
    expectPolicyRefusal(await upload(a.db, recipeImageFile(recipeImageFolder(householdA, randomUUID()), "full")), "A under a recipe that does not exist");
    expectRefused(await upload(anonClient(), recipeImageFile(recipeImageFolder(householdA, recipeA), "full")), "anon");
    expect(filesOf(householdA)).toEqual([]);
    expect(filesOf(householdB)).toEqual([]);
  });

  it("refuses a file over 1.5 MB, a type that is not WebP or JPEG, and an overwrite", async () => {
    const recipe = await makeRecipe(a);
    const folder = recipeImageFolder(householdA, recipe);
    const large = await upload(a.db, recipeImageFile(folder, "full"), new Uint8Array(recipeImageMaxFileBytes + 1));
    expect((large.error as { statusCode?: string }).statusCode).toBe("413");
    for (const type of ["image/png", "image/gif", "image/svg+xml", "text/html"]) {
      const refused = await upload(a.db, recipeImageFile(folder, "full"), webp, type);
      expect((refused.error as { statusCode?: string }).statusCode, type).toBe("415");
    }
    expect((await upload(a.db, recipeImageFile(folder, "full"), webp, "image/jpeg")).error).toBeNull();
    expectRefused(await upload(a.db, recipeImageFile(folder, "full")), "a second upload to the same name");
    const over = await a.db.storage.from(recipeImageBucket).upload(recipeImageFile(folder, "full"), webp, { contentType: "image/webp", upsert: true });
    expectRefused(over, "an upsert (there is no update policy)");
  });
});

describe("B and anon against A's file", () => {
  let recipe: string;
  let folder: string;
  let path: string;

  beforeAll(async () => {
    recipe = await makeRecipe(a);
    folder = recipeImageFolder(householdA, recipe);
    path = recipeImageFile(folder, "full");
  });

  it("cannot read, list, sign, copy, move, overwrite or remove it", async () => {
    expect((await upload(a.db, path)).error).toBeNull();
    const ownB = recipeImageFile(recipeImageFolder(householdB, await makeRecipe(b)), "full");
    for (const [who, db] of [["B", b.db], ["anon", anonClient()]] as const) {
      const files = db.storage.from(recipeImageBucket);
      expect((await files.download(path)).error, `${who} downloads`).not.toBeNull();
      expect((await files.createSignedUrl(path, 60)).error, `${who} signs`).not.toBeNull();
      const bulk = await files.createSignedUrls([path], 60);
      expect((bulk.data ?? []).every((entry) => !entry.signedUrl), `${who} bulk-signs`).toBe(true);
      expect((await files.list(householdA)).data ?? [], `${who} lists A's household folder`).toEqual([]);
      expect((await files.list(`${householdA}/${recipe}`)).data ?? [], `${who} lists A's recipe folder`).toEqual([]);
      expect((await files.list(householdA, { search: "full" })).data ?? [], `${who} searches A's folder`).toEqual([]);
      expect((await files.copy(path, ownB)).error, `${who} copies A's file into own folder`).not.toBeNull();
      expect((await files.move(path, ownB)).error, `${who} moves A's file`).not.toBeNull();
      expect((await files.upload(path, webp, { contentType: "image/webp", upsert: true })).error, `${who} overwrites`).not.toBeNull();
      expect((await files.remove([path])).data ?? [], `${who} removes`).toEqual([]);
      expect((await files.remove([`${householdA}/%`, "%"])).data ?? [], `${who} removes with wildcards`).toEqual([]);
      expect((await files.createSignedUploadUrl(path, { upsert: true })).error, `${who} gets an upload URL for it`).not.toBeNull();
      expect((await fetch(files.getPublicUrl(path).data.publicUrl)).status, `${who} fetches the public URL`).not.toBe(200);
    }
    const session = (await b.db.auth.getSession()).data.session!;
    const direct = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/authenticated/${recipeImageBucket}/${path}`, {
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
    });
    expect(direct.status, "B fetches A's file over HTTP with a token").not.toBe(200);
    const after = await adminClient().storage.from(recipeImageBucket).download(path);
    expect(after.error).toBeNull();
    expect(new Uint8Array(await after.data!.arrayBuffer())).toEqual(webp);
  });

  it("cannot read it even when the recipe is shared (a copy is fetched into the household's own storage)", async () => {
    expect((await a.db.from("recipe").update({ is_shared: true }).eq("id", recipe)).error).toBeNull();
    expect((await b.db.storage.from(recipeImageBucket).download(path)).error).not.toBeNull();
    expect((await a.db.from("recipe").update({ is_shared: false }).eq("id", recipe)).error).toBeNull();
  });

  it("lists nothing of A's in B's own folder either", async () => {
    expect((await b.db.storage.from(recipeImageBucket).list(householdB)).data ?? []).toEqual([]);
    expect((await b.db.storage.from(recipeImageBucket).list()).data ?? []).toEqual([]);
  });
});

describe("the cap", () => {
  const cap = recipeImageHouseholdCap;
  let recipes: string[];

  beforeAll(async () => {
    recipes = [await makeRecipe(a), await makeRecipe(a), await makeRecipe(a)];
  });

  const nameOf = (index: number, size: "full" | "thumb" = "full") => recipeImageFile(recipeImageFolder(householdA, recipes[index]!), size);

  it("takes uploads up to the cap from either member, and refuses the next one for every member", async () => {
    addRows(householdA, cap - 3);
    expect((await a.db.rpc("recipe_image_room_in_my_household")).data).toBe(true);
    expect((await upload(a.db, nameOf(0))).error).toBeNull();
    expect((await upload(a2.db, nameOf(0, "thumb"))).error).toBeNull();
    expect((await upload(a.db, nameOf(1))).error).toBeNull();
    expect(filesOf(householdA)).toHaveLength(cap);
    expect((await a.db.rpc("recipe_image_room_in_my_household")).data).toBe(false);
    expect((await a2.db.rpc("recipe_image_room_in_my_household")).data).toBe(false);
    expectPolicyRefusal(await upload(a.db, nameOf(1, "thumb")), "A past the cap");
    expectPolicyRefusal(await upload(a2.db, nameOf(2)), "A2 past the cap");
    expect(filesOf(householdA)).toHaveLength(cap);
  });

  it("leaves household B alone: A's full folder does not count for B", async () => {
    addRows(householdA, cap);
    const recipeB = await makeRecipe(b);
    expect((await b.db.rpc("recipe_image_room_in_my_household")).data).toBe(true);
    expect((await upload(b.db, recipeImageFile(recipeImageFolder(householdB, recipeB), "full"))).error).toBeNull();
    expect(filesOf(householdB)).toHaveLength(1);
  });

  it("lets one upload in again when a file is removed", async () => {
    addRows(householdA, cap - 1);
    expect((await upload(a.db, nameOf(0))).error).toBeNull();
    expectPolicyRefusal(await upload(a.db, nameOf(0, "thumb")), "at the cap");
    const removed = await a.db.storage.from(recipeImageBucket).remove([nameOf(0)]);
    expect(removed.data).toHaveLength(1);
    expect((await upload(a2.db, nameOf(1))).error, "a2 takes the freed place").toBeNull();
    expectPolicyRefusal(await upload(a.db, nameOf(1, "thumb")), "at the cap again");
  });

  it("never passes the cap with uploads at the same time", async () => {
    addRows(householdA, cap - 2);
    const targets = [nameOf(0), nameOf(0, "thumb"), nameOf(1), nameOf(1, "thumb"), nameOf(2), nameOf(2, "thumb")];
    const results = await Promise.all(targets.map((name, index) => upload(index % 2 ? a.db : a2.db, name)));
    expect(results.filter((result) => result.error === null)).toHaveLength(2);
    for (const result of results.filter((result) => result.error !== null)) expectPolicyRefusal(result, "a refused one");
    expect(filesOf(householdA)).toHaveLength(cap);
  }, 60_000);

  it("keeps every file of a household over the cap, and only refuses new ones", async () => {
    addRows(householdA, cap + 5);
    const before = filesOf(householdA);
    expectPolicyRefusal(await upload(a.db, nameOf(0)), "over the cap");
    expect(filesOf(householdA)).toEqual(before);
  });

  it("lets the service role add a file past the cap (a restore)", async () => {
    addRows(householdA, cap);
    const restored = await adminClient().storage.from(recipeImageBucket).upload(nameOf(0), webp, { contentType: "image/webp" });
    expect(restored.error).toBeNull();
    expect(filesOf(householdA)).toHaveLength(cap + 1);
    expectPolicyRefusal(await upload(a.db, nameOf(1)), "a member over the cap");
  });
});

describe("files that no recipe points at", () => {
  it("are found by recipe_image_orphans (only the household's own, and not too fresh), and removed with the Storage API", async () => {
    const recipe = await makeRecipe(a);
    const folder = recipeImageFolder(householdA, recipe);
    expect((await upload(a.db, recipeImageFile(folder, "full"))).error).toBeNull();
    expect((await upload(a.db, recipeImageFile(folder, "thumb"))).error).toBeNull();
    const orphans = async (db: Db, age: string) => (await db.rpc("recipe_image_orphans", { min_age: age })).data ?? [];

    // Uploaded but the row does not point at them yet: orphans after the minimum age, never before.
    expect(await orphans(a.db, "10 minutes")).toEqual([]);
    expect((await orphans(a.db, "0 seconds")).sort()).toEqual([recipeImageFile(folder, "full"), recipeImageFile(folder, "thumb")].sort());
    expect(await orphans(a2.db, "0 seconds")).toHaveLength(2);
    expect(await orphans(b.db, "0 seconds"), "B sees nothing of A's").toEqual([]);
    expect(await orphans(a.db, "-1 minute"), "a negative age gives nothing").toEqual([]);

    // Once the recipe points at the folder they are no orphans.
    expect((await a.db.from("recipe").update({ image_path: folder }).eq("id", recipe)).error).toBeNull();
    expect(await orphans(a.db, "0 seconds")).toEqual([]);

    // Deleting the recipe leaves the files (SQL never deletes files); then they are orphans, and the app removes them.
    expect((await a.db.from("recipe").delete().eq("id", recipe)).error).toBeNull();
    const left = await orphans(a.db, "0 seconds");
    expect(left).toHaveLength(2);
    const removed = await a.db.storage.from(recipeImageBucket).remove(left);
    expect(removed.error).toBeNull();
    expect(removed.data).toHaveLength(2);
    expect(filesOf(householdA)).toEqual([]);
  });

  it("are never listed for anon, and the function is not callable without a session", async () => {
    expect((await anonClient().rpc("recipe_image_orphans", { min_age: "0 seconds" })).error?.code).toBe("42501");
    expect((await anonClient().rpc("recipe_image_room_in_my_household")).error?.code).toBe("42501");
  });
});
