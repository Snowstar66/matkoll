"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/cx";
import { RecipesIcon } from "@/components/icons";

export type RecipeImageProps = {
  /** The recipe's image address, or null when it has none. */
  src: string | null;
  /** The placeholder icon's size: 48 for the recipe view, smaller for a 72 px thumbnail. */
  iconSize?: number;
  className?: string;
};

/**
 * The recipe's picture from its address (AD-15): loaded straight from the
 * recipe site without a referrer, and never stored. Without an address, or
 * when the image cannot be loaded, a quiet placeholder takes its place.
 */
export function RecipeImage({ src, iconSize = 48, className }: RecipeImageProps) {
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
          onError={() => setFailedSrc(src)}
          className="size-full object-cover"
        />
      ) : (
        <div data-testid="recipe-image-placeholder" className="flex size-full items-center justify-center text-mint-ink">
          <RecipesIcon size={iconSize} />
        </div>
      )}
    </div>
  );
}
