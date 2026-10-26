import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { matchIngredientsIn } from "@/features/catalog/actions/match-ingredients";
import { commitIngredients } from "@/features/catalog/data/commit";
import { findIngredientIdsIn, loadIngredientNames, searchCatalog } from "@/features/catalog/data/queries";
import { LOCATIONS, SECTIONS, UNITS, type IngredientChoice, type IngredientProposal } from "@/features/catalog";
import { localSupabaseUrl } from "../local-supabase";
import {
  adminClient,
  anonClient,
  countRows,
  createTestUser,
  deleteTestUsers,
  expectRlsIsolation,
  type Db,
  type TestUser,
} from "./support";

// The catalog against local Supabase (AD-4, AD-6, AD-20): RLS on both tables,
// matching that never writes, concurrent commits, corrections saved as
// synonyms and isolation between users' catalogs.

let unique = 0;
const uniqueName = (base: string) => `${base} ${Date.now()}-${unique++}`;
const madeUpId = "00000000-0000-4000-8000-000000000000";

async function addIngredient(db: Db, name: string, section = "Frukt och grönt"): Promise<string> {
  const { data, error } = await db
    .from("ingredient")
    .insert({ name, normalized_name: name, section, location: "Skafferi" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function addSynonym(db: Db, normalized: string, ingredientId: string): Promise<void> {
  const { error } = await db.from("ingredient_synonym").insert({ normalized, ingredient_id: ingredientId });
  if (error) throw error;
}

async function synonymsOf(user: TestUser, normalized?: string) {
  let query = adminClient().from("ingredient_synonym").select("normalized, ingredient_id").eq("user_id", user.id);
  if (normalized !== undefined) query = query.eq("normalized", normalized);
  const { data, error } = await query.order("normalized");
  if (error) throw error;
  return data;
}

const saffran: IngredientProposal = { name: "Saffran", section: "Skafferi", location: "Skafferi", defaultUnit: "g" };
const newChoice = (text: string, proposal: IngredientProposal): IngredientChoice => ({
  text,
  ingredient: { kind: "new", proposal },
});
const chosen = (text: string, ingredientId: string): IngredientChoice => ({
  text,
  ingredient: { kind: "chosen", ingredientId },
});

beforeAll(() => {
  localSupabaseUrl();
});

afterAll(async () => {
  await deleteTestUsers();
});

describe("schema and RLS", () => {
  it("isolates ingredient", async () => {
    await expectRlsIsolation("ingredient", async () => ({
      name: "Gul lök",
      normalized_name: uniqueName("gul lök"),
      section: "Frukt och grönt",
      location: "Skafferi",
      default_unit: "st",
    }));
  });

  it("isolates ingredient_synonym", async () => {
    await expectRlsIsolation("ingredient_synonym", async (owner) => ({
      ingredient_id: await addIngredient(owner, uniqueName("gul lök")),
      normalized: uniqueName("lök"),
    }));
  });

  it("does not let a synonym point at another user's ingredient", async () => {
    const owner = await createTestUser("fk-owner");
    const other = await createTestUser("fk-other");
    const ingredientId = await addIngredient(owner.db, "gul lök");
    const { error } = await other.db.from("ingredient_synonym").insert({ normalized: "lök", ingredient_id: ingredientId });
    expect(error?.code).toBe("23503");
  });

  it("lets only signed-in users run the commit function", async () => {
    const args = {
      new_ingredients: [{ name: "Saffran", normalized_name: "saffran", section: "Skafferi", location: "Skafferi", default_unit: null }],
      synonyms: [],
    };
    expect((await anonClient().rpc("commit_ingredients", args)).error?.code).toBe("42501");
    // auth.uid() is null for the service role, so it may not run it either.
    expect((await adminClient().rpc("commit_ingredients", args)).error?.code).toBe("42501");
  });

  it("rejects values outside the domain lists and blank names", async () => {
    const user = await createTestUser("checks");
    const base = { name: "x", normalized_name: "x", section: "Skafferi", location: "Skafferi", default_unit: null };
    for (const bad of [
      { section: "Kryddor" },
      { location: "Källare" },
      { default_unit: "deciliter" },
      { normalized_name: "" },
      { normalized_name: "  " },
      { name: " " },
    ]) {
      const { error } = await user.db.from("ingredient").insert({ ...base, ...bad });
      expect(error?.code, JSON.stringify(bad)).toBe("23514");
    }
    const id = await addIngredient(user.db, "y");
    const { error } = await user.db.from("ingredient_synonym").insert({ normalized: " ", ingredient_id: id });
    expect(error?.code).toBe("23514");
  });

  it("accepts every section, location and unit from the domain", async () => {
    const user = await createTestUser("all-values");
    const proposals: IngredientProposal[] = [
      ...SECTIONS.map((section) => ({ name: `Avdelning ${section}`, section, location: "Skafferi" as const, defaultUnit: null })),
      ...LOCATIONS.map((location) => ({ name: `Plats ${location}`, section: "Övrigt" as const, location, defaultUnit: null })),
      ...UNITS.map((defaultUnit) => ({ name: `Enhet ${defaultUnit}`, section: "Övrigt" as const, location: "Skafferi" as const, defaultUnit })),
    ];
    const ids = await commitIngredients(user.db, proposals.map((proposal) => newChoice(proposal.name, proposal)));
    expect(ids.every((id) => typeof id === "string")).toBe(true);
    expect(await countRows("ingredient", user.id)).toBe(proposals.length);
  });

  it("never deletes catalog ingredients (AD-20)", async () => {
    const user = await createTestUser("no-delete");
    const id = await addIngredient(user.db, "gul lök");
    const { error } = await user.db.from("ingredient").delete().eq("id", id);
    expect(error?.code).toBe("42501");
    expect(await countRows("ingredient", user.id)).toBe(1);
  });
});

describe("matchIngredients", () => {
  let user: TestUser;
  let gulLok: string;
  let vitlok: string;

  beforeAll(async () => {
    user = await createTestUser("match");
    gulLok = await addIngredient(user.db, "gul lök");
    vitlok = await addIngredient(user.db, "vitlök");
    await addSynonym(user.db, "lök", gulLok);
  });

  it("matches exactly, by synonym, by the hint's name, or proposes a new ingredient", async () => {
    const matches = await matchIngredientsIn(user.db, [
      { text: "Gul lök" },
      { text: "Lök, hackad" },
      { text: "2 vitlöksklyftor", hint: { name: "Vitlök", section: "Frukt och grönt", location: "Skafferi", defaultUnit: "klyfta" } },
      { text: "saffran", hint: { name: "Saffran", section: "kryddor", location: "skafferi", defaultUnit: "g" } },
      { text: "" },
    ]);
    expect(matches).toEqual([
      { kind: "match", ingredientId: gulLok, confidence: "exact" },
      { kind: "match", ingredientId: gulLok, confidence: "synonym" },
      { kind: "match", ingredientId: vitlok, confidence: "hint" },
      { kind: "new", proposal: saffran },
      { kind: "unmatched" },
    ]);
  });

  it("never writes", async () => {
    const before = [await countRows("ingredient", user.id), await countRows("ingredient_synonym", user.id)];
    await matchIngredientsIn(user.db, [
      { text: "saffran", hint: { name: "Saffran", section: "kryddor", location: "skafferi", defaultUnit: "g" } },
      { text: "Lök" },
    ]);
    const after = [await countRows("ingredient", user.id), await countRows("ingredient_synonym", user.id)];
    expect(after).toEqual(before);
  });

  it("looks up more texts than fit in one request", async () => {
    const items = Array.from({ length: 250 }, (_, index) => ({ text: `ingrediens ${index}` }));
    items.push({ text: "Gul lök" });
    const matches = await matchIngredientsIn(user.db, items);
    expect(matches).toHaveLength(251);
    expect(matches[250]).toEqual({ kind: "match", ingredientId: gulLok, confidence: "exact" });
  });

  it("is not affected by another user's catalog", async () => {
    const other = await createTestUser("match-other");
    const othersRodlok = await addIngredient(other.db, "rödlök");
    await addSynonym(other.db, "lök", othersRodlok);
    await addIngredient(other.db, "saffran", "Skafferi");

    const matches = await matchIngredientsIn(user.db, [{ text: "Lök" }, { text: "saffran" }]);
    expect(matches[0]).toEqual({ kind: "match", ingredientId: gulLok, confidence: "synonym" });
    expect(matches[1].kind).toBe("new");
  });

  it("finds nothing without a session", async () => {
    // anon has no grants: the read fails rather than returning another user's rows.
    await expect(matchIngredientsIn(anonClient(), [{ text: "Gul lök" }])).rejects.toThrow("catalog_query_failed: 42501");
  });
});

describe("commitIngredients", () => {
  it("returns an id per choice, in order, and null for unmatched", async () => {
    const user = await createTestUser("commit");
    const gulLok = await addIngredient(user.db, "gul lök");
    const ids = await commitIngredients(user.db, [
      newChoice("1 g saffran", saffran),
      { text: "Gul lök", ingredient: { kind: "match", ingredientId: gulLok, confidence: "exact" } },
      { text: "", ingredient: { kind: "unmatched" } },
    ]);
    expect(ids).toHaveLength(3);
    const { data } = await user.db.from("ingredient").select("*").eq("id", ids[0]!).single();
    expect(data).toMatchObject({ name: "Saffran", normalized_name: "saffran", section: "Skafferi", location: "Skafferi", default_unit: "g" });
    expect(ids.slice(1)).toEqual([gulLok, null]);
    expect(await countRows("ingredient_synonym", user.id)).toBe(0);
  });

  it("keeps lines with the same text apart", async () => {
    const user = await createTestUser("same-text");
    const salt = await addIngredient(user.db, "salt", "Skafferi");
    const ids = await commitIngredients(user.db, [
      { text: "Salt och peppar", ingredient: { kind: "match", ingredientId: salt, confidence: "hint" } },
      newChoice("Salt och peppar", { name: "Svartpeppar", section: "Skafferi", location: "Skafferi", defaultUnit: "krm" }),
    ]);
    expect(ids[0]).toBe(salt);
    expect(ids[1]).not.toBe(salt);
    const { data } = await user.db.from("ingredient").select("name").eq("id", ids[1]!).single();
    expect(data?.name).toBe("Svartpeppar");
  });

  it("gives one row and the same id to concurrent commits of the same new ingredient", async () => {
    const user = await createTestUser("concurrent");
    const choices = [newChoice("saffran", saffran)];
    const [first, second] = await Promise.all([commitIngredients(user.db, choices), commitIngredients(user.db, choices)]);
    expect(first[0]).toEqual(expect.any(String));
    expect(second[0]).toBe(first[0]);
    expect(await countRows("ingredient", user.id)).toBe(1);
  });

  it("removes duplicates within one call and keeps an existing ingredient unchanged", async () => {
    const user = await createTestUser("duplicates");
    const existing = await addIngredient(user.db, "saffran", "Övrigt");
    const ids = await commitIngredients(user.db, [
      newChoice("1 g saffran", saffran),
      newChoice("Saffran", { ...saffran, name: "saffran" }),
    ]);
    expect(ids).toEqual([existing, existing]);
    expect(await countRows("ingredient", user.id)).toBe(1);
    const { data } = await user.db.from("ingredient").select("name, section").eq("id", existing).single();
    expect(data).toEqual({ name: "saffran", section: "Övrigt" });
  });

  it("saves a new ingredient's text as a synonym, so the next import matches it", async () => {
    const user = await createTestUser("new-synonym");
    const [id] = await commitIngredients(user.db, [
      newChoice("Lök, hackad", { name: "Gul lök", section: "Frukt och grönt", location: "Skafferi", defaultUnit: "st" }),
    ]);
    expect(await synonymsOf(user)).toEqual([{ normalized: "lök", ingredient_id: id }]);
    expect((await matchIngredientsIn(user.db, [{ text: "2 lökar, hackade" }, { text: "Lök" }]))[1]).toEqual({
      kind: "match",
      ingredientId: id,
      confidence: "synonym",
    });
  });

  it("saves no synonym for a text two new ingredients share", async () => {
    const user = await createTestUser("shared-text");
    await commitIngredients(user.db, [
      newChoice("Salt och peppar", { name: "Salt", section: "Skafferi", location: "Skafferi", defaultUnit: "krm" }),
      newChoice("Salt och peppar", { name: "Svartpeppar", section: "Skafferi", location: "Skafferi", defaultUnit: "krm" }),
    ]);
    expect(await synonymsOf(user)).toEqual([]);
    expect(await countRows("ingredient", user.id)).toBe(2);
  });

  it("saves a correction as a synonym and points an existing synonym at the new choice", async () => {
    const user = await createTestUser("correction");
    const gulLok = await addIngredient(user.db, "gul lök");
    const rodlok = await addIngredient(user.db, "rödlök");
    await addSynonym(user.db, "lök", gulLok);

    const [suggested] = await matchIngredientsIn(user.db, [{ text: "Lök, hackad" }]);
    expect(suggested).toEqual({ kind: "match", ingredientId: gulLok, confidence: "synonym" });

    expect(await commitIngredients(user.db, [chosen("Lök, hackad", rodlok)])).toEqual([rodlok]);
    expect(await synonymsOf(user, "lök")).toEqual([{ normalized: "lök", ingredient_id: rodlok }]);

    const [next] = await matchIngredientsIn(user.db, [{ text: "2 lök, hackade" }]);
    expect(next).toEqual({ kind: "match", ingredientId: rodlok, confidence: "synonym" });
  });

  it("creates the synonym when there was none", async () => {
    const user = await createTestUser("chosen-synonym");
    const schalottenlok = await addIngredient(user.db, "schalottenlök");
    await commitIngredients(user.db, [chosen("1 Charlottenlök", schalottenlok)]);
    expect(await synonymsOf(user)).toEqual([{ normalized: "charlottenlök", ingredient_id: schalottenlok }]);
  });

  it("saves no synonym for an exact match with empty text, as confirmed lagerförslag send it", async () => {
    const user = await createTestUser("exact-empty-text");
    const gurka = await addIngredient(user.db, "gurka");
    await addSynonym(user.db, "slanggurka", gurka);
    const ids = await commitIngredients(user.db, [
      { text: "", ingredient: { kind: "match", ingredientId: gurka, confidence: "exact" } },
      newChoice("ägg", { name: "ägg", section: "Mejeri", location: "Kyl", defaultUnit: "st" }),
    ]);
    expect(ids[0]).toBe(gurka);
    expect(ids[1]).toEqual(expect.any(String));
    // Only the synonym that was there; none for the empty text or the new name.
    expect(await synonymsOf(user)).toEqual([{ normalized: "slanggurka", ingredient_id: gurka }]);
  });

  it("saves no synonym that is redundant or could never win", async () => {
    const user = await createTestUser("useless-synonyms");
    const gulLok = await addIngredient(user.db, "gul lök");
    const rodlok = await addIngredient(user.db, "rödlök");
    await addSynonym(user.db, "lök", gulLok);
    await commitIngredients(user.db, [
      // Chosen the same as the suggestion.
      chosen("Lök", gulLok),
      chosen("Gul lök", gulLok),
      // The text is another ingredient's name: the name match always wins.
      chosen("Rödlök", gulLok),
    ]);
    expect(await synonymsOf(user)).toEqual([{ normalized: "lök", ingredient_id: gulLok }]);
    expect((await matchIngredientsIn(user.db, [{ text: "Rödlök" }]))[0]).toMatchObject({ ingredientId: rodlok });
  });

  it("rejects different choices for the same text in one call", async () => {
    const user = await createTestUser("conflict");
    const gulLok = await addIngredient(user.db, "gul lök");
    const rodlok = await addIngredient(user.db, "rödlök");
    await expect(commitIngredients(user.db, [chosen("Lök", gulLok), chosen("lök, hackad", rodlok)])).rejects.toThrow(
      "catalog_conflicting_synonyms",
    );
    expect(await synonymsOf(user)).toEqual([]);
  });

  it("keeps one user's synonym out of another user's matching", async () => {
    const a = await createTestUser("synonym-a");
    const b = await createTestUser("synonym-b");
    const aGulLok = await addIngredient(a.db, "gul lök");
    const bRodlok = await addIngredient(b.db, "rödlök");

    await commitIngredients(b.db, [chosen("Lök", bRodlok)]);
    await commitIngredients(a.db, [chosen("Lök", aGulLok)]);

    expect(await synonymsOf(a, "lök")).toEqual([{ normalized: "lök", ingredient_id: aGulLok }]);
    expect(await synonymsOf(b, "lök")).toEqual([{ normalized: "lök", ingredient_id: bRodlok }]);
    expect((await matchIngredientsIn(a.db, [{ text: "Lök" }]))[0]).toMatchObject({ ingredientId: aGulLok });
    expect((await matchIngredientsIn(b.db, [{ text: "Lök" }]))[0]).toMatchObject({ ingredientId: bRodlok });
  });

  it("rejects ids that are not in the user's catalog", async () => {
    const a = await createTestUser("foreign-a");
    const b = await createTestUser("foreign-b");
    const bRodlok = await addIngredient(b.db, "rödlök");
    for (const choice of [
      chosen("Lök", bRodlok),
      chosen("Lök", madeUpId),
      { text: "Lök", ingredient: { kind: "match", ingredientId: bRodlok, confidence: "exact" } } as const,
    ]) {
      await expect(commitIngredients(a.db, [newChoice("saffran", saffran), choice])).rejects.toThrow(
        "catalog_unknown_ingredient",
      );
    }
    expect(await countRows("ingredient", a.id)).toBe(0);
    expect(await countRows("ingredient_synonym", a.id)).toBe(0);
  });

  it("rejects invalid choices with a validation error", async () => {
    const user = await createTestUser("invalid");
    await expect(
      commitIngredients(user.db, [newChoice("x", { ...saffran, section: "Kryddor" as never })]),
    ).rejects.toThrow("catalog_validation");
    await expect(commitIngredients(user.db, [newChoice("x", { ...saffran, name: "2 dl" })])).rejects.toThrow(
      "catalog_validation",
    );
    expect(await countRows("ingredient", user.id)).toBe(0);
  });
});

describe("searchIngredients", () => {
  let user: TestUser;
  let gulLok: string;
  let rodlok: string;
  let vitlok: string;

  async function addNamed(db: Db, name: string): Promise<string> {
    const { data, error } = await db
      .from("ingredient")
      .insert({ name, normalized_name: name.toLocaleLowerCase("sv-SE"), section: "Frukt och grönt", location: "Skafferi" })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  beforeAll(async () => {
    user = await createTestUser("search");
    gulLok = await addNamed(user.db, "Gul lök");
    rodlok = await addNamed(user.db, "Rödlök");
    vitlok = await addNamed(user.db, "Vitlök");
    await addNamed(user.db, "Grädde 50%");
    await addSynonym(user.db, "schalottenlök", rodlok);
  });

  it("finds names and synonyms that contain the text, best first, with the display name", async () => {
    expect(await searchCatalog(user.db, "gul lök")).toEqual([{ id: gulLok, name: "Gul lök" }]);
    expect(await searchCatalog(user.db, "lök")).toEqual([
      { id: gulLok, name: "Gul lök" },
      { id: rodlok, name: "Rödlök" },
      { id: vitlok, name: "Vitlök" },
    ]);
    expect(await searchCatalog(user.db, "schalott")).toEqual([{ id: rodlok, name: "Rödlök" }]);
  });

  it("treats LIKE wildcards in the text as plain characters", async () => {
    expect(await searchCatalog(user.db, "%")).toEqual([{ id: expect.any(String), name: "Grädde 50%" }]);
    expect(await searchCatalog(user.db, "_")).toEqual([]);
    expect(await searchCatalog(user.db, "")).toEqual([]);
  });

  it("gives at most 20 hits", async () => {
    const many = await createTestUser("search-many");
    for (let index = 0; index < 25; index++) await addNamed(many.db, `Ost ${index}`);
    expect(await searchCatalog(many.db, "ost")).toHaveLength(20);
  });

  it("never shows another user's catalog", async () => {
    const other = await createTestUser("search-other");
    await addNamed(other.db, "Gul lök extra");
    await addSynonym(other.db, "gul", await addNamed(other.db, "Saffran"));
    expect(await searchCatalog(user.db, "gul")).toEqual([{ id: gulLok, name: "Gul lök" }]);
  });

  it("finds ingredient ids by name and synonym for searching recipes, only the user's own", async () => {
    const other = await createTestUser("find-ids-other");
    await addNamed(other.db, "Purjolök");
    expect((await findIngredientIdsIn(user.db, "lök")).toSorted()).toEqual([gulLok, rodlok, vitlok].toSorted());
    expect(await findIngredientIdsIn(user.db, "schalott")).toEqual([rodlok]);
    expect(await findIngredientIdsIn(user.db, "%")).toHaveLength(1);
    expect(await findIngredientIdsIn(user.db, "_")).toEqual([]);
    expect(await findIngredientIdsIn(user.db, "")).toEqual([]);
    expect(await findIngredientIdsIn(other.db, "gul")).toEqual([]);
  });

  it("finds at most 1000 ingredient ids, each once, without dropping synonym hits", async () => {
    const many = await createTestUser("find-ids-many");
    const rows = Array.from({ length: 1005 }, (_, index) => ({
      name: `Ost ${index}`,
      normalized_name: `ost ${index}`,
      section: "Mejeri",
      location: "Kyl",
    }));
    const { data, error } = await many.db.from("ingredient").insert(rows).select("id");
    if (error) throw error;
    // An ingredient found only through its synonym, and a synonym of a name hit.
    const { data: brie, error: brieError } = await many.db
      .from("ingredient")
      .insert({ name: "Brie", normalized_name: "brie", section: "Mejeri", location: "Kyl" })
      .select("id")
      .single();
    if (brieError) throw brieError;
    await addSynonym(many.db, "mjukost", brie.id);
    await addSynonym(many.db, "ostbit", data[0].id);
    const ids = await findIngredientIdsIn(many.db, "ost");
    expect(ids).toHaveLength(1000);
    expect(new Set(ids).size).toBe(1000);
    expect(ids).toContain(brie.id);
  });

  it("names ingredients by id, only the user's own", async () => {
    const other = await createTestUser("names-other");
    const othersId = await addNamed(other.db, "Saffran");
    expect(await loadIngredientNames(user.db, [gulLok, vitlok, gulLok, othersId])).toEqual({
      [gulLok]: "Gul lök",
      [vitlok]: "Vitlök",
    });
    expect(await loadIngredientNames(user.db, [])).toEqual({});
  });
});
