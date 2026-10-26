import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** A Supabase client for the catalog's data functions; in requests, the user's session client. */
export type CatalogDb = SupabaseClient<Database>;

export type CatalogErrorCode =
  /** The choices do not follow ingredientChoiceSchema, or a proposal has no usable name. */
  | "validation"
  /** A match or chosen id is not an ingredient in the user's catalog. */
  | "unknown_ingredient"
  /** One call chose different ingredients for the same normalised text. */
  | "conflicting_synonyms"
  /** A Supabase query failed; `detail` is its error code. */
  | "query_failed";

/** A failed catalog call. The message holds only the code and a fixed detail, never user data. */
export class CatalogDataError extends Error {
  constructor(
    readonly code: CatalogErrorCode,
    readonly detail?: string,
  ) {
    super(detail ? `catalog_${code}: ${detail}` : `catalog_${code}`);
    this.name = "CatalogDataError";
  }
}

/** Values per `.in(...)` filter, so a long recipe never makes an over-long request URL. */
export const lookupChunkSize = 100;

export function chunks<T>(values: readonly T[], size = lookupChunkSize): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < values.length; start += size) result.push(values.slice(start, start + size));
  return result;
}
