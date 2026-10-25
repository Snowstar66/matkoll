import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeftIcon } from "@/components/icons";
import { formatQuantity, normalizeIngredientText } from "@/features/catalog";
import { recipeMetaText } from "../domain/recipe-list";
import type { SavedRecipe, SavedRecipeLine } from "../domain/saved-recipe";
import { sourceLabel } from "../domain/source-label";
import { FavoriteButton } from "./favorite-button";
import { RecipeImage } from "./recipe-image";

// Receptvy (FR-20, the base): the same look whatever the source, with the
// heart (FR-9) and the menu (⋯, Story 1.11) beside the title. The portion
// selector, "X av Y hemma" and the buttons arrive in later stories.

/** `menu`: the menu (⋯) with "Ändra", from the page, which has what its form needs. */
export function RecipeView({ recipe, menu }: { recipe: SavedRecipe; menu?: ReactNode }) {
  const source = sourceLabel(recipe.sourceKind, recipe.sourceUrl);
  return (
    <article className="flex flex-col gap-6 pb-gutter">
      <div className="relative -mx-page desktop:mx-0 desktop:mt-10">
        <RecipeImage src={recipe.imageUrl} className="h-[260px] desktop:rounded-lg" />
        {/* On desktop the side menu is always there, so no back link. */}
        <Link
          href="/recept"
          scroll={false}
          aria-label="Tillbaka till recepten"
          className="absolute top-[max(var(--header-top-mobile),calc(env(safe-area-inset-top)+12px))] left-page flex size-tap items-center justify-center rounded-full bg-surface text-ink desktop:hidden"
        >
          <ChevronLeftIcon size={20} />
        </Link>
      </div>

      <header className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <h1 className="min-w-0 text-recipe-title break-words text-ink">{recipe.title}</h1>
          <div className="-mt-1 -mr-2.5 flex shrink-0">
            <FavoriteButton id={recipe.id} isFavorite={recipe.isFavorite} />
            {menu}
          </div>
        </div>
        <p className="text-meta text-ink-2">{recipeMetaText(recipe.totalMinutes, recipe.servings)}</p>
        <p className="text-meta text-ink-2">
          Källa:{" "}
          {recipe.sourceKind === "url" && recipe.sourceUrl ? (
            <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent underline">
              {source}
            </a>
          ) : (
            source
          )}
        </p>
      </header>

      {/* Mobile: ingredients above the steps. Desktop: side by side. */}
      <div className="flex flex-col gap-6 desktop:grid desktop:grid-cols-[2fr_3fr] desktop:items-start">
        <section aria-labelledby="ingredienser" className="flex flex-col gap-1 rounded-lg bg-surface px-4 py-3">
          <h2 id="ingredienser" className="text-section-label text-ink-2">
            Ingredienser
          </h2>
          {recipe.lines.length > 0 ? (
            <ul className="flex flex-col">
              {recipe.lines.map((line) => (
                <IngredientRow key={line.id} line={line} />
              ))}
            </ul>
          ) : (
            <p className="py-2 text-body text-ink-2">Receptet har inga ingredienser.</p>
          )}
        </section>

        <section aria-labelledby="steg" className="flex flex-col gap-3">
          <h2 id="steg" className="text-section-label text-ink-2">
            Steg
          </h2>
          {recipe.steps.length > 0 ? (
            <ol className="flex flex-col gap-4">
              {recipe.steps.map((step, index) => (
                <li key={step.id} className="flex gap-3">
                  <span aria-hidden="true" className="w-6 shrink-0 text-row-title text-accent">
                    {index + 1}
                  </span>
                  <p className="text-body text-ink">{step.text}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-body text-ink-2">Receptet har inga steg.</p>
          )}
        </section>
      </div>
    </article>
  );
}

/**
 * A line with a catalog ingredient and an amount shows the name and "1,5 dl",
 * and under them the original text when it says more than the name ("Lök,
 * finhackad" for Rödlök). A vague line, or one without an ingredient, shows
 * its original text.
 */
function IngredientRow({ line }: { line: SavedRecipeLine }) {
  const name = !line.isVague ? line.ingredientName : null;
  const showOriginal =
    name !== null && normalizeIngredientText(line.originalText) !== normalizeIngredientText(name);
  return (
    <li
      data-testid="recipe-view-line"
      className="flex min-h-10 items-baseline justify-between gap-3 border-t border-hairline py-2 first:border-t-0"
    >
      {name !== null ? (
        <>
          <span className="flex min-w-0 flex-col">
            <span className="text-body text-ink">{name}</span>
            {showOriginal ? <span className="text-meta text-ink-2">{line.originalText}</span> : null}
          </span>
          <span className="shrink-0 text-body text-ink-2">{formatQuantity(line.amount, line.unit)}</span>
        </>
      ) : (
        <span className="text-body text-ink">{line.originalText}</span>
      )}
    </li>
  );
}
