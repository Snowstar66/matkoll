import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadIngredientDefaults, loadIngredientNames } from "@/features/catalog/data/queries";
import { getCurrentPlanIn } from "@/features/mealplan/data/queries";
import { addToCurrentPlanIn } from "@/features/mealplan/data/write";
import { addToPantryIn, findPantryAdditionsIn, forgetPantryAdditionsIn } from "@/features/pantry/data/add";
import { PantryDataError } from "@/features/pantry/data/client";
import { loadPantrySnapshot } from "@/features/pantry/data/queries";
import { normalizeSiteName } from "@/features/pantry/domain/site";
import { getRecipesByIdsIn } from "@/features/recipes/data/queries";
import { recipeLineKey } from "@/features/shopping";
import { listCheckRowsIn, listChecksIn, setCheckIn } from "@/features/shopping/data/checks";
import { ShoppingDataError } from "@/features/shopping/data/client";
import { listCustomItemsIn } from "@/features/shopping/data/custom-items";
import { listOverridesIn } from "@/features/shopping/data/overrides";
import { clearPutInPantryIn, putInPantryWith, type PutInPantryDeps } from "@/features/shopping/data/put-in-pantry";
import { loadShoppingList } from "@/features/shopping/data/queries";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, countRows, createTestUser, deleteTestUsers, type Db, type TestUser } from "./support";

// "Lägg i förrådet" on a place (Story 8.3, FR-19, FR-33, AD-8, AD-24) against
// local Supabase: the list is counted against the list's place and the items
// go there, also when another place is selected meanwhile; the receipts are
// per user, so a second run never adds an item twice, also with another
// place; and a removed place, or another user's, gives pantry_site_gone with
// nothing written and the checks kept. The second place is added, and
// selected, with the service role (choosing a place is Story 8.2).

// pantry/server.ts with the session client replaced by the test user's, so
// addToPantry runs as in a request.
let sessionDb: Db | undefined;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    if (!sessionDb) throw new Error("No session client");
    return sessionDb;
  },
}));
vi.mock("@/features/auth/server", () => ({ requireUser: async () => ({ ok: true, data: { id: "user" } }) }));
const pantryServer = await import("@/features/pantry/server");

