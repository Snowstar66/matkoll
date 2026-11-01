import Link from "next/link";
import { cx } from "@/components/cx";
import { LOCATIONS, type Location } from "@/features/catalog";
import { itemCountText, placeSlug } from "../domain/places";

export type LocationCardsProps = {
  /** The chosen location; its card is the Segment plate. */
  selected: Location;
  /** The number of items in each location. */
  counts: Record<Location, number>;
  /** Story 12.5: the locations with suggestions from a photo that are not closed: "Förslag klara" on their cards. */
  ready?: readonly Location[];
};

/**
 * Platskort (DESIGN.md, location-card; Story 14.6): Kyl, Frys and Skafferi as
 * three compact tiles in a row (a Segment rail, 46 px high), each with the name and "12 varor". A tile is a link to
 * `/hemma?plats=…`, so the choice is in the address; it replaces the history
 * entry and keeps the scroll position. A tile of a location with suggestions
 * from a photo that are not closed says "Förslag klara" (Story 12.5). The
 * chosen tile is the Segment plate (Story 19.3) and has `aria-current`, never only its look.
 */
export function LocationCards({ selected, counts, ready = [] }: LocationCardsProps) {
  return (
    <nav aria-label="Platser">
      <ul className="grid grid-cols-3 gap-0.5 rounded-md bg-seg-track p-[3px]">
        {LOCATIONS.map((location) => {
          const isSelected = location === selected;
          return (
            <li key={location} className="flex">
              <Link
                href={`/hemma?plats=${placeSlug(location)}`}
                replace
                scroll={false}
                aria-current={isSelected ? "true" : undefined}
                data-testid="location-card"
                className={cx(
                  "relative flex min-h-[46px] min-w-0 flex-1 flex-col items-center justify-center rounded-[9px] border px-1 py-1 text-center before:absolute before:inset-x-0 before:-inset-y-px before:content-['']",
                  isSelected ? "border-border bg-seg-on" : "border-transparent",
                )}
              >
                <span className={cx("text-control leading-tight", isSelected ? "font-semibold text-ink" : "font-medium text-ink-2")}>{location}</span>{" "}
                <span className={cx("text-badge", isSelected ? "text-mint-ink" : "text-ink-3")}>{itemCountText(counts[location])}</span>
                {ready.includes(location) ? <span className="text-badge text-ink-2">Förslag klara</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
