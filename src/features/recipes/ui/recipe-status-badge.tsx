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
      {onImage ? <span className="line-clamp-2 break-words">{text}</span> : text}
      {named ? <span className="sr-only">{named.replace("Saknar", "")}</span> : null}
    </StatusBadge>
  );
}

/**
 * The recipe view's status when something is missing (Story 4.3): "Saknar:
 * tryffelolja, persilja +1" as a button that takes Pontus to the ingredients,
 * 44 px high. Without names it says "Saknar N varor".
 */
export function MissingChip({
  missingCount,
  missingNames,
  onPress,
}: {
  missingCount: number;
  missingNames: readonly string[];
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="inline-flex min-h-tap max-w-full cursor-pointer items-center rounded-sm bg-sky px-[9px] py-[3px] text-left text-badge break-words text-sky-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {missingNamesText(missingNames) ?? recipeStatusText(missingCount)}
    </button>
  );
}
