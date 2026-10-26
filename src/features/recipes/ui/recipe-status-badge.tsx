import { StatusBadge } from "@/components/badges";
import { recipeStatusText } from "@/features/pantry";

/**
 * "Kan lagas nu" in mint, or "Saknar N varor" in light blue (UX-DR8); N from
 * pantry.recipeStatus. `onImage`: on the recipe card's image, on the light plate.
 */
export function RecipeStatusBadge({ missingCount, onImage = false }: { missingCount: number; onImage?: boolean }) {
  return (
    <StatusBadge status={missingCount === 0 ? "ok" : "missing"} onImage={onImage}>
      {recipeStatusText(missingCount)}
    </StatusBadge>
  );
}
