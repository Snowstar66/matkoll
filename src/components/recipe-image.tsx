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
 * The recipe's picture from its address. `src` is the app's own copy
 * (/api/recipe-image/<id>/thumb or /full, a same-site route that only the
 * household's members can read; AD-15 changed for recipe images) when the
 * recipe has one, otherwise its address on the recipe site, loaded straight
 * from there without a referrer as before (recipeImageSrc picks). Without an
 * address, or when the image cannot be loaded, a drawing of the kind of dish
 * on a plate in its tone takes its place (UX-13b): a photo always wins. The
 * box's size comes from `className` (every caller gives it a fixed size or
 * height), and the image fills it, so the layout never jumps when it loads.
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
        // A plain <img>: the address may be on another site and must load without a referrer (AD-15);
        // the app's own route is already optimised (WebP, at most 1 200 px), so next/image has nothing to add.
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
