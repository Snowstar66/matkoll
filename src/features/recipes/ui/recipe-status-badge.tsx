import { StatusBadge } from "@/components/badges";
import { recipeStatusText } from "@/features/pantry";

/** "Kan lagas nu" in mint, or "Saknar N varor" in light blue (UX-DR8); N from pantry.recipeStatus. */
export function RecipeStatusBadge({ missingCount }: { missingCount: number }) {
  return (
    <StatusBadge status={missingCount === 0 ? "ok" : "missing"}>{recipeStatusText(missingCount)}</StatusBadge>
  );
}
