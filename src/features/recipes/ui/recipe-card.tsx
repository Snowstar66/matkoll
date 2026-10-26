"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { HeartToggle } from "@/components/heart-toggle";
import { RecipeImage } from "@/components/recipe-image";

export type RecipeCardProps = {
  title: string;
  /** The recipe's image address, or `null`: the mint placeholder then. */
  imageUrl: string | null;
  /** "35 min · 4 portioner" (recipeMetaText). */
  meta: string;
  /**
   * The recipe view. The title's link is stretched over the whole card, so a
   * tap anywhere opens it. Without it (an AI suggestion, which has no recipe
   * view until saved) the title is a heading and the card no link.
   */
  href?: string;
  /** Bottom left on the image: the status ("Kan lagas nu", on the light plate) or "AI-förslag". */
  badge?: ReactNode;
  /** The heart bottom right on the image; none on an AI suggestion. */
  favorite?: { pressed: boolean; onPressedChange: (pressed: boolean) => void };
  /** Under the time line, e.g. an AI suggestion's ingredients and "Spara". */
  children?: ReactNode;
  "data-testid"?: string;
};

/**
 * Receptkort (Epic 11, DESIGN.md recipe-card, UX-DR26): the recipe's own
 * image in full width on top, `card-image` high and cropped to fill, with the
 * badge bottom left and the heart bottom right on the light `overlay` plate;
 * the title and "35 min · 4 portioner" under it. The text comes first in the
 * markup, so a screen reader reads title, time, status and then "Favorit";
 * the image is put on top with `order-first`. The heart sits above the
 * stretched link (`z-10` over its `z-1`), toggles the favourite and never
 * navigates; the badge lies under the link, so a tap on it opens the recipe.
 */
export function RecipeCard({
  title,
  imageUrl,
  meta,
  href,
  badge,
  favorite,
  children,
  "data-testid": testId = "recipe-card",
}: RecipeCardProps) {
  return (
    <li data-testid={testId} className="relative flex min-w-0 flex-col rounded-lg bg-surface">
      <div className="flex min-w-0 flex-col gap-1 p-3">
        {href ? (
          <Link
            href={href}
            className="line-clamp-2 text-row-title break-words text-ink outline-none after:absolute after:inset-0 after:z-1 after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent"
          >
            {title}
          </Link>
        ) : (
          <h3 className="text-row-title break-words text-ink">{title}</h3>
        )}
        <p className="text-meta text-ink-3">{meta}</p>
        {children}
      </div>
      <div className="relative order-first">
        <RecipeImage src={imageUrl} iconSize={40} className="h-card-image w-full rounded-t-lg" />
        {badge || favorite ? (
          <div
            data-testid="recipe-card-plates"
            className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2"
          >
            <div className="flex min-w-0 break-words">{badge}</div>
            {favorite ? (
              <HeartToggle
                pressed={favorite.pressed}
                onPressedChange={favorite.onPressedChange}
                label={`Favorit, ${title}`}
                className="relative z-10 bg-overlay"
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
