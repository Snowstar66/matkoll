import "server-only";
import { createClient } from "@/lib/supabase/server";
import { matchIngredientsIn } from "./actions/match-ingredients";
import { commitIngredients as commitIngredientsIn } from "./data/commit";
import {
  findIngredientIdsIn,
  loadCatalogSnapshot,
  loadIngredientDefaults,
  loadIngredientList,
  loadIngredientNames,
  loadIngredientSummaries,
} from "./data/queries";
import { searchText } from "./domain/search";

/** What the catalog functions throw when Supabase fails; `code` says why, never user data. */
export { CatalogDataError } from "./data/client";
import type {
  IngredientChoice,
  IngredientDefaults,
  IngredientMatch,
  IngredientSummary,
  MatchItem,
} from "./domain/match";

// Server-only entry (AD-1). Everything here uses the signed-in user's session
// client, so RLS limits it to the user's catalog. The functions below are not
// Server Actions: the actions that call them check the user first (AD-2).
// searchIngredients, at the end, is the one Server Action.

/** Matches recipe or pantry lines against the catalog. Never writes (AD-6). */
export async function matchIngredients(items: readonly MatchItem[]): Promise<IngredientMatch[]> {
  return matchIngredientsIn(await createClient(), items);
}

/**
 * Creates new ingredients and saves corrected matches as synonyms. Only for
 * saving actions (saveRecipe, updateRecipe, the pantry's confirmations).
 * Returns the ingredient id for each choice, in order (`null` for "unmatched").
 */
export async function commitIngredients(choices: readonly IngredientChoice[]): Promise<(string | null)[]> {
  return commitIngredientsIn(await createClient(), choices);
}

/**
 * The ingredients of the user's catalog named by each of `normalizedNames`
 * (already normalised, catalog.normalizeIngredientText): the one whose name it
 * is and the one it is a synonym of, by name. A name without either is left
 * out. For Basvaror (pantry.stapleRules). Throws CatalogDataError.
 */
export async function getIngredientIdsByNames(normalizedNames: readonly string[]): Promise<Record<string, string[]>> {
  const { ingredients, synonyms } = await loadCatalogSnapshot(await createClient(), normalizedNames);
  const ids: Record<string, string[]> = {};
  for (const [name, id] of [...ingredients, ...synonyms]) {
    const list = Object.hasOwn(ids, name) ? ids[name] : (ids[name] = []);
    if (!list.includes(id)) list.push(id);
  }
  return ids;
}

/** The names of the ingredients among `ids` in the user's catalog, by id. Ids not found are left out. */
export async function getIngredientNames(ids: readonly string[]): Promise<Record<string, string>> {
  return loadIngredientNames(await createClient(), ids);
}

/** The id and name of the user's ingredients, by name, at most `limit` (Story 9.10). Throws CatalogDataError. */
export async function listIngredients(limit: number): Promise<{ id: string; name: string }[]> {
  return loadIngredientList(await createClient(), limit);
}

/**
 * The names and sections of the ingredients among `ids` in the user's
 * catalog, by id; ids not found are left out. The pantry's list shows the
 * name and works out the category from the section (Story 11.2, AD-12).
 * Throws CatalogDataError.
 */
export async function getIngredientSummaries(ids: readonly string[]): Promise<Record<string, IngredientSummary>> {
  return loadIngredientSummaries(await createClient(), ids);
}

/**
 * The section, location and default unit of the ingredients among `ids` in
 * the user's catalog, by id; ids not found are left out. The pantry suggests
 * an item's location and unit from them (FR-11). Throws CatalogDataError.
 */
export async function getIngredientDefaults(ids: readonly string[]): Promise<Record<string, IngredientDefaults>> {
  return loadIngredientDefaults(await createClient(), ids);
}

/**
 * The ids of the user's ingredients whose name or synonym contains `query`
 * (normalised like searchIngredients: lower case, single spaces), at most
 * 1000, name and synonym hits taken in turns. Lets the recipe library search by ingredient without reading the
 * catalog's tables (AD-1). Empty text gives none. Throws CatalogDataError.
 */
export async function findIngredientIds(query: string): Promise<string[]> {
  const text = searchText(query);
  if (!text) return [];
  return findIngredientIdsIn(await createClient(), text);
}

/**
 * Server Action for searching the catalog while typing. A page passes it to a
 * client component of another module, which cannot import this file (AD-1).
 */
export { searchIngredients } from "./actions/search-ingredients";
