import { StatusBadge } from "@/components/badges";
import { RingIcon } from "@/components/icons";
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

/**
 * The recipe view's status when something is missing (Story 4.3, 19.6): a card with a ring,
 * "Saknar 6 varor" and the names under it ("kycklingfilé, morot +4"), as a button that takes
 * Pontus to the ingredients, at least 44 px high.
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
  const names = missingNamesText(missingNames)?.replace(/^Saknar: /, "") ?? null;
  return (
    <button
      type="button"
      onClick={onPress}
      className="flex min-h-tap w-full cursor-pointer items-start gap-3 rounded-md bg-sky px-4 py-3 text-left text-sky-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <RingIcon size={20} className="mt-0.5 shrink-0" />
      <span className="flex min-w-0 flex-col">
        <span className="text-control wrap-break-word">{recipeStatusText(missingCount)}</span>
        {names ? <span className="text-meta wrap-break-word text-ink-2">{names}</span> : null}
      </span>
    </button>
  );
}
