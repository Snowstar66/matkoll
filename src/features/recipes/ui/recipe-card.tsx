"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/components/cx";
import { HeartToggle } from "@/components/heart-toggle";
import { TrashButton } from "@/components/trash-button";
import { RecipeImage } from "@/components/recipe-image";

type CardBase = {
  title: string;
  /**
   * The recipe's image address, or `null`: a short mint strip (`h-16`) then,
   * with the badge on it, rather than 120 px of empty placeholder. An address
   * that does not load shows the placeholder at full height.
   */
  imageUrl: string | null;
  /** Story 16.4: the dish's emoji, shown on the strip (or when the image fails) in place of the book icon. */
  emoji?: string;
  /** "35 min · 4 portioner" (recipeMetaText). */
  meta: string;
  /** Bottom left on the image: the status ("Kan lagas nu", on the light plate) or "AI-förslag". */
  badge?: ReactNode;
  "data-testid"?: string;
  /** The soptunna's name; by default "Ta bort <titel>". */
  deleteLabel?: string;
};

/**
 * A saved recipe. The title's link is stretched over the whole card, so a tap
 * anywhere opens the recipe; for that reason the card takes no children: a
 * control inside it would lie under the link and could not be tapped, and a
 * second link or button in the card would be read as part of it. The heart
 * is the one exception, lifted above the link.
 */
type LinkCardProps = CardBase & {
  href: string;
  /** The heart bottom right on the image. */
  favorite?: { pressed: boolean; onPressedChange: (pressed: boolean) => void };
  onDelete?: never;
  /** Planning mode (Story 13.8): a button under the text, lifted above the link like the heart. */
  quickAction?: ReactNode;
  children?: never;
};

/**
 * A card without a recipe view yet (an AI suggestion): the title is a
 * heading, the card no link, and it may hold its own controls ("Spara"),
 * under the time line. No heart: only a saved recipe can be a favourite.
 */
type PlainCardProps = CardBase & {
  href?: never;
  favorite?: never;
  quickAction?: never;
  /** A small soptunna like a saved recipe's, for a suggestion Pontus does not want (Story 16.1). */
  onDelete?: (bin: HTMLButtonElement) => void;
  children?: ReactNode;
};

export type RecipeCardProps = LinkCardProps | PlainCardProps;

/**
 * Receptkort (Epic 11, DESIGN.md recipe-card, UX-DR26): the recipe's own
 * image in full width on top, `card-image` high and cropped to fill, with the
 * badge bottom left and the heart bottom right on the light `overlay` plate;
 * the title (never cut short) and "35 min · 4 portioner" under it.
 *
 * In the markup the text comes first, then the image with its badge and
 * heart, then any children; the image is put on top with `order-first`. So a
 * screen reader reads title, time, status, "Favorit" (or "AI-förslag") and
 * last "Spara". The heart sits above the stretched link (`z-10` over its
 * `z-1`), toggles the favourite and never navigates; the badge lies under
 * the link, so a tap on it opens the recipe. The badge keeps clear of the
 * heart and wraps onto at most two lines, so it stays on the image with 200 %
 * text.
 */
export function RecipeCard({
  title,
  imageUrl,
  emoji,
  meta,
  href,
  badge,
  favorite,
  onDelete,
  deleteLabel,
  quickAction,
  children,
  "data-testid": testId = "recipe-card",
}: RecipeCardProps) {
  const hasChildren = children !== undefined && children !== null;
  return (
    <li data-testid={testId} className="relative flex min-w-0 flex-col rounded-lg bg-surface">
      <div className={cx("flex min-w-0 gap-1 pl-3 pt-3", onDelete ? "pr-1" : "pr-3", hasChildren || quickAction ? "pb-1" : "pb-3")}>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {href ? (
            <Link
              href={href}
              className="text-row-title break-words text-ink outline-none after:absolute after:inset-0 after:z-1 after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent"
            >
              {title}
            </Link>
          ) : (
            <h3 className="text-row-title break-words text-ink">{title}</h3>
          )}
          <p className="text-meta text-ink-3">{meta}</p>
        </div>
        {onDelete ? (
          <TrashButton label={deleteLabel ?? `Ta bort ${title}`} onPress={onDelete} className="relative z-10 -mt-2" />
        ) : null}
      </div>
      <div className="relative order-first">
        <RecipeImage
          src={imageUrl}
          emoji={emoji}
          iconSize={emoji ? (imageUrl === null ? 36 : 56) : imageUrl === null ? 24 : 40}
          className={cx("w-full rounded-t-lg", imageUrl === null ? "h-16" : "h-card-image")}
        />
        {badge || favorite ? (
          <div
            data-testid="recipe-card-plates"
            className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2"
          >
            {/* 3.5rem: the heart's 44 px and the gap, so the badge never runs under it. */}
            <div className="flex max-w-[calc(100%-3.5rem)] min-w-0">{badge}</div>
            {favorite ? (
              <HeartToggle
                pressed={favorite.pressed}
                onPressedChange={favorite.onPressedChange}
                label={`Favorit, ${title}`}
                // The focus ring is drawn inside the light plate, so it shows on any photo.
                className="relative z-10 bg-overlay focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-accent"
              />
            ) : null}
          </div>
        ) : null}
      </div>
      {quickAction ? <div className="relative z-10 order-last flex flex-col items-start gap-2 px-3 pb-3">{quickAction}</div> : null}
      {hasChildren ? <div className="order-last flex flex-col items-start gap-2 px-3 pb-3">{children}</div> : null}
    </li>
  );
}
