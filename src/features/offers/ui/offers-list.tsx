"use client";

import { useId } from "react";
import { CategoryHeader } from "@/components/category-header";
import { Badge } from "@/components/badges";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import type { Category } from "@/features/catalog";
import { bestSavingFirst, groupOffers, offerMetaText, type StoreOffer } from "../domain/offer";
import { topDealPercent } from "../domain/offer-saving";

export type OffersListProps = {
  offers: readonly StoreOffer[];
  /** The week the offers are for; an offer that does not end with it shows its last day. */
  weekStart: string;
  /** "category" (default): under their categories; "saving": one list, best saving first, unknown last. */
  sort?: "category" | "saving";
};

/** One offer: the item, under it the price, the saving and the conditions, and "Toppklipp" from 30 %. */
function OfferRow({ offer, weekStart }: { offer: StoreOffer; weekStart: string }) {
  const top = offer.savingPercent !== null && offer.savingPercent >= topDealPercent;
  return (
    <ListRow
      title={offer.label}
      meta={offerMetaText(offer, weekStart)}
      trailing={top ? <Badge tone="mint">Toppklipp</Badge> : undefined}
      data-testid="offer-row"
    />
  );
}

function OffersGroup({ category, offers, weekStart }: { category: Category; offers: readonly StoreOffer[]; weekStart: string }) {
  const headingId = useId();
  return (
    <div className="flex flex-col gap-2">
      {/* Under the sheet's title (h2), so the categories are h3. */}
      <CategoryHeader id={headingId} category={category} count={offers.length} level={3} />
      <ListGroup labelledBy={headingId}>
        {offers.map((offer) => (
          <OfferRow key={offer.id} offer={offer} weekStart={weekStart} />
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
 * badge. `sort="saving"` lists them best saving first. Only shown; nothing here is pressed (removing comes in 9.9).
 */
export function OffersList({ offers, weekStart, sort = "category" }: OffersListProps) {
  if (sort === "saving") {
    return (
      <div data-testid="offers-list" className="flex flex-col gap-2">
        <h3 className="sr-only">Bäst rabatt först</h3>
        <ListGroup label="Bäst rabatt först">
          {bestSavingFirst(offers).map((offer) => (
            <OfferRow key={offer.id} offer={offer} weekStart={weekStart} />
          ))}
        </ListGroup>
      </div>
    );
  }
  return (
    <div data-testid="offers-list" className="flex flex-col gap-4">
      {groupOffers(offers).map(({ category, offers: items }) => (
        <OffersGroup key={category} category={category} offers={items} weekStart={weekStart} />
      ))}
    </div>
  );
}
