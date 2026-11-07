"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { CatalogDataError } from "../data/client";
import { loadIngredientNames } from "../data/queries";
import type { IngredientSearchHit } from "../domain/search";
import { matchIngredientsIn } from "./match-ingredients";

// At most 100 names a call (Inköpslista's list import keeps 60), each at most 200 characters.
const namesSchema = z.array(z.string().max(200)).max(100);

/**
 * The catalog ingredient each of `names` is, in the same order, or `null` when it is none: the text is an
 * ingredient's name or one of its synonyms (the same rule that keeps the catalog free of duplicates, AD-6), so a
 * list read from a photo or pasted gets the same link a suggestion picked while typing would. Never writes.
 * Fails with `unauthorized`, `validation` or `catalog_unavailable`.
 */
export async function matchIngredientNames(names: string[]): Promise<Result<(IngredientSearchHit | null)[]>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = namesSchema.safeParse(names);
  if (!parsed.success) return fail("validation");
  if (parsed.data.length === 0) return ok([]);
  try {
    const db = await createClient();
    const matches = await matchIngredientsIn(
      db,
      parsed.data.map((text) => ({ text })),
    );
    const ids = matches.flatMap((match) => (match.kind === "match" && match.confidence !== "hint" ? [match.ingredientId] : []));
    const catalogNames = ids.length > 0 ? await loadIngredientNames(db, ids) : {};
    return ok(
      matches.map((match) => {
        if (match.kind !== "match" || match.confidence === "hint") return null;
        const name = catalogNames[match.ingredientId];
        return name ? { id: match.ingredientId, name } : null;
      }),
    );
  } catch (error) {
    if (!(error instanceof CatalogDataError)) throw error;
    console.error("catalog_unavailable", { reason: error.code });
    return fail("catalog_unavailable");
  }
}
