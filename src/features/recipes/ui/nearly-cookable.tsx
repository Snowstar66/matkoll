"use client";

import { useId, useState } from "react";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import { RecipeImage } from "@/components/recipe-image";
import { dishEmoji } from "../domain/dish-emoji";
import { recipeTimeText, type RecipeListItem } from "../domain/recipe-list";

/** "Saknar grädde, dill" (names in the recipe's order), or "Saknar 2 varor" if the names are not known. */
export function missingLineText(recipe: Pick<RecipeListItem, "missingCount" | "missingNames">): string {
  const names = recipe.missingNames ?? [];
  if (names.length > 0 && names.length === recipe.missingCount) return `Saknar ${names.join(", ")}`;
  const count = recipe.missingCount ?? 0;
  return `Saknar ${count} ${count === 1 ? "vara" : "varor"}`;
}

/**
 * "Nästan (N)" under the recipes in Kan lagas nu: a collapsed row that opens
 * the recipes missing one or two items, each saying which ones.
 */
export function NearlyCookable({ recipes }: { recipes: readonly RecipeListItem[] }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (recipes.length === 0) return null;
  return (
    <section className="mt-3" data-testid="nearly-cookable">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 w-full items-center justify-between rounded-lg px-1 text-left text-body font-medium text-ink-1 focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span>Nästan ({recipes.length})</span>
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      <div id={listId} hidden={!open}>
        {open ? (
          <ListGroup label="Recept som nästan kan lagas" className="[&>li]:border-b-0">
            {recipes.map((recipe) => {
              const time = recipeTimeText(recipe.totalMinutes);
              return (
                <ListRow
                  key={recipe.id}
                  data-testid="nearly-row"
                  className="min-h-[72px]"
                  href={`/recept/${recipe.id}`}
                  title={<span className="block truncate">{recipe.title}</span>}
                  meta={
                    <>
                      {time ? `${time} · ` : ""}
                      <span className="font-medium text-sky-ink">{missingLineText(recipe)}</span>
                    </>
                  }
                  leading={<RecipeImage src={recipe.imageUrl} emoji={dishEmoji(recipe.title)} iconSize={28} className="size-14 rounded-[10px]" />}
                />
              );
            })}
          </ListGroup>
        ) : null}
      </div>
    </section>
  );
}
