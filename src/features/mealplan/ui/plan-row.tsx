import type { ReactNode } from "react";
import { PlusIcon } from "@/components/icons";
import { RecipeImage } from "@/components/recipe-image";

// A compact row of "Lägg till rätter" (Story 25.3): a 44 px picture (the
// recipe's own photo, else the quiet tile, never an emoji), the title, a line
// with what is known about the dish, the offer line, and "+" or "På veckan".

export type PlanRowProps = {
  title: string;
  /** The recipe's own photo, or `null` for the quiet tile. */
  imageUrl: string | null;
  /** "Favorit · lagad 6 gånger". */
  meta: string;
  /** "Falukorv och grädde på erbjudande · spara 21 kr". */
  deal?: string | null;
  /** The dish is already on the week: "På veckan" in place of "+". */
  onWeek?: boolean;
  /** "+" is tapped; left out, there is no button (the dish is on the week, or the add is on its way). */
  onAdd?: () => void;
  disabled?: boolean;
  /** The accessible name of "+": "Lägg Tacos på veckan". */
  addLabel?: string;
  /** Instead of "+": e.g. the tap that opens a preview. */
  children?: ReactNode;
  testId?: string;
};

export function PlanRow({ title, imageUrl, meta, deal, onWeek = false, onAdd, disabled = false, addLabel, children, testId = "plan-option" }: PlanRowProps) {
  return (
    <li data-testid={testId} className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2.5">
      <RecipeImage src={imageUrl} iconSize={20} className="size-11 shrink-0 rounded-[10px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="line-clamp-2 wrap-break-word text-row-title text-ink">{title}</p>
        {meta ? <p className="text-meta text-ink-2">{meta}</p> : null}
        {deal ? (
          <p data-testid="plan-option-deal" className="text-meta font-semibold text-deal-ink">
            {deal}
          </p>
        ) : null}
      </div>
      {onWeek ? (
        <span data-testid="on-week" className="shrink-0 text-badge font-semibold text-mint-ink">
          På veckan
        </span>
      ) : children ? (
        children
      ) : onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled}
          aria-label={addLabel ?? `Lägg ${title} på veckan`}
          className="flex size-tap shrink-0 items-center justify-center rounded-full bg-mint text-mint-ink disabled:opacity-60"
        >
          <PlusIcon size={20} />
        </button>
      ) : null}
    </li>
  );
}
