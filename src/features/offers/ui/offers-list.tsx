"use client";

import { useId } from "react";
import { CategoryHeader } from "@/components/category-header";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import type { Category } from "@/features/catalog";
import { groupOffers, offerMetaText, type StoreOffer } from "../domain/offer";

export type OffersListProps = {
  offers: readonly StoreOffer[];
  /** The week the offers are for; an offer that does not end with it shows its last day. */
  weekStart: string;
};

function OffersGroup({ category, offers, weekStart }: { category: Category; offers: readonly StoreOffer[]; weekStart: string }) {
  const headingId = useId();
  return (
    <div className="flex flex-col gap-2">
      {/* Under the sheet's title (h2), so the categories are h3. */}
      <CategoryHeader id={headingId} category={category} count={offers.length} level={3} />
      <ListGroup labelledBy={headingId}>
        {offers.map((offer) => (
          <ListRow key={offer.id} title={offer.label} meta={offerMetaText(offer, weekStart)} data-testid="offer-row" />
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
 * Only shown; nothing here is pressed (removing comes in 9.9).
 */
export function OffersList({ offers, weekStart }: OffersListProps) {
  return (
    <div data-testid="offers-list" className="flex flex-col gap-4">
      {groupOffers(offers).map(({ category, offers: items }) => (
        <OffersGroup key={category} category={category} offers={items} weekStart={weekStart} />
      ))}
    </div>
  );
}
