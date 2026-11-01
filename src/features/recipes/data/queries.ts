import "server-only";
import { unitSchema } from "@/features/catalog";
import { containsPattern } from "@/lib/like-pattern";
import { sourceKindSchema } from "../domain/recipe-draft";
import type { RecipeListRow, RecipeRowLine } from "../domain/recipe-list";
import type { SavedRecipe } from "../domain/saved-recipe";
import { RecipeDataError, type RecipesDb } from "./client";

/**
 * The catalog's names for ingredient ids. Passed in, because only the catalog
 * reads its tables (AD-1): in requests, catalog.getIngredientNames.
 */
export type IngredientNames = (ids: readonly string[]) => Promise<Record<string, string>>;

/**
 * The recipe with its steps and lines in order, and the names of the lines'
 * catalog ingredients; `null` when the signed-in user has no recipe with that
 * id (RLS hides other users' recipes). `id` must be a uuid. Throws
 * RecipeDataError when a query fails.
 */
export async function getRecipe(
  db: RecipesDb,
  id: string,
  ingredientNames: IngredientNames,
): Promise<SavedRecipe | null> {
  const [recipe, steps, lines] = await Promise.all([
    db
      .from("recipe")
      .select("id, title, original_servings, total_minutes, image_url, source_kind, source_url, offer_names, is_favorite, updated_at")
      .eq("id", id)
      .maybeSingle(),
    db.from("recipe_step").select("id, position, text").eq("recipe_id", id).order("position"),
    db
      .from("recipe_ingredient")
      .select("id, position, original_text, amount, unit, is_vague, ingredient_id, step_id")
      .eq("recipe_id", id)
      .order("position"),
  ]);
  if (recipe.error) throw new RecipeDataError(`query_failed ${recipe.error.code}`);
  if (steps.error) throw new RecipeDataError(`query_failed ${steps.error.code}`);
  if (lines.error) throw new RecipeDataError(`query_failed ${lines.error.code}`);
  if (!recipe.data) return null;

  const ingredientIds = lines.data.flatMap((line) => (line.ingredient_id ? [line.ingredient_id] : []));
  const names = ingredientIds.length > 0 ? await ingredientNames(ingredientIds) : {};

  const row = recipe.data;
  // The database's check lists equal the domain's (tests/design/recipe-checks.test.ts).
  const sourceKind = sourceKindSchema.safeParse(row.source_kind);
  if (!sourceKind.success) throw new RecipeDataError("invalid_row");
  const units = lines.data.map((line) => unitSchema.nullable().safeParse(line.unit));
  if (units.some((unit) => !unit.success)) throw new RecipeDataError("invalid_row");

  return {
    id: row.id,
    title: row.title,
    servings: row.original_servings,
    totalMinutes: row.total_minutes,
    imageUrl: row.image_url,
    sourceKind: sourceKind.data,
    sourceUrl: row.source_url,
    offerNames: row.offer_names,
    isFavorite: row.is_favorite,
    updatedAt: row.updated_at,
    steps: steps.data,
    lines: lines.data.map((line, index) => ({
      id: line.id,
      position: line.position,
      originalText: line.original_text,
      amount: line.amount,
      unit: units[index].data ?? null,
      isVague: line.is_vague,
      ingredientId: line.ingredient_id,
      ingredientName: line.ingredient_id ? (names[line.ingredient_id] ?? null) : null,
      stepId: line.step_id,
    })),
  };
}

/** The library row's own columns. */
const listColumns = "id, title, image_url, total_minutes, original_servings, is_favorite, created_at";
/** A recipe line's columns for the status (pantry.recipeStatus) and the shopping list. */
const lineColumns = "id, position, ingredient_id, amount, unit, is_vague, original_text";

type LineRow = {
  id: string;
  position: number;
  ingredient_id: string | null;
  amount: number | null;
  unit: string | null;
  is_vague: boolean;
  original_text: string;
};

type ListRow = {
  id: string;
  title: string;
  image_url: string | null;
  total_minutes: number | null;
  original_servings: number;
  is_favorite: boolean;
  created_at: string;
};

/** Newest first; the id settles recipes saved at the same moment. */
function newestFirst(a: ListRow, b: ListRow): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * A line for the status. The database's unit check equals UNITS
 * (tests/design/recipe-checks.test.ts); should a unit still not parse, the
 * line is logged and left out of the status (no catalog ingredient) rather
 * than failing the whole library.
 */
function toStatusLine(line: LineRow): RecipeRowLine {
  const unit = unitSchema.nullable().safeParse(line.unit);
  const originalText = line.original_text;
  if (!unit.success) {
    console.error("recipe_line_invalid", { reason: "unit", lineId: line.id });
    return { id: line.id, ingredientId: null, amount: line.amount, unit: null, isVague: line.is_vague, originalText };
  }
  return {
    id: line.id,
    ingredientId: line.ingredient_id,
    amount: line.amount,
    unit: unit.data,
    isVague: line.is_vague,
    originalText,
  };
}

function toListRow(row: ListRow, lines: readonly LineRow[]): RecipeListRow {
  return {
    id: row.id,
    title: row.title,
    imageUrl: row.image_url,
    totalMinutes: row.total_minutes,
    originalServings: row.original_servings,
    isFavorite: row.is_favorite,
    createdAt: row.created_at,
    // In the recipe's order, so whatever reads "the first line" reads the same one every time.
    lines: [...lines].sort((a, b) => a.position - b.position).map(toStatusLine),
  };
}

/** Rows per request: the API's row limit (max_rows), so a full page means there may be more. */
const pageSize = 1000;

type Page<Row> = PromiseLike<{ data: Row[] | null; error: { code: string } | null }>;

