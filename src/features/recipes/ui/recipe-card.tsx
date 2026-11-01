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
   * The recipe's image address, or `null`: a mint placeholder
   * (with the badge on it) at the same height as a photo, so the cards in a
   * row are equally tall. An address that does not load shows it too.
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
  /** Story 14.4: a narrow tile for the two-column phone grid: 104 px image, title cut after two lines. */
  tile?: boolean;
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
              className={cx("line-clamp-2 text-[15px]/5 font-semibold wrap-break-word text-ink outline-none", "after:absolute after:inset-0 after:z-1 after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent")}
            >
              {title}
            </Link>
          ) : (
            <h3 className="text-[15px]/5 font-semibold wrap-break-word text-ink">{title}</h3>
          )}
          <p className="text-[13px]/[18px] text-ink-3">{meta}</p>
        </div>
        {onDelete ? (
          <TrashButton label={deleteLabel ?? `Ta bort ${title}`} onPress={onDelete} className="relative z-10 -mt-2" />
        ) : null}
      </div>
      <div className="relative order-first">
        <RecipeImage
          src={imageUrl}
          emoji={emoji}
          iconSize={emoji ? 56 : 40}
          className={cx("w-full rounded-t-lg", "h-card-image desktop:h-[180px]")}
        />
        {badge ? (
          <div data-testid="recipe-card-plates" className="absolute inset-x-0 bottom-0 flex p-2">
            <div className="flex max-w-full min-w-0">{badge}</div>
          </div>
        ) : null}
        {favorite ? (
          // 44 px tap area with the 32 px glass plate inside, 4 px from the corner.
          <div className="absolute top-0.5 right-0.5 z-10">
            <HeartToggle
              pressed={favorite.pressed}
              onPressedChange={favorite.onPressedChange}
              label={`Favorit, ${title}`}
              glass
              // The focus ring is drawn inside the tap area, so it shows on any photo.
              className="focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-accent"
            />
          </div>
        ) : null}
      </div>
      {quickAction ? <div className="relative z-10 order-last flex flex-col items-start gap-2 px-3 pb-3">{quickAction}</div> : null}
      {hasChildren ? <div className="order-last flex flex-col items-start gap-2 px-3 pb-3">{children}</div> : null}
    </li>
  );
}
