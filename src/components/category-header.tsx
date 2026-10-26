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

/** "1 vara", "3 varor": how many items a category has, in words. */
function itemCountText(count: number): string {
  return `${count} ${count === 1 ? "vara" : "varor"}`;
}

export type CategoryHeaderProps = {
  /** From `displayCategory` in `@/features/catalog`. */
  category: CategoryName;
  /** How many items are under the heading; shown as a number, read as "3 varor". */
  count: number;
  /** The heading's id, for `aria-labelledby` on the section and the ListGroup below it. */
  id?: string;
  className?: string;
};

/**
 * Kategorirubrik (DESIGN.md, category-header and category-tile; UX-DR23): the
 * category's tile with its icon, its name as an `h2` in section-label type and
 * the count to the right, both in ink-2 straight on the page background.
 * Screen readers skip the tile and hear "Mejeri & ägg, heading level 2", then
 * "3 varor". The tile has a fixed size, so the row holds at 200 % text; a long
 * name wraps instead.
 */
export function CategoryHeader({ category, count, id, className }: CategoryHeaderProps) {
  const { icon, tile } = categoryTiles[category];
  return (
    <div className={cx("flex items-center gap-3 px-1", className)}>
      <span
        aria-hidden="true"
        data-testid="category-tile"
        className={cx(
          "flex size-tile shrink-0 items-center justify-center rounded-sm text-[17px] leading-none select-none",
          tile,
        )}
      >
        {icon}
      </span>
      <h2 id={id} className="min-w-0 flex-1 text-section-label wrap-break-word text-ink-2">
        {category}
      </h2>
      <span className="shrink-0 text-meta text-ink-2 tabular-nums">
        <span aria-hidden="true">{count}</span>
        <span className="sr-only">{itemCountText(count)}</span>
      </span>
    </div>
  );
}
