"use client";

import { useEffect, useRef, useState } from "react";
import { dishEmoji } from "@/lib/dish-emoji";
import { cx } from "./cx";

export type RecipeImageProps = {
  /** The recipe's image address, or null when it has none. */
  src: string | null;
  /** The fallback emoji's size: 36 for the recipe view, smaller for a thumbnail. */
  iconSize?: number;
  /**
   * Story 16.4: an illustration for the dish (an emoji), shown when there is
   * no image or it cannot be loaded. Decoration, so hidden from a screen reader.
   * Left out, it comes from `title` (dishEmoji), so the same recipe has the
   * same fallback everywhere (UX-13).
   */
  emoji?: string;
  /** The recipe's title, which the fallback emoji is chosen from. */
  title?: string;
  className?: string;
};

/**
 * The recipe's picture from its address (AD-15): loaded straight from the
 * recipe site without a referrer, and never stored. Without an address, or
 * when the image cannot be loaded, the dish's emoji on mint takes its place.
 */
export function RecipeImage({ src, iconSize = 48, emoji, title, className }: RecipeImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // An image that failed before hydration never fires onError in React.
  useEffect(() => {
    const image = imageRef.current;
    if (image && image.complete && image.naturalWidth === 0) setFailedSrc(image.getAttribute("src"));
  }, [src]);

  const fallbackEmoji = emoji ?? dishEmoji(title ?? "");
  const showImage = src !== null && failedSrc !== src;
  return (
    <div className={cx("relative overflow-hidden bg-mint", className)}>
      {showImage ? (
        // A plain <img>: the address is on another site and must load without a referrer (AD-15).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imageRef}
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          // Never dragged out, so a swipe on a card with the image moves the card.
          draggable={false}
          onError={() => setFailedSrc(src)}
          className="size-full object-cover"
        />
      ) : (
        <div data-testid="recipe-image-placeholder" className="flex size-full items-center justify-center text-ink">
          <span data-testid="recipe-illustration" aria-hidden="true" style={{ fontSize: iconSize, lineHeight: 1 }}>
            {fallbackEmoji}
          </span>
        </div>
      )}
    </div>
  );
}