/** A place for `userId`, added with the service role, not selected unless asked. */
async function addSite(userId: string, name: string, selected = false): Promise<string> {
  const { data, error } = await adminClient()
    .from("pantry_site")
    .insert({ user_id: userId, name, normalized_name: normalizeSiteName(name), is_selected: selected })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/**
 * Makes `siteId` the user's selected place behind the functions' back, in
 * one transaction, so pantry_site_one_selected (checked at commit) holds: as
 * tests/integration/pantry-site.test.ts does it, through the Supabase CLI.
 */
function selectSite(userId: string, siteId: string): void {
  execFileSync(
    "node_modules/.bin/supabase",
    [
      "db",
      "query",
      "--local",
      `do $test$
begin
  update public.pantry_site set is_selected = false where user_id = '${userId}' and is_selected;
  update public.pantry_site set is_selected = true where id = '${siteId}';
end
$test$`,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

/**
 * A user with Hemma (from ensure_pantry_defaults) and Stugan, Stugan
 * selected. Ketchup (Skafferi) and korv (Kyl) in the catalog; the recipe
 * "Korv med ketchup" (1 förp ketchup, 4 st korv) on the current plan; korv on
 * both places, ketchup on Hemma only. Ketchup's line is checked off.
 */
async function scenario(name: string) {
  const user = await createTestUser(name);
  const defaults = await user.db.rpc("ensure_pantry_defaults");
  if (defaults.error) throw defaults.error;
  const { data: sites, error: sitesError } = await adminClient().from("pantry_site").select("id").eq("user_id", user.id);
  if (sitesError) throw sitesError;
  const hemma = sites[0]!.id;
  const stugan = await addSite(user.id, "Stugan");

  const { data: ingredients, error } = await user.db
    .from("ingredient")
    .insert([
      { name: "Ketchup", normalized_name: "ketchup", section: "Skafferi", location: "Skafferi" },
      { name: "Korv", normalized_name: "korv", section: "Kött och fisk", location: "Kyl" },
    ])
    .select("id, name");
  if (error) throw error;
  const ketchup = ingredients.find((row) => row.name === "Ketchup")!.id;
  const korv = ingredients.find((row) => row.name === "Korv")!.id;

  const recipe = await user.db
    .from("recipe")
    .insert({ title: "Korv med ketchup", original_servings: 4, source_kind: "text" })
    .select("id")
    .single();
  if (recipe.error) throw recipe.error;
  const lines = await user.db.from("recipe_ingredient").insert([
    { recipe_id: recipe.data.id, position: 0, original_text: "1 flaska ketchup", ingredient_id: ketchup, amount: 1, unit: "förp", is_vague: false },
    { recipe_id: recipe.data.id, position: 1, original_text: "4 korvar", ingredient_id: korv, amount: 4, unit: "st", is_vague: false },
  ]);
  if (lines.error) throw lines.error;
  await addToCurrentPlanIn(user.db, {
    id: randomUUID(),
    recipeId: recipe.data.id,
    recipeTitle: "Korv med ketchup",
    servings: 4,
    planName: "Vecka 44",
  });
  const planId = (await getCurrentPlanIn(user.db))!.id;

  const seeded = await adminClient()
    .from("pantry_item")
    .insert([
      { user_id: user.id, site_id: hemma, ingredient_id: ketchup, location: "Skafferi", amount: 1, unit: "förp" },
      { user_id: user.id, site_id: hemma, ingredient_id: korv, location: "Kyl", amount: 8, unit: "st" },
      { user_id: user.id, site_id: stugan, ingredient_id: korv, location: "Kyl", amount: 8, unit: "st" },
    ]);
  if (seeded.error) throw seeded.error;
  selectSite(user.id, stugan);

  const ketchupKey = recipeLineKey(ketchup, "förp");
  await setCheckIn(user.db, planId, ketchupKey, true);
  sessionDb = user.db;
  return { user, hemma, stugan, ketchup, korv, planId, ketchupKey };
}

/**
 * The flow as putCheckedInPantry gives it for the list's place `siteId`: the
 * list counted against that place's pantry, and pantry.addToPantry with the
 * place.
 */
function flow(user: TestUser, siteId: string | null, change: Partial<PutInPantryDeps> = {}): PutInPantryDeps {
  return {
    sources: {
      currentPlan: () => getCurrentPlanIn(user.db),
      recipesByIds: (ids) => getRecipesByIdsIn(user.db, ids),
      pantry: () => loadPantrySnapshot(user.db, siteId ?? undefined),
      ingredientNames: (ids) => loadIngredientNames(user.db, ids),
      ingredientDefaults: (ids) => loadIngredientDefaults(user.db, ids),
      customItems: () => listCustomItemsIn(user.db),
      overrides: (planId) => listOverridesIn(user.db, planId),
    },
    checkRows: (planId) => listCheckRowsIn(user.db, planId),
    findAdditions: (keys) => findPantryAdditionsIn(user.db, keys),
    addToPantry: (items) => pantryServer.addToPantry(items, siteId),
    clear: (planId, cleared) => clearPutInPantryIn(user.db, planId, cleared),
    forgetAdditions: (keys) => forgetPantryAdditionsIn(user.db, keys),
    ...change,
  };
}

/** The user's pantry on one place, as (ingredient, location, amount, unit), read with the service role. */
async function onSite(userId: string, siteId: string) {
  const { data, error } = await adminClient()
    .from("pantry_item")
    .select("ingredient_id, location, amount, unit")
    .eq("user_id", userId)
    .eq("site_id", siteId);
  if (error) throw error;
  return data
    .map((row) => ({ ...row, amount: row.amount === null ? null : Number(row.amount) }))
    .sort((a, b) => `${a.ingredient_id}|${a.location}`.localeCompare(`${b.ingredient_id}|${b.location}`));
}

const failingClear = async () => Promise.reject(new ShoppingDataError("clear_failed 08006", "08006"));

beforeAll(() => {
  localSupabaseUrl();
});

afterAll(async () => {
  sessionDb = undefined;
  await deleteTestUsers();
});

describe("getPantryForStatus", () => {
  it("gives the selected place and exactly that place's pantry", async () => {
    const { stugan, ketchup, korv } = await scenario("put-site-status");
    const { site, snapshot } = await pantryServer.getPantryForStatus();
    expect(site).toEqual({ id: stugan, name: "Stugan", siteCount: 2 });
    expect(snapshot?.has(korv)).toBe(true);
    // Ketchup is at Hemma only.
    expect(snapshot?.has(ketchup)).toBe(false);
  });
});

describe("Lägg i förrådet on a place", () => {
  it("counts the list against the list's place and puts the items there, at the catalog's location", async () => {
    const { user, hemma, stugan, ketchup, planId, ketchupKey } = await scenario("put-site-stugan");
    const hemmaBefore = await onSite(user.id, hemma);
    // Against Stugan the ketchup is missing; against Hemma it would be covered.
    const list = await loadShoppingList({ ...flow(user, stugan).sources, checks: (id) => listChecksIn(user.db, id) });
    expect(list.lines.map((line) => [line.key, line.checked])).toEqual([[ketchupKey, true]]);

    expect(await putInPantryWith(flow(user, stugan), planId)).toMatchObject({ kind: "done", added: 1, pantryWritten: true });
    expect((await onSite(user.id, stugan)).find((row) => row.ingredient_id === ketchup)).toEqual({
      ingredient_id: ketchup,
      location: "Skafferi",
      amount: 1,
      unit: "förp",
    });
    expect(await onSite(user.id, hemma)).toEqual(hemmaBefore);
    expect(await countRows("shopping_check", user.id)).toBe(0);
  });

  it("puts the items on the list's place when another is selected meanwhile", async () => {
    const { user, hemma, stugan, ketchup, planId } = await scenario("put-site-switched");
    const hemmaBefore = await onSite(user.id, hemma);
    selectSite(user.id, hemma);
    expect(await putInPantryWith(flow(user, stugan), planId)).toMatchObject({ kind: "done", added: 1 });
    expect((await onSite(user.id, stugan)).some((row) => row.ingredient_id === ketchup)).toBe(true);
    expect(await onSite(user.id, hemma)).toEqual(hemmaBefore);
  });

  it("never adds an item twice when a second run, after an interruption, names another place", async () => {
    const { user, hemma, stugan, ketchup, planId, ketchupKey } = await scenario("put-site-retry");
    // Hemma without ketchup, so the line is on the list against both places.
    const removed = await adminClient().from("pantry_item").delete().eq("site_id", hemma).eq("ingredient_id", ketchup);
    if (removed.error) throw removed.error;
    expect(await putInPantryWith(flow(user, stugan, { clear: failingClear }), planId)).toMatchObject({
      kind: "clear_failed",
      pantryWritten: true,
    });
    expect(await countRows("pantry_addition", user.id)).toBe(1);

    // The view switched to Hemma before the second tap: the receipt is per
    // user, so the ketchup bought once stays on Stugan only.
    selectSite(user.id, hemma);
    // The pantry takes nothing in this run, so the confirmation names no place.
    expect(await putInPantryWith(flow(user, hemma), planId)).toMatchObject({ kind: "done", handled: 0 });
    expect((await onSite(user.id, stugan)).filter((row) => row.ingredient_id === ketchup)).toEqual([
      { ingredient_id: ketchup, location: "Skafferi", amount: 1, unit: "förp" },
    ]);
    expect((await onSite(user.id, hemma)).some((row) => row.ingredient_id === ketchup)).toBe(false);
    expect((await listChecksIn(user.db, planId)).includes(ketchupKey)).toBe(false);
    expect(await countRows("pantry_addition", user.id)).toBe(0);
  });

  it("gives pantry_site_gone for a place removed meanwhile, writing nothing and keeping the checks", async () => {
    const { user, hemma, stugan, planId, ketchupKey } = await scenario("put-site-gone");
    // Stugan is emptied and removed on another device; Hemma is selected there first.
    selectSite(user.id, hemma);
    const emptied = await adminClient().from("pantry_item").delete().eq("site_id", stugan);
    if (emptied.error) throw emptied.error;
    const deleted = await adminClient().from("pantry_site").delete().eq("id", stugan);
    if (deleted.error) throw deleted.error;
    const hemmaBefore = await onSite(user.id, hemma);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const outcome = await putInPantryWith(flow(user, stugan), planId);
    expect(outcome).toEqual({ kind: "pantry_failed", error: expect.objectContaining({ code: "pantry_site_gone" }) });
    expect(log).toHaveBeenCalledWith("pantry_site_gone", { reason: "MK410" });
    log.mockRestore();
    expect(await onSite(user.id, hemma)).toEqual(hemmaBefore);
    expect(await listChecksIn(user.db, planId)).toEqual([ketchupKey]);
    expect(await countRows("pantry_addition", user.id)).toBe(0);
  });

  it("gives pantry_site_gone for another user's place, writing nothing", async () => {
    const { user, ketchup } = await scenario("put-site-other");
    const other = await createTestUser("put-site-other-owner");
    // The other user's only place, so selected.
    const othersPlace = await addSite(other.id, "Stugan", true);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const item = { key: randomUUID(), ingredientId: ketchup, amount: 1, unit: "förp" as const };
    expect(await pantryServer.addToPantry([item], othersPlace)).toEqual(
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "pantry_site_gone" }) }),
    );
    log.mockRestore();
    expect(await countRows("pantry_addition", user.id)).toBe(0);
    expect(await countRows("pantry_item", other.id)).toBe(0);
  });

  it("refuses a place that is not a uuid before writing, as addToPantryIn's invalid_site", async () => {
    const { user, ketchup } = await scenario("put-site-invalid");
    const item = { key: randomUUID(), ingredientId: ketchup, amount: 1, unit: "förp" as const };
    expect(await pantryServer.addToPantry([item], "Stugan")).toEqual(
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "validation" }) }),
    );
    await expect(
      addToPantryIn(user.db, [item], (ids) => loadIngredientDefaults(user.db, ids), "Stugan"),
    ).rejects.toThrow(new PantryDataError("invalid_site"));
    expect(await countRows("pantry_addition", user.id)).toBe(0);
  });
});
