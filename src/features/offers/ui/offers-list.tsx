"use client";

import { Fragment, useId } from "react";
import { CategoryHeader } from "@/components/category-header";
import { Badge } from "@/components/badges";
import { Checkbox } from "@/components/checkbox";
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
  /** Story 16.6: show the store label on each row (default true); the store stays in the checkbox's name either way. */
  showStore?: boolean;
  /** Story 16.7: the ids of the offers that fit what Pontus cooks or has at home; their rows say "Passar dig". */
  fits?: ReadonlySet<string>;
};

/** The offers Pontus has ticked, and those already on the shopping list (shown "På listan", never ticked). */
export type OfferSelection = {
  picked: ReadonlySet<string>;
  onList: ReadonlySet<string>;
  onToggle: (offerId: string, picked: boolean) => void;
  disabled?: boolean;
};

/**
 * One offer as a product row (Story 9.12, calmed in Story 16.6): the cleaned
 * name; under it a small line with "🔥 Toppklipp" (from 30 %, a soft tinted
 * label), the store ("● Maxi", only when the list shows several stores), the
 * country and brand, Stammis, conditions and last day; on the right the price
 * in bold ink and, under it, the regular price struck through and the saving
 * ("29,90 kr −50 %", the percent in text only). Two lines at most, so the row
 * is as tall as any list row. The checkbox is named like "Aubergine, 12 kr per
 * st, spara 20 %".
 */
const dotTones = { ica: "bg-store-ica", other: "bg-store-other" } as const;

/** The store's short name in muted ink with a small dot in its chain's colour; the name is text, so colour never carries it alone. */
export function StoreLabel({ badge, testId = "store-badge" }: { badge: StoreBadgeInfo; testId?: string }) {
  return (
    <span data-testid={testId} className="inline-flex items-center gap-1.5 align-middle">
      <span aria-hidden="true" className={cx("size-2 shrink-0 rounded-full", dotTones[badge.tone])} />
      {badge.text}
    </span>
  );
}

function OfferRow({
  offer,
  weekStart,
  selection,
  badge,
  showStore,
  fit,
}: {
  offer: StoreOffer;
  weekStart: string;
  selection?: OfferSelection;
  badge?: StoreBadgeInfo;
  showStore: boolean;
  fit: boolean;
}) {
  const top = offer.savingPercent !== null && offer.savingPercent >= topDealPercent;
  const listed = selection?.onList.has(offer.id) ?? false;
  const spoken = [offerSpokenName(offer), badge?.text, fit ? "passar dig" : null].filter(Boolean).join(", ");
  const trailing =
    offer.price || offer.regularPrice !== null || offer.savingPercent !== null ? (
      <span className="flex max-w-36 flex-col items-end gap-0.5 text-right">
        {offer.price ? (
          <span data-testid="offer-price" className="text-lg leading-6 font-bold text-ink">
            {offer.price}
          </span>
        ) : null}
        {offer.regularPrice !== null || offer.savingPercent !== null ? (
          <span className="flex items-baseline gap-2 text-meta text-ink-3">
            {offer.regularPrice !== null ? <s data-testid="offer-regular-price">{regularPriceAmount(offer.regularPrice)}</s> : null}
            {offer.savingPercent !== null ? (
              <span data-testid="offer-saving" className="font-semibold text-deal-ink">{`\u2212${offer.savingPercent} %`}</span>
            ) : null}
          </span>
        ) : null}
      </span>
    ) : undefined;
  const details = offerDetailText(offer, weekStart);
  const label = showStore ? badge : undefined;
  const hasMeta = top || listed || label || fit || details;
  const parts = [
    label ? <StoreLabel key="store" badge={label} /> : null,
    fit ? (
      <span key="fit" data-testid="offer-fit" className="text-ink-3">
        Passar dig
      </span>
    ) : null,
    details || null,
  ].filter(Boolean);
  return (
    <ListRow
      title={offerDisplay(offer.label).title}
      meta={
        hasMeta ? (
          <>
            {top ? (
              <span
                data-testid="offer-top-tag"
                className="mr-1.5 inline-flex items-center gap-1 rounded-full bg-hot/12 px-2 align-middle font-semibold text-hot"
              >
                <span aria-hidden="true">{"\u{1F525}"}</span>
                Toppklipp
              </span>
            ) : null}
            {listed ? <Badge tone="neutral" className="mr-1.5 align-middle">På listan</Badge> : null}
            {parts.map((part, index) => (
              <Fragment key={index}>
                {index > 0 ? " \u00B7 " : null}
                {part}
              </Fragment>
            ))}
          </>
        ) : undefined
      }
      leading={
        selection ? (
          <Checkbox
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
  showStore,
  fits,
}: {
  category: Category;
  offers: readonly StoreOffer[];
  weekStart: string;
  selection?: OfferSelection;
  badges?: ReadonlyMap<string, StoreBadgeInfo>;
  showStore: boolean;
  fits?: ReadonlySet<string>;
}) {
  const headingId = useId();
  return (
    <div className="flex flex-col gap-2">
      {/* Under the sheet's title (h2), so the categories are h3. */}
      <CategoryHeader id={headingId} category={category} count={offers.length} level={3} />
      <ListGroup labelledBy={headingId}>
        {offers.map((offer) => (
          <OfferRow key={offer.id} offer={offer} weekStart={weekStart} selection={selection} badge={badges?.get(offer.storeId)} showStore={showStore} fit={fits?.has(offer.id) ?? false} />
        ))}
      </ListGroup>
    </div>
  );
}

/**
 * Veckans erbjudanden under their categories, as in Förråd (Story 9.1,
 * FR-35): a Kategorirubrik and a Listgrupp per category, and a Listrad per
 * offer with the item as the store wrote it and, under it, the price and
 * conditions ("89 kr/kg · Stammis · Max 1 köp/hushåll · t.o.m. 22 nov").
 * Story 9.11: with a regular price or a saving the line also says "Ord. 111,90
 * kr · spara 20 %" (nothing when unknown), and 30 % or more has a "Toppklipp"
 * badge. `sort="saving"` lists them best saving first. Story 9.12: with `selection` each row has a checkbox named by the offer, and
 * "På listan" replaces the tick for an offer already on the shopping list.
 */
export function OffersList({ offers, weekStart, sort = "category", selection, badges, showStore = true, fits }: OffersListProps) {
  if (sort === "saving") {
    return (
      <div data-testid="offers-list" className="flex flex-col gap-2">
        <h3 className="sr-only">Bäst rabatt först</h3>
        <ListGroup label="Bäst rabatt först">
          {bestSavingFirst(offers).map((offer) => (
            <OfferRow key={offer.id} offer={offer} weekStart={weekStart} selection={selection} badge={badges?.get(offer.storeId)} showStore={showStore} fit={fits?.has(offer.id) ?? false} />
          ))}
        </ListGroup>
      </div>
    );
  }
  return (
    <div data-testid="offers-list" className="flex flex-col gap-4">
      {groupOffers(offers).map(({ category, offers: items }) => (
        <OffersGroup key={category} category={category} offers={items} weekStart={weekStart} selection={selection} badges={badges} showStore={showStore} fits={fits} />
      ))}
    </div>
  );
}
