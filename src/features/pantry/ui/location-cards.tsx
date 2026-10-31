import Link from "next/link";
import { cx } from "@/components/cx";
import { LOCATIONS, type Location } from "@/features/catalog";
import { itemCountText, placeSlug } from "../domain/places";

// The emoji on its tile, as the menu's (Story 14.4) and the category tiles (Story 14.6). Frys' emoji ends in U+FE0F, written as an escape.
const looks: Record<Location, { icon: string; tile: string }> = {
  Kyl: { icon: "\u{1F9CA}", tile: "bg-mint" },
  Frys: { icon: "\u2744\uFE0F", tile: "bg-sky" },
  Skafferi: { icon: "\u{1F96B}", tile: "bg-sand" },
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
 * Platskort (DESIGN.md, location-card; Story 14.6): Kyl, Frys and Skafferi as
 * three compact tiles in a row (at least 48 px high, 14 px round, surface),
 * each with its emoji on a tile, the name and "12 varor". A tile is a link to
 * `/hemma?plats=…`, so the choice is in the address; it replaces the history
 * entry and keeps the scroll position. A tile of a location with suggestions
 * from a photo that are not closed says "Förslag klara" (Story 12.5). The
 * chosen tile has the accent border and the mint background, and `aria-current`, never only its border.
 */
export function LocationCards({ selected, counts, ready = [] }: LocationCardsProps) {
  return (
    <nav aria-label="Platser">
      <ul className="grid grid-cols-3 gap-2">
        {LOCATIONS.map((location) => {
          const { icon, tile } = looks[location];
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
                  "flex min-h-12 items-center gap-2 rounded-md border-[1.5px] px-2 py-2",
                  isSelected ? "border-accent bg-mint" : "border-transparent bg-surface",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    "flex size-7 shrink-0 items-center justify-center rounded-sm text-base leading-none select-none",
                    isSelected ? "bg-surface" : tile,
                  )}
                >
                  {icon}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-meta leading-tight font-semibold text-ink">{location}</span>{" "}
                  <span className={cx("text-badge", isSelected ? "text-mint-ink" : "font-normal text-ink-3")}>
                    {itemCountText(counts[location])}
                  </span>
                  {ready.includes(location) ? <span className="text-badge text-ink-2">Förslag klara</span> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
