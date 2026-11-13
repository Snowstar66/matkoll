"use client";

import { CheckIcon } from "@/components/icons";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import { RecipeImage } from "@/components/recipe-image";
import { recipeMetaText, recipeTimeText } from "../domain/recipe-list";
import {
  sharedByOthersHeading,
  sharedByUsHeading,
  sharedByYouText,
  sharedFromText,
  sharedItemHref,
  splitShared,
  type SharedListItem,
} from "../domain/shared-recipe";
import { RecipeCard } from "./recipe-card";

/** Where a shared recipe opens. */
export function sharedRecipeHref(id: string): string {
  return `/recept/delade/${id}`;
}

/** "✓ Sparat" on a shared recipe's image: the household has a copy. Where "Saknar 1 vara" sits on an own recipe, in mint. */
function SavedBadge() {
  return (
    <span data-testid="shared-saved" className="inline-flex items-center gap-1 self-start rounded-sm bg-overlay px-[9px] py-[3px] text-badge text-mint-ink">
      <CheckIcon size={14} className="shrink-0" />
      Sparat
    </span>
  );
}

/**
 * Delade as cards: the same cards as own recipes (image or drawing, title, "45 min · 4 portioner")
 * with "från Lindqvists" under, and no heart and no "Saknar" (someone else's recipe); "✓ Sparat"
 * when the household has saved a copy. A tap opens the shared recipe.
 */
export function SharedRecipeList({ recipes, label = "Delade recept" }: { recipes: readonly SharedListItem[]; label?: string }) {
  return (
    <ul aria-label={label} className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,9rem),1fr))] gap-3 desktop:grid-cols-3">
      {recipes.map((recipe) => (
        <RecipeCard
          key={recipe.id}
          data-testid="shared-recipe-card"
          title={recipe.title}
          tile
          imageUrl={recipe.imageUrl}
          dish={recipe.dish}
          meta={recipeMetaText(recipe.totalMinutes, recipe.originalServings)}
          byline={recipe.mine ? sharedByYouText : sharedFromText(recipe.householdName)}
          href={sharedItemHref(recipe)}
          badge={recipe.savedCopyId ? <SavedBadge /> : undefined}
        />
      ))}
    </ul>
  );
}

/** Delade as the compact list: "25 min · 4 port. · från Bergs", and "Sparat" for one saved. */
export function SharedRecipeCompactList({ recipes, label = "Delade recept" }: { recipes: readonly SharedListItem[]; label?: string }) {
  return (
    <ListGroup label={label} className="[&>li]:border-b-0">
      {recipes.map((recipe) => {
        const time = recipeTimeText(recipe.totalMinutes);
        return (
          <ListRow
            key={recipe.id}
            data-testid="shared-recipe-row"
            className="min-h-[72px] [&>a]:pl-3 [&>div:first-child]:pl-3"
            href={sharedItemHref(recipe)}
            title={<span className="block truncate">{recipe.title}</span>}
            meta={
              <>
                {time ? `${time} · ` : ""}
                {recipe.originalServings} port. · {recipe.mine ? sharedByYouText : sharedFromText(recipe.householdName)}
                {recipe.savedCopyId ? (
                  <>
                    {" · "}
                    <span className="font-medium text-mint-ink">Sparat</span>
                  </>
                ) : null}
              </>
            }
            leading={<RecipeImage src={recipe.imageUrl} dish={recipe.dish} title={recipe.title} artSize={44} className="size-14 rounded-[10px]" />}
          />
        );
      })}
    </ListGroup>
  );
}

/**
 * Delade in two sections, "Delat av andra" and "Delat av oss" (the household's own shared recipes), each
 * under an h2 and newest first as given; a section without recipes is left out.
 */
export function SharedSections({ recipes, compact }: { recipes: readonly SharedListItem[]; compact: boolean }) {
  const { others, mine } = splitShared(recipes);
  const sections = [
    { key: "others", heading: sharedByOthersHeading, items: others },
    { key: "mine", heading: sharedByUsHeading, items: mine },
  ].filter((section) => section.items.length > 0);
  return (
    <div className="flex flex-col gap-5">
      {sections.map((section) => (
        <section key={section.key} data-testid={`shared-section-${section.key}`} aria-labelledby={`shared-heading-${section.key}`} className="flex flex-col gap-2">
          <h2 id={`shared-heading-${section.key}`} className="mx-1 text-section-label text-ink-2">
            {section.heading}
          </h2>
          {compact ? <SharedRecipeCompactList recipes={section.items} label={section.heading} /> : <SharedRecipeList recipes={section.items} label={section.heading} />}
        </section>
      ))}
    </div>
  );
}