/** Every row of an ordered query, fetched page by page with `.range()` until a short page. */
async function allPages<Row>(page: (from: number, to: number) => Page<Row>): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new RecipeDataError(`query_failed ${error.code}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

export type ListOptions = { favoritesOnly?: boolean };

/**
 * The signed-in user's household's recipes as library rows with their lines, newest first
 * (the index recipe (household_id, created_at desc)); only favourites with
 * `favoritesOnly`.
 * No paging for the caller in v1 (one user); the rows are fetched in pages of
 * the API's row limit. Throws RecipeDataError.
 */
export async function listRecipes(db: RecipesDb, { favoritesOnly = false }: ListOptions = {}): Promise<RecipeListRow[]> {
  // The lines come embedded, so the whole library is one request per page.
  const rows = await allPages((from, to) => {
    const query = db.from("recipe").select(`${listColumns}, lines:recipe_ingredient(${lineColumns})`);
    return (favoritesOnly ? query.eq("is_favorite", true) : query)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to);
  });
  return rows.map(({ lines, ...row }) => toListRow(row, lines));
}

/** Values per `.in(...)` filter, so a long id list never makes an over-long request URL. */
const idChunkSize = 100;

/** `values` in chunks of idChunkSize. */
function chunked(values: readonly string[]): string[][] {
  const chunks: string[][] = [];
  for (let start = 0; start < values.length; start += idChunkSize) chunks.push(values.slice(start, start + idChunkSize));
  return chunks;
}

/** The lines of the recipes `recipeIds` by recipe id, read once per chunk of ids and in pages. */
async function linesOf(db: RecipesDb, recipeIds: readonly string[]): Promise<Map<string, LineRow[]>> {
  const byRecipe = new Map<string, LineRow[]>(recipeIds.map((id) => [id, []]));
  const pages = await Promise.all(
    chunked(recipeIds).map((chunk) =>
      allPages((from, to) =>
        db.from("recipe_ingredient").select(`recipe_id, ${lineColumns}`).in("recipe_id", chunk).order("id").range(from, to),
      ),
    ),
  );
  for (const { recipe_id, ...line } of pages.flat()) byRecipe.get(recipe_id)?.push(line);
  return byRecipe;
}

export type SearchOptions = ListOptions & {
  /** The search text, already normalised (lower case, single spaces). */
  text: string;
  /** The catalog ingredients whose name or synonym contains the text (catalog.findIngredientIds). */
  ingredientIds: readonly string[];
};

/**
 * The signed-in user's recipes whose title contains `text`, or that have a
 * line whose original text contains it or whose ingredient is one of
 * `ingredientIds`; newest first, only favourites with `favoritesOnly`. `%`,
 * `_` and `\` in the text match themselves. Each recipe comes with all its
 * lines, read once for the found recipes. Text without anything to search
 * for gives no recipes. Throws RecipeDataError.
 */
export async function searchRecipesIn(
  db: RecipesDb,
  { text, ingredientIds, favoritesOnly = false }: SearchOptions,
): Promise<RecipeListRow[]> {
  const pattern = containsPattern(text);
  if (!pattern) return [];

  // One query per way to match, each returning recipes (not lines) in order
  // and in pages, so the API's row limit never cuts a result. A line filter
  // goes through an inner join on the recipe's lines.
  const ordered = <Q extends { order: (column: string, options?: { ascending?: boolean }) => Q }>(query: Q) =>
    query.order("created_at", { ascending: false }).order("id");
  const byTitle = () => {
    const query = db.from("recipe").select(listColumns).ilike("title", pattern);
    return ordered(favoritesOnly ? query.eq("is_favorite", true) : query);
  };
  const byLines = () => {
    const query = db.from("recipe").select(`${listColumns}, recipe_ingredient!inner()`);
    return favoritesOnly ? query.eq("is_favorite", true) : query;
  };

  const results = await Promise.all([
    allPages<ListRow>((from, to) => byTitle().range(from, to)),
    allPages<ListRow>((from, to) => ordered(byLines().ilike("recipe_ingredient.original_text", pattern)).range(from, to)),
    ...chunked([...new Set(ingredientIds)]).map((chunk) =>
      allPages<ListRow>((from, to) => ordered(byLines().in("recipe_ingredient.ingredient_id", chunk)).range(from, to)),
    ),
  ]);

  const found = new Map<string, ListRow>();
  for (const rows of results) {
    for (const row of rows) {
      const { id, title, image_url, total_minutes, original_servings, is_favorite, created_at } = row;
      found.set(id, { id, title, image_url, total_minutes, original_servings, is_favorite, created_at });
    }
  }
  if (found.size === 0) return [];
  // All the found recipes' lines, read once for the status, not only the matching ones.
  const lines = await linesOf(db, [...found.keys()]);
  return [...found.values()].sort(newestFirst).map((row) => toListRow(row, lines.get(row.id) ?? []));
}

/**
 * The signed-in user's recipes among `ids` as library rows with their lines,
 * for the meal plan and the shopping list (AD-1); ids that are not the
 * user's recipes are left out, and the order is not kept. Read once per chunk
 * of ids, with the lines embedded. Throws RecipeDataError.
 */
export async function getRecipesByIdsIn(db: RecipesDb, ids: readonly string[]): Promise<RecipeListRow[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const pages = await Promise.all(
    chunked(unique).map((chunk) =>
      allPages((from, to) =>
        db
          .from("recipe")
          .select(`${listColumns}, lines:recipe_ingredient(${lineColumns})`)
          .in("id", chunk)
          .order("id")
          .order("position", { referencedTable: "lines" })
          .range(from, to),
      ),
    ),
  );
  return pages.flat().map(({ lines, ...row }) => toListRow(row, lines));
}
