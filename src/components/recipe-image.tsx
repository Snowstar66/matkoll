"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "./cx";
import { RecipesIcon } from "./icons";

export type RecipeImageProps = {
  /** The recipe's image address, or null when it has none. */
  src: string | null;
  /** The placeholder icon's size: 48 for the recipe view, smaller for a 72 px thumbnail. */
  iconSize?: number;
  /**
   * Story 16.4: an illustration for the dish (an emoji) in the place of the
   * book icon, shown when there is no image or it cannot be loaded.
   * Decoration, so hidden from a screen reader.
   */
  emoji?: string;
  className?: string;
};

/**
 * The recipe's picture from its address (AD-15): loaded straight from the
 * recipe site without a referrer, and never stored. Without an address, or
 * when the image cannot be loaded, a quiet placeholder takes its place.
 */
export function RecipeImage({ src, iconSize = 48, emoji, className }: RecipeImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // An image that failed before hydration never fires onError in React.
  useEffect(() => {
    const image = imageRef.current;
    if (image && image.complete && image.naturalWidth === 0) setFailedSrc(image.getAttribute("src"));
  }, [src]);

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
        <div
          data-testid="recipe-image-placeholder"
          className={cx("flex size-full items-center justify-center", emoji ? "text-ink" : "text-mint-ink")}
        >
          {emoji ? (
            <span data-testid="recipe-illustration" aria-hidden="true" style={{ fontSize: iconSize, lineHeight: 1 }}>
              {emoji}
            </span>
          ) : (
            <RecipesIcon size={iconSize} />
          )}
        </div>
      )}
    </div>
  );
}
