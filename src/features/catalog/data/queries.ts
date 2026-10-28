import "server-only";
import { containsPattern } from "@/lib/like-pattern";
import { locationSchema } from "../domain/locations";
import type { CatalogSnapshot, IngredientDefaults, IngredientSummary } from "../domain/match";
import { sectionSchema } from "../domain/sections";
import { unitSchema } from "../domain/units";
import {
  maxSearchHits,
  rankSearchHits,
  type IngredientSearchHit,
  type SearchCandidate,
} from "../domain/search";
import { CatalogDataError, chunks, type CatalogDb } from "./client";

/**
 * The catalog rows needed to match `normalizedTexts`: ingredients whose
 * normalised name, and synonyms whose text, is one of them. RLS limits both to
 * the signed-in user's rows. Empty texts never match and are not looked up.
 * Lookups are made in chunks of 100 values.
 */
export async function loadCatalogSnapshot(db: CatalogDb, normalizedTexts: readonly string[]): Promise<CatalogSnapshot> {
  const texts = [...new Set(normalizedTexts.filter(Boolean))];
  const ingredients = new Map<string, string>();
  const synonyms = new Map<string, string>();

  await Promise.all(
    chunks(texts).map(async (chunk) => {
      const [names, aliases] = await Promise.all([
        db.from("ingredient").select("id, normalized_name").in("normalized_name", chunk),
        db.from("ingredient_synonym").select("ingredient_id, normalized").in("normalized", chunk),
      ]);
      if (names.error) throw new CatalogDataError("query_failed", names.error.code);
      if (aliases.error) throw new CatalogDataError("query_failed", aliases.error.code);
      for (const row of names.data) ingredients.set(row.normalized_name, row.id);
      for (const row of aliases.data) synonyms.set(row.normalized, row.ingredient_id);
    }),
  );

  return { ingredients, synonyms };
}

/** The ids among `ids` that are ingredients in the signed-in user's catalog. */
export async function existingIngredientIds(db: CatalogDb, ids: readonly string[]): Promise<Set<string>> {
  const found = new Set<string>();
  await Promise.all(
    chunks([...new Set(ids)]).map(async (chunk) => {
      const { data, error } = await db.from("ingredient").select("id").in("id", chunk);
      if (error) throw new CatalogDataError("query_failed", error.code);
      for (const row of data) found.add(row.id);
    }),
  );
  return found;
}

/** The names of the ingredients among `ids` in the signed-in user's catalog, by id. */
export async function loadIngredientNames(db: CatalogDb, ids: readonly string[]): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  await Promise.all(
    chunks([...new Set(ids)]).map(async (chunk) => {
      const { data, error } = await db.from("ingredient").select("id, name").in("id", chunk);
      if (error) throw new CatalogDataError("query_failed", error.code);
      for (const row of data) names[row.id] = row.name;
    }),
  );
  return names;
}

/**
 * The names and sections of the ingredients among `ids` in the signed-in
 * user's catalog, by id. Ids not found are left out. The table's check
 * equals SECTIONS; a row outside it is `query_failed` with the detail
 * `invalid_row`.
 */
export async function loadIngredientSummaries(
  db: CatalogDb,
  ids: readonly string[],
): Promise<Record<string, IngredientSummary>> {
  const summaries: Record<string, IngredientSummary> = {};
  await Promise.all(
    chunks([...new Set(ids)]).map(async (chunk) => {
      const { data, error } = await db.from("ingredient").select("id, name, section").in("id", chunk);
      if (error) throw new CatalogDataError("query_failed", error.code);
      for (const row of data) {
        const section = sectionSchema.safeParse(row.section);
        if (!section.success) throw new CatalogDataError("query_failed", "invalid_row");
        summaries[row.id] = { name: row.name, section: section.data };
      }
    }),
  );
  return summaries;
}

/**
 * The section, location and default unit of the ingredients among `ids` in
 * the signed-in user's catalog, by id. Ids not found are left out. The
 * table's checks equal the domain's lists; a row outside them is
 * `query_failed` with the detail `invalid_row`.
 */
