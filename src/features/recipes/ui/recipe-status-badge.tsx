import { StatusBadge } from "@/components/badges";
import { missingNamesText, recipeStatusText } from "@/features/pantry";

/**
 * "Kan lagas nu" in mint, or "Saknar N varor" in light blue (UX-DR8); N from
 * pantry.recipeStatus. `onImage`: on the recipe card's image, on the light
 * plate, wrapping onto at most two lines so it stays on the image.
 * `missingNames` (Story 4.3): the visible text stays short; the names follow
 * it for screen readers ("Saknar 2 varor: tryffelolja, persilja") and in the
 * title ("Saknar: tryffelolja, persilja +1").
 */
export function RecipeStatusBadge({
  missingCount,
  missingNames = [],
  onImage = false,
}: {
  missingCount: number;
  missingNames?: readonly string[];
  onImage?: boolean;
}) {
  const text = recipeStatusText(missingCount);
  const named = missingCount > 0 ? missingNamesText(missingNames) : null;
  return (
    <StatusBadge status={missingCount === 0 ? "ok" : "missing"} onImage={onImage} title={named ?? undefined}>
      {onImage ? <span className="truncate">{text}</span> : text}
      {named ? <span className="sr-only">{named.replace("Saknar", "")}</span> : null}
    </StatusBadge>
  );
}
