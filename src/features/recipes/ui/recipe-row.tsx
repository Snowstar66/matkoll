"use client";

import Link from "next/link";
import { HeartToggle } from "@/components/heart-toggle";
import { recipeMetaText, type RecipeListItem } from "../domain/recipe-list";
import { RecipeImage } from "./recipe-image";
import { RecipeStatusBadge } from "./recipe-status-badge";

export type RecipeRowProps = {
  recipe: RecipeListItem;
  /** Whether the recipe is a favourite now, optimistic included. */
  isFavorite: boolean;
  onFavoriteChange: (isFavorite: boolean) => void;
};

/**
 * Receptrad: 72 px image, title, "35 min · 4 portioner", the status ("Kan
 * lagas nu" or "Saknar N varor"; none when the pantry could not be read) and
 * the heart. The title's link is stretched over the whole row, so a tap
 * anywhere opens the recipe; the heart sits beside the link, above it, and
 * never navigates.
 */
export function RecipeRow({ recipe, isFavorite, onFavoriteChange }: RecipeRowProps) {
  return (
    <li data-testid="recipe-row" className="relative flex items-center gap-[14px] rounded-lg bg-surface p-3">
      <RecipeImage src={recipe.imageUrl} iconSize={28} className="size-thumb shrink-0 rounded-md" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          href={`/recept/${recipe.id}`}
          className="line-clamp-2 text-row-title break-words text-ink outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent"
        >
          {recipe.title}
        </Link>
        <p className="text-meta text-ink-3">{recipeMetaText(recipe.totalMinutes, recipe.originalServings)}</p>
        {recipe.missingCount !== null ? <RecipeStatusBadge missingCount={recipe.missingCount} /> : null}
      </div>
      <HeartToggle
        pressed={isFavorite}
        onPressedChange={onFavoriteChange}
        label={`Favorit, ${recipe.title}`}
        className="relative z-10"
      />
    </li>
  );
}
