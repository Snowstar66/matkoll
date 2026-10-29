"use client";

import { useId } from "react";
import { CategoryHeader } from "@/components/category-header";
import { Badge } from "@/components/badges";
import { CheckCircle } from "@/components/check-circle";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import type { Category } from "@/features/catalog";
import { bestSavingFirst, groupOffers, type StoreOffer } from "../domain/offer";
import { offerDetailText, offerDisplay, offerSpokenName } from "../domain/offer-display";
import { topDealPercent } from "../domain/offer-saving";
import { cx } from "@/components/cx";
import type { StoreBadgeInfo } from "../domain/store-badge";

export type OffersListProps = {
  offers: readonly StoreOffer[];
  /** The week the offers are for; an offer that does not end with it shows its last day. */
  weekStart: string;
  /** "category" (default): under their categories; "saving": one list, best saving first, unknown last. */
  sort?: "category" | "saving";
  /** Story 9.12: with it each row has a checkbox; without it the list is only shown. */
  selection?: OfferSelection;
  /** Story 9.13: the badge of each store id; given when the offers come from several stores, so each row says which. */
  badges?: ReadonlyMap<string, StoreBadgeInfo>;
};

/** The offers Pontus has ticked, and those already on the shopping list (shown "På listan", never ticked). */
export type OfferSelection = {
  picked: ReadonlySet<string>;
  onList: ReadonlySet<string>;
  onToggle: (offerId: string, picked: boolean) => void;
  disabled?: boolean;
  /** Story 14.1: the checkboxes show only while Pontus is choosing ("Välj"); default true. */
  selecting?: boolean;
};

/** "Toppklipp" from 30 %: the stronger tag. */
const topTag = "bg-hot text-hot-ink";
const tagBase = "inline-flex min-h-6 items-center rounded-full px-2 text-meta font-semibold whitespace-nowrap";

/**
 * One offer as a product row (Story 9.12): the cleaned name, under it the
 * country and brand small (and Stammis, conditions, last day), on the right
 * the price in a tag, the regular price struck through under it and the
 * saving ("−20 %", "Toppklipp −33 %" from 30 %). The checkbox is named like
 * "Aubergine, 12 kr per st, spara 20 %".
 */
const badgeTones = { ica: "bg-store-ica text-store-ica-ink", other: "bg-store-other text-store-other-ink" } as const;

/** The store's short name in its chain's colour ("Maxi", "Krokom"); the name is text, so colour never carries it alone. */
function StoreBadge({ badge }: { badge: StoreBadgeInfo }) {
  return (
    <span
      data-testid="store-badge"
      className={cx("mr-1.5 inline-flex items-center rounded-sm px-2 py-0.5 align-middle text-badge", badgeTones[badge.tone])}
    >
      {badge.text}
    </span>
  );
}

function OfferRow({
  offer,
  weekStart,
  selection,
  badge,
}: {
  offer: StoreOffer;
  weekStart: string;
  selection?: OfferSelection;
  badge?: StoreBadgeInfo;
}) {
  const top = offer.savingPercent !== null && offer.savingPercent >= topDealPercent;
  const listed = selection?.onList.has(offer.id) ?? false;
  const spoken = badge ? `${offerSpokenName(offer)}, ${badge.text}` : offerSpokenName(offer);
  const trailing = (
    <span className="flex max-w-36 flex-col items-end gap-1 text-right">
      {offer.price ? (
        <span data-testid="offer-price" className="rounded-md bg-mint px-3 py-1 text-lg leading-tight font-extrabold text-mint-ink">
          {offer.price}
        </span>
      ) : null}
      {offer.regularPrice !== null ? (
        <s data-testid="offer-regular-price" className="text-meta text-ink-3">
          {regularPriceAmount(offer.regularPrice)}
        </s>
      ) : null}
      {offer.savingPercent !== null ? (
        <span className="inline-flex items-center gap-1">
          {top ? <span aria-hidden="true">{"\u{1F525}"}</span> : null}
          <span className={cx(tagBase, top ? topTag : "bg-deal text-deal-ink")}>
            {top ? "Toppklipp " : null}
            {`\u2212${offer.savingPercent} %`}
          </span>
        </span>
      ) : null}
      {listed ? <Badge tone="neutral">På listan</Badge> : null}
    </span>
  );
  return (
    <ListRow
      title={offerDisplay(offer.label).title}
      meta={
        badge ? (
          <>
            <StoreBadge badge={badge} />
            {offerDetailText(offer, weekStart)}
          </>
        ) : (
          offerDetailText(offer, weekStart) || undefined
        )
      }
      leading={
        selection && selection.selecting !== false ? (
          <CheckCircle
            label={spoken}
            checked={!listed && selection.picked.has(offer.id)}
            disabled={listed || selection.disabled}
            onCheckedChange={(checked) => selection.onToggle(offer.id, checked)}
          />
        ) : undefined
      }
      trailing={trailing}
      data-testid="offer-row"
    />
  );
}

/** 111.9 → "111,90 kr"; a whole price has no decimals. */
function regularPriceAmount(price: number): string {
  return `${Number.isInteger(price) ? price : price.toFixed(2).replace(".", ",")} kr`;
}

function OffersGroup({
  category,
  offers,
  weekStart,
  selection,
  badges,
}: {
  category: Category;
  offers: readonly StoreOffer[];
  weekStart: string;
  selection?: OfferSelection;
  badges?: ReadonlyMap<string, StoreBadgeInfo>;
}) {
  const headingId = useId();
  return (
    <div className="flex flex-col gap-2">
      {/* Under the sheet's title (h2), so the categories are h3. */}
      <CategoryHeader id={headingId} category={category} count={offers.length} level={3} />
      <ListGroup labelledBy={headingId}>
        {offers.map((offer) => (
          <OfferRow key={offer.id} offer={offer} weekStart={weekStart} selection={selection} badge={badges?.get(offer.storeId)} />
        ))}
      </ListGroup>
    </div>
  );
}

/**
 * Veckans erbjudanden under their categories, as in Lagersaldo (Story 9.1,
 * FR-35): a Kategorirubrik and a Listgrupp per category, and a Listrad per
 * offer with the item as the store wrote it and, under it, the price and
 * conditions ("89 kr/kg · Stammis · Max 1 köp/hushåll · t.o.m. 22 nov").
 * Story 9.11: with a regular price or a saving the line also says "Ord. 111,90
 * kr · spara 20 %" (nothing when unknown), and 30 % or more has a "Toppklipp"
 * badge. `sort="saving"` lists them best saving first. Story 9.12: with `selection` each row has a checkbox named by the offer, and
 * "På listan" replaces the tick for an offer already on the shopping list.
 */
export function OffersList({ offers, weekStart, sort = "category", selection, badges }: OffersListProps) {
  if (sort === "saving") {
    return (
      <div data-testid="offers-list" className="flex flex-col gap-2">
        <h3 className="sr-only">Bäst rabatt först</h3>
        <ListGroup label="Bäst rabatt först">
          {bestSavingFirst(offers).map((offer) => (
            <OfferRow key={offer.id} offer={offer} weekStart={weekStart} selection={selection} badge={badges?.get(offer.storeId)} />
          ))}
        </ListGroup>
      </div>
    );
  }
  return (
    <div data-testid="offers-list" className="flex flex-col gap-4">
      {groupOffers(offers).map(({ category, offers: items }) => (
        <OffersGroup key={category} category={category} offers={items} weekStart={weekStart} selection={selection} badges={badges} />
      ))}
    </div>
  );
}
