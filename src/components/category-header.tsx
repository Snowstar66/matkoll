import { useId } from "react";
import { cx } from "./cx";

/**
 * The one map from category to icon and tile (Epic 11, AD-12, AD-17): an
 * emoji on a light tile, as in the approved mockups. Both are decoration; the
 * category's name always stands beside them. The map can be swapped for SVG
 * line icons here without any other change (open question 15).
 *
 * The keys are the nine names of `CATEGORIES` in `@/features/catalog`, in the
 * same order. Shared components never import a feature module (AD-1), so
 * `tests/design/category-tiles.test.ts` holds the two lists together.
 *
 * Frys and Övrigt are written as escapes because their emoji end in the
 * invisible variation selector U+FE0F, which source never holds literally.
 */
export const categoryTiles = {
  "Frukt & grönt": { icon: "🥦", tile: "bg-mint" },
  Bröd: { icon: "🍞", tile: "bg-sand" },
  "Mejeri & ägg": { icon: "🥛", tile: "bg-sky" },
  "Kött, fisk & chark": { icon: "🥩", tile: "bg-tile-clay" },
  Frys: { icon: "\u2744\uFE0F", tile: "bg-sky" },
  Skafferi: { icon: "🥫", tile: "bg-sand" },
  "Såser & smaksättare": { icon: "🧂", tile: "bg-sand" },
  Dryck: { icon: "🥤", tile: "bg-tile-lilac" },
  Övrigt: { icon: "\u{1F6CD}\uFE0F", tile: "bg-border" },
} as const satisfies Record<string, { icon: string; tile: string }>;

/** A display category: the same names as `Category` in `@/features/catalog`. */
export type CategoryName = keyof typeof categoryTiles;

/** A count that can be shown: a whole number, at least 0; anything else is 0. */
function itemCount(count: number): number {
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

/** "1 vara", "3 varor": how many items a category has, in words. */
function itemCountText(count: number): string {
  return `${count} ${count === 1 ? "vara" : "varor"}`;
}

export type CategoryHeaderProps = {
  /** From `displayCategory` in `@/features/catalog`. An unknown name gets Övrigt's tile. */
  category: CategoryName;
  /** How many items are under the heading; shown as a number, read as "3 varor". Not a whole number ≥ 0: 0. */
  count: number;
  /** The heading's id, for `aria-labelledby` on the ListGroup below it. */
  id?: string;
  /** The heading level; 2 (default) under the page title, 3 or 4 when the categories sit under another heading. */
  level?: 2 | 3 | 4;
  className?: string;
};

/**
 * Kategorirubrik (DESIGN.md, category-header and category-tile; UX-DR23): the
 * category's tile with its icon, its name as a heading (`h2` by default) in
 * section-label type and the count to the right, both in ink-2 straight on
 * the page background. Screen readers skip the tile and hear "Mejeri & ägg,
 * heading level 2", then "3 varor". The count is also the heading's
 * description, so it is heard when moving by headings. The tile and its
 * emoji have fixed sizes, so the row holds at 200 % text; a long name wraps
 * instead.
 */
export function CategoryHeader({ category, count, id, level = 2, className }: CategoryHeaderProps) {
  const countId = useId();
  const { icon, tile } = (categoryTiles as Record<string, { icon: string; tile: string }>)[category] ?? categoryTiles["Övrigt"];
  const shown = itemCount(count);
  const Heading = `h${level}` as const;
  return (
    <div className={cx("flex items-center gap-3 px-1", className)}>
      <span
        aria-hidden="true"
        data-testid="category-tile"
        className={cx(
          "flex size-tile shrink-0 items-center justify-center rounded-sm text-tile-icon leading-none select-none",
          tile,
        )}
      >
        {icon}
      </span>
      <Heading
        id={id}
        aria-describedby={countId}
        className="min-w-0 flex-1 text-section-label wrap-break-word text-ink-2"
      >
        {category}
      </Heading>
      <span className="shrink-0 text-meta text-ink-2 tabular-nums">
        <span aria-hidden="true">{shown}</span>
        <span id={countId} className="sr-only">
          {itemCountText(shown)}
        </span>
      </span>
    </div>
  );
}
