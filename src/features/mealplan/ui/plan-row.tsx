import type { ReactNode } from "react";
import { PlusIcon } from "@/components/icons";
import { OfferTags } from "@/components/offer-tag";
import { FitRow } from "@/components/fit-row";
import type { PreferenceNote } from "@/components/preference-notes";
import { RecipeImage } from "@/components/recipe-image";
import type { OfferTagData } from "@/lib/offer-tag";
import type { DishKind } from "@/lib/dish-kind";

// A compact row of "Lägg till rätter" (Story 25.3): a 44 px picture (the
// recipe's own photo, else a drawing of the dish, UX-13b), the title, a line
// with what is known about the dish, the offer line, and "+" or its day.

export type PlanRowProps = {
  title: string;
  /** The recipe's own photo, or `null` for a drawing of the dish. */
  imageUrl: string | null;
  /** UX-13b: the kind of dish drawn without a photo; from the title when left out. */
  dish?: DishKind;
  /** "Favorit · lagad 6 gånger". */
  meta: string;
  /** A short thought under the title, e.g. why an AI idea is a good one. */
  note?: string | null;
  /** UX-20: the offers the dish uses, as OfferTags on a line of their own ("Gul lök 10 kr/kg", at most two, then "+N"). */
  tags?: readonly OfferTagData[];
  /** Hushållets preferenser: "Anna undviker koriander" and the like (PreferenceNotes), at most two lines; nothing for none. */
  fit?: readonly PreferenceNote[];
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
  /** A tap on the card (not on "+", the preference dots or the offer chips' links) opens the preview of the dish. */
  onOpen?: () => void;
  /** The accessible name of that tap: "Visa mer om Tacos". */
  openLabel?: string;
  /** "Hur ofta på menyn": the quiet chip "Inte på menyn 9 veckor" or "Aldrig planerad"; none for none. */
  chip?: string | null;
};

export function PlanRow({ title, imageUrl, dish, meta, note, tags, fit, onWeekLabel, onAdd, disabled = false, addLabel, children, testId = "plan-option", onOpen, openLabel, chip }: PlanRowProps) {
  return (
    <li data-testid={testId} className="relative flex items-center gap-3 rounded-lg bg-surface px-3 py-2.5">
      {/* The card is one tap target, laid over it; "+" and the preference dots sit above it (z-10), so they keep their own taps. */}
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={openLabel ?? `Visa mer om ${title}`}
          data-testid="plan-option-open"
          className="absolute inset-y-0 right-14 left-0 rounded-lg outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        />
      ) : null}
      <RecipeImage src={imageUrl} dish={dish} title={title} artSize={36} className="size-11 shrink-0 rounded-[10px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="line-clamp-2 wrap-break-word text-row-title text-ink">{title}</p>
        {meta ? <p className="text-meta text-ink-2">{meta}</p> : null}
        {note ? (
          <p data-testid="plan-option-note" className="text-meta text-ink-3">
            {note}
          </p>
        ) : null}
        <div className="relative z-10 self-start empty:hidden">
          <FitRow notes={fit} maxNotes={2} />
        </div>
        {tags && tags.length > 0 ? <OfferTags tags={tags} className="mt-0.5" /> : null}
        {chip ? (
          <span data-testid="menu-chip" className="mt-0.5 inline-flex max-w-full self-start rounded-full bg-fill px-2 py-0.5 text-badge text-ink-2">
            {chip}
          </span>
        ) : null}
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
          className="relative z-10 flex size-tap shrink-0 items-center justify-center rounded-full bg-mint text-mint-ink disabled:opacity-60"
        >
          <PlusIcon size={20} />
        </button>
      ) : null}
    </li>
  );
}
