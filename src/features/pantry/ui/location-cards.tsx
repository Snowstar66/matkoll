import Link from "next/link";
import type { ComponentType } from "react";
import { cx } from "@/components/cx";
import { FreezerIcon, FridgeIcon, PantryIcon, type IconProps } from "@/components/icons";
import { LOCATIONS, type Location } from "@/features/catalog";
import { itemCountText, placeSlug } from "../domain/places";

const looks: Record<Location, { Icon: ComponentType<IconProps>; tone: string }> = {
  Kyl: { Icon: FridgeIcon, tone: "bg-mint text-mint-ink" },
  Frys: { Icon: FreezerIcon, tone: "bg-sky text-sky-ink" },
  Skafferi: { Icon: PantryIcon, tone: "bg-sand text-sand-ink" },
};

export type LocationCardsProps = {
  /** The chosen location; its card has the 2 px accent border. */
  selected: Location;
  /** The number of items in each location. */
  counts: Record<Location, number>;
  /** Story 12.5: the locations with suggestions from a photo that are not closed: "Förslag klara" on their cards. */
  ready?: readonly Location[];
};

/**
 * Platskort (DESIGN.md, location-card): Kyl, Frys and Skafferi in a row, each
 * with icon, name and "12 varor". A card is a link to `/hemma?plats=…`, so the
 * choice is in the address; it replaces the history entry and keeps the
 * scroll position. A card of a location with suggestions from a photo that
 * are not closed says "Förslag klara" (Story 12.5). The chosen card has `aria-current`, never only its border.
 */
export function LocationCards({ selected, counts, ready = [] }: LocationCardsProps) {
  return (
    <nav aria-label="Platser">
      <ul className="grid grid-cols-3 gap-3">
        {LOCATIONS.map((location) => {
          const { Icon, tone } = looks[location];
          const isSelected = location === selected;
          return (
            <li key={location}>
              <Link
                href={`/hemma?plats=${placeSlug(location)}`}
                replace
                scroll={false}
                aria-current={isSelected ? "true" : undefined}
                data-testid="location-card"
                className={cx(
                  "flex min-h-[100px] flex-col justify-between gap-2 rounded-lg border-2 p-3",
                  tone,
                  isSelected ? "border-accent" : "border-transparent",
                )}
              >
                <Icon size={24} />
                <span className="flex flex-col">
                  <span className="text-row-title">{location}</span>{" "}
                  <span className="text-meta">{itemCountText(counts[location])}</span>
                  {ready.includes(location) ? <span className="text-meta font-medium">Förslag klara</span> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
