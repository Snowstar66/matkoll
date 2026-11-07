import { TagIcon } from "@/components/icons";
import { cx } from "@/components/cx";
import { offerTagText, type OfferTagData } from "@/lib/offer-tag";

/**
 * OfferTag (UX-20): the one way an offer is shown outside the offers sheet's
 * own rows. A mint label with a price tag and what is on offer, "Gul lök
 * 10 kr/kg"; `priceOnly` shows just the price, where the item's name stands
 * beside it (Inköpslista).
 */
export function OfferTag({ tag, priceOnly = false, className }: { tag: OfferTagData; priceOnly?: boolean; className?: string }) {
  return (
    <span data-testid="offer-tag" className={cx("inline-flex max-w-full min-w-0 items-center gap-1 rounded-full bg-mint px-2 py-0.5 align-middle text-badge text-mint-ink", className)}>
      <TagIcon size={12} className="shrink-0" />
      <span className="truncate">{offerTagText(tag, priceOnly)}</span>
    </span>
  );
}

/**
 * A row of OfferTags: at most `max` (two in lists, one on the narrow cards of
 * the recipe grid, where the shortest one is kept so its price is never cut),
 * then "+N" in the same style. Nothing when there are none.
 */
export function OfferTags({ tags, max = 2, shortest = false, className }: { tags: readonly OfferTagData[]; max?: number; shortest?: boolean; className?: string }) {
  if (tags.length === 0) return null;
  const ordered = shortest ? [...tags].sort((a, b) => offerTagText(a).length - offerTagText(b).length) : tags;
  const shown = ordered.slice(0, max);
  const more = tags.length - shown.length;
  return (
    <span data-testid="offer-tags" className={cx("flex min-w-0 flex-wrap items-center gap-1", className)}>
      {shown.map((tag) => (
        <OfferTag key={offerTagText(tag)} tag={tag} />
      ))}
      {more > 0 ? (
        <span data-testid="offer-tags-more" className="inline-flex items-center rounded-full bg-mint px-2 py-0.5 text-badge text-mint-ink">
          {`+${more}`}
        </span>
      ) : null}
    </span>
  );
}
