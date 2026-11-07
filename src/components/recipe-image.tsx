"use client";

import { useEffect, useRef, useState } from "react";
import { dishKind, type DishKind } from "@/lib/dish-kind";
import { cx } from "./cx";
import { DishArt, dishTone } from "./dish-art";

export type RecipeImageProps = {
  /** The recipe's image address, or null when it has none. */
  src: string | null;
  /** The drawing's size in px: 88 on a card, smaller in a thumbnail. */
  artSize?: number;
  /**
   * UX-13b: the kind of dish drawn when there is no image or it cannot be
   * loaded (dishKind from the title and the ingredient lines). Left out, it
   * comes from `title` alone.
   */
  dish?: DishKind;
  /** The recipe's title, which the drawing is chosen from when `dish` is left out. */
  title?: string;
  className?: string;
};

/**
 * The recipe's picture from its address (AD-15): loaded straight from the
 * recipe site without a referrer, and never stored. Without an address, or
 * when the image cannot be loaded, a drawing of the kind of dish on a plate in
 * its tone takes its place (UX-13b): a site's photo always wins.
 */
export function RecipeImage({ src, artSize = 48, dish, title, className }: RecipeImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // An image that failed before hydration never fires onError in React.
  useEffect(() => {
    const image = imageRef.current;
    if (image && image.complete && image.naturalWidth === 0) setFailedSrc(image.getAttribute("src"));
  }, [src]);

  const fallback = dish ?? dishKind(title ?? "");
  const showImage = src !== null && failedSrc !== src;
  return (
    <div className={cx("relative overflow-hidden", showImage ? "bg-mint" : dishTone[fallback], className)}>
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
        <div data-testid="recipe-image-placeholder" className="flex size-full items-center justify-center">
          <DishArt dish={fallback} size={artSize} />
        </div>
      )}
    </div>
  );
}
