import "server-only";
import { z } from "zod";
import { ingredientChoiceSchema, type IngredientChoice } from "../domain/match";
import { catalogName } from "../domain/name";
import { normalizeIngredientText } from "../domain/normalize";
import { CatalogDataError, type CatalogDb } from "./client";
import { existingIngredientIds, loadCatalogSnapshot } from "./queries";

const choicesSchema = z.array(ingredientChoiceSchema);

type NewIngredientRow = {
  name: string;
  normalized_name: string;
  section: string;
  location: string;
  default_unit: string | null;
};
type SynonymRow = { normalized: string; ingredient_id: string } | { normalized: string; ingredient_name: string };

/**
 * Saves the catalog side of a save (AD-6). Called only from saving actions,
 * never while matching. Returns the ingredient id for each choice, in the
 * order given (`null` for "unmatched"), so lines with the same text can point
 * at different ingredients ("salt och peppar" → salt, svartpeppar).
 *
 * - New ingredients are created with `insert … on conflict (household_id,
 *   normalized_name) do update … returning id` (Story 21.2a: the household's catalog): concurrent commits of a name
 *   get one row and the same id, and an existing ingredient is never changed.
 * - A "chosen" ingredient (Pontus picked another than the suggestion) saves the
 *   normalised original text as a synonym for it, pointing an existing synonym
 *   at it. Choosing different ingredients for the same text in one call is an
 *   error (`conflicting_synonyms`).
 * - A new ingredient whose name differs from the normalised text also gets the
 *   text as a synonym, unless a chosen ingredient or another new ingredient in
 *   the same call claims that text.
 * - No synonym is saved when the text already leads to that ingredient, or when
 *   the text is an ingredient's exact name: the name match comes first and the
 *   synonym could never be used.
 *
 * Ingredients and synonyms are written in one statement (commit_ingredients).
 * Match and chosen ids must be in the user's catalog (`unknown_ingredient`).
 * Throws CatalogDataError.
 */
export async function commitIngredients(
  db: CatalogDb,
  choices: readonly IngredientChoice[],
): Promise<(string | null)[]> {
  const parsed = choicesSchema.safeParse(choices);
  if (!parsed.success) throw new CatalogDataError("validation", "choices");

  const newIngredients = new Map<string, NewIngredientRow>();
  const nameOf = new Map<number, string>();
  parsed.data.forEach(({ ingredient }, index) => {
    if (ingredient.kind !== "new") return;
    const normalized = normalizeIngredientText(ingredient.proposal.name);
    if (!normalized) throw new CatalogDataError("validation", "proposal_name");
    nameOf.set(index, normalized);
    if (!newIngredients.has(normalized)) {
      newIngredients.set(normalized, {
        // Story 10.4: stored with an uppercase first letter, whatever the source.
        name: catalogName(ingredient.proposal.name),
        normalized_name: normalized,
        section: ingredient.proposal.section,
        location: ingredient.proposal.location,
        default_unit: ingredient.proposal.defaultUnit,
      });
    }
  });

  const referenced = parsed.data.flatMap(({ ingredient }) =>
    ingredient.kind === "match" || ingredient.kind === "chosen" ? [ingredient.ingredientId] : [],
  );
  if (referenced.length > 0) {
    const found = await existingIngredientIds(db, referenced);
    if (referenced.some((id) => !found.has(id))) throw new CatalogDataError("unknown_ingredient");
  }

  // Synonym candidates: chosen (explicit) and new ingredients' texts (implicit).
  const chosen = new Map<string, string>();
  const implicit = new Map<string, string | null>();
  parsed.data.forEach(({ text, ingredient }, index) => {
    const normalized = normalizeIngredientText(text);
    if (!normalized) return;
    if (ingredient.kind === "chosen") {
      const earlier = chosen.get(normalized);
      if (earlier && earlier !== ingredient.ingredientId) throw new CatalogDataError("conflicting_synonyms");
      chosen.set(normalized, ingredient.ingredientId);
    } else if (ingredient.kind === "new") {
      const name = nameOf.get(index)!;
      if (normalized === name) return;
      const earlier = implicit.get(normalized);
      // null: two new ingredients claim the text, so it gets no synonym.
      implicit.set(normalized, earlier === undefined || earlier === name ? name : null);
    }
  });

  const synonyms: SynonymRow[] = [];
  if (chosen.size > 0 || implicit.size > 0) {
    const snapshot = await loadCatalogSnapshot(db, [...chosen.keys(), ...implicit.keys()]);
    const isName = (text: string) => snapshot.ingredients.has(text) || newIngredients.has(text);
    for (const [normalized, id] of chosen) {
      if (isName(normalized) || snapshot.synonyms.get(normalized) === id) continue;
      synonyms.push({ normalized, ingredient_id: id });
    }
    for (const [normalized, name] of implicit) {
      if (name === null || chosen.has(normalized) || isName(normalized)) continue;
      synonyms.push({ normalized, ingredient_name: name });
    }
  }

  const idsByName = new Map<string, string>();
  if (newIngredients.size > 0 || synonyms.length > 0) {
    const { data, error } = await db.rpc("commit_ingredients", {
      new_ingredients: [...newIngredients.values()],
      synonyms,
    });
    if (error) throw new CatalogDataError("query_failed", error.code);
    for (const row of data) idsByName.set(row.normalized_name, row.id);
  }

  return parsed.data.map(({ ingredient }, index) => {
    switch (ingredient.kind) {
      case "unmatched":
        return null;
      case "new": {
        const id = idsByName.get(nameOf.get(index)!);
        if (!id) throw new CatalogDataError("query_failed", "missing_id");
        return id;
      }
      default:
        return ingredient.ingredientId;
    }
  });
}