export async function loadIngredientDefaults(
  db: CatalogDb,
  ids: readonly string[],
): Promise<Record<string, IngredientDefaults>> {
  const defaults: Record<string, IngredientDefaults> = {};
  await Promise.all(
    chunks([...new Set(ids)]).map(async (chunk) => {
      const { data, error } = await db.from("ingredient").select("id, section, location, default_unit").in("id", chunk);
      if (error) throw new CatalogDataError("query_failed", error.code);
      for (const row of data) {
        const section = sectionSchema.safeParse(row.section);
        const location = locationSchema.safeParse(row.location);
        const defaultUnit = unitSchema.nullable().safeParse(row.default_unit);
        if (!section.success || !location.success || !defaultUnit.success) {
          throw new CatalogDataError("query_failed", "invalid_row");
        }
        defaults[row.id] = { section: section.data, location: location.data, defaultUnit: defaultUnit.data };
      }
    }),
  );
  return defaults;
}

/**
 * Rows read per table before ranking, in alphabetical order. In a catalog with
 * more matching rows than this, a better hit later in the alphabet can be
 * missed; typing more of the name narrows the search.
 */
const searchCandidateLimit = 5 * maxSearchHits;

/**
 * Ingredients whose normalised name, or one of whose synonyms, contains
 * `text` (already lower case, see searchText), ranked by rankSearchHits.
 */
export async function searchCatalog(db: CatalogDb, text: string): Promise<IngredientSearchHit[]> {
  const pattern = containsPattern(text);
  if (!pattern) return [];
  const [names, aliases] = await Promise.all([
    db
      .from("ingredient")
      .select("id, name, normalized_name")
      .ilike("normalized_name", pattern)
      .order("normalized_name")
      .limit(searchCandidateLimit),
    db
      .from("ingredient_synonym")
      .select("ingredient_id, normalized")
      .ilike("normalized", pattern)
      .order("normalized")
      .limit(searchCandidateLimit),
  ]);
  if (names.error) throw new CatalogDataError("query_failed", names.error.code);
  if (aliases.error) throw new CatalogDataError("query_failed", aliases.error.code);

  const candidates: SearchCandidate[] = names.data.map((row) => ({
    id: row.id,
    name: row.name,
    matchedTexts: [row.normalized_name],
  }));
  const synonymNames = await loadIngredientNames(
    db,
    aliases.data.map((row) => row.ingredient_id),
  );
  for (const row of aliases.data) {
    const name = synonymNames[row.ingredient_id];
    if (name) candidates.push({ id: row.ingredient_id, name, matchedTexts: [row.normalized] });
  }
  return rankSearchHits(text, candidates);
}

/** At most this many ids from findIngredientIdsIn (also the API's row limit per query). */
export const maxFoundIngredientIds = 1000;

/**
 * The ids of the ingredients whose normalised name, or one of whose synonyms,
 * contains `text` (already normalised, see searchText), for searching recipes
 * by ingredient. Name and synonym hits are merged in turns before the cap, so
 * neither kind crowds out the other; each id comes once, at most
 * `maxFoundIngredientIds`. Empty text gives none.
 */
export async function findIngredientIdsIn(db: CatalogDb, text: string): Promise<string[]> {
  const pattern = containsPattern(text);
  if (!pattern) return [];
  const [names, aliases] = await Promise.all([
    db
      .from("ingredient")
      .select("id")
      .ilike("normalized_name", pattern)
      .order("normalized_name")
      .limit(maxFoundIngredientIds),
    db
      .from("ingredient_synonym")
      .select("ingredient_id")
      .ilike("normalized", pattern)
      .order("normalized")
      .limit(maxFoundIngredientIds),
  ]);
  if (names.error) throw new CatalogDataError("query_failed", names.error.code);
  if (aliases.error) throw new CatalogDataError("query_failed", aliases.error.code);
  const byName = names.data.map((row) => row.id);
  const bySynonym = aliases.data.map((row) => row.ingredient_id);
  const ids = new Set<string>();
  for (let index = 0; index < Math.max(byName.length, bySynonym.length); index++) {
    if (index < byName.length) ids.add(byName[index]);
    if (index < bySynonym.length) ids.add(bySynonym[index]);
  }
  return [...ids].slice(0, maxFoundIngredientIds);
}
