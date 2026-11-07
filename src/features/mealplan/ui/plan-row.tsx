import type { ReactNode } from "react";
import { PlusIcon } from "@/components/icons";
import { OfferTags } from "@/components/offer-tag";
import { RecipeImage } from "@/components/recipe-image";
import type { OfferTagData } from "@/lib/offer-tag";

// A compact row of "Lägg till rätter" (Story 25.3): a 44 px picture (the
// recipe's own photo, else the quiet tile, never an emoji), the title, a line
// with what is known about the dish, the offer line, and "+" or its day.

export type PlanRowProps = {
  title: string;
  /** The recipe's own photo, or `null` for the quiet tile. */
  imageUrl: string | null;
  /** "Favorit · lagad 6 gånger". */
  meta: string;
  /** A short thought under the title, e.g. why an AI idea is a good one. */
  note?: string | null;
  /** UX-20: the offers the dish uses, as OfferTags on a line of their own ("Gul lök 10 kr/kg", at most two, then "+N"). */
  tags?: readonly OfferTagData[];
  /** The dish is already on the week: its day ("Tor"), or "På veckan", in place of "+". */
  onWeekLabel?: string;
  /** "+" is tapped; left out, there is no button (the dish is on the week, or the add is on its way). */
  onAdd?: () => void;
  disabled?: boolean;
  /** The accessible name of "+": "Lägg Tacos på veckan". */
  addLabel?: string;
  /** Instead of "+": e.g. the tap that opens a preview. */
  children?: ReactNode;
  testId?: string;
};

export function PlanRow({ title, imageUrl, meta, note, tags, onWeekLabel, onAdd, disabled = false, addLabel, children, testId = "plan-option" }: PlanRowProps) {
  return (
    <li data-testid={testId} className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2.5">
      <RecipeImage src={imageUrl} title={title} iconSize={26} className="size-11 shrink-0 rounded-[10px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="line-clamp-2 wrap-break-word text-row-title text-ink">{title}</p>
        {meta ? <p className="text-meta text-ink-2">{meta}</p> : null}
        {note ? (
          <p data-testid="plan-option-note" className="text-meta text-ink-3">
            {note}
          </p>
        ) : null}
        {tags && tags.length > 0 ? <OfferTags tags={tags} className="mt-0.5" /> : null}
      </div>
      {onWeekLabel ? (
        <span data-testid="on-week" className="shrink-0 text-badge font-semibold text-mint-ink">
          {onWeekLabel}
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
