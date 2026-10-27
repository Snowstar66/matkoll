import { StatusBadge } from "@/components/badges";
import { recipeStatusText } from "@/features/pantry";

/**
 * "Kan lagas nu" in mint, or "Saknar N varor" in light blue (UX-DR8); N from
 * pantry.recipeStatus. `onImage`: on the recipe card's image, on the light
 * plate, wrapping onto at most two lines so it stays on the image.
 */
export function RecipeStatusBadge({ missingCount, onImage = false }: { missingCount: number; onImage?: boolean }) {
  const text = recipeStatusText(missingCount);
  return (
    <StatusBadge status={missingCount === 0 ? "ok" : "missing"} onImage={onImage}>
      {onImage ? <span className="line-clamp-2 break-words">{text}</span> : text}
    </StatusBadge>
  );
}
