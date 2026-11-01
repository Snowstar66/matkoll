import { useId } from "react";
import { cx } from "./cx";

/**
 * The one map from category to icon (Epic 11, AD-12, AD-17): an emoji beside
 * the name, with no tile behind it since ikoner.html (variant B). It is
 * decoration; the category's name always stands beside it.
 *
 * The keys are the nine names of `CATEGORIES` in `@/features/catalog`, in the
 * same order. Shared components never import a feature module (AD-1), so
 * `tests/design/category-icons.test.ts` holds the two lists together.
 *
 * Frys and Övrigt are written as escapes because their emoji end in the
 * invisible variation selector U+FE0F, which source never holds literally.
 */
export const categoryIcons = {
  "Frukt & grönt": { icon: "🥦" },
  Bröd: { icon: "🍞" },
  "Mejeri & ägg": { icon: "🥛" },
  "Kött, fisk & chark": { icon: "🥩" },
  Frys: { icon: "\u2744\uFE0F" },
  Skafferi: { icon: "🥫" },
  "Såser & smaksättare": { icon: "🧂" },
  Dryck: { icon: "🥤" },
  Övrigt: { icon: "\u{1F6CD}\uFE0F" },
} as const satisfies Record<string, { icon: string }>;

/** A display category: the same names as `Category` in `@/features/catalog`. */
export type CategoryName = keyof typeof categoryIcons;

/** A count that can be shown: a whole number, at least 0; anything else is 0. */
function itemCount(count: number): number {
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

/** "1 vara", "3 varor": how many items a category has, in words. */
function itemCountText(count: number): string {
  return `${count} ${count === 1 ? "vara" : "varor"}`;
}

export type CategoryHeaderProps = {
  /** From `displayCategory` in `@/features/catalog`. An unknown name gets Övrigt's icon. */
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
 * Kategorirubrik (DESIGN.md, category-header; UX-DR23; ikoner.html B): the
 * category's emoji (20 px, no tile), its name as a heading (`h2` by default)
 * in section-label type and the count to the right, both in ink-2 straight on
 * the page background. The emoji is centred on the row, which puts it on the
 * centre of the capitals. Screen readers skip the emoji and hear "Mejeri &
 * ägg, heading level 2", then "3 varor". The count is also the heading's
 * description, so it is heard when moving by headings. The emoji has a fixed
 * size in px, so the row holds at 200 % text; a long name wraps instead.
 */
export function CategoryHeader({ category, count, id, level = 2, className }: CategoryHeaderProps) {
  const countId = useId();
  const { icon } = (categoryIcons as Record<string, { icon: string }>)[category] ?? categoryIcons["Övrigt"];
  const shown = itemCount(count);
  const Heading = `h${level}` as const;
  return (
    // min-h-7.5 (30 px): the row keeps the height it had with the tile, so the lists below do not move.
    <div className={cx("flex min-h-7.5 items-center gap-2 px-1", className)}>
      <span
        aria-hidden="true"
        data-testid="category-icon"
        className="w-6 shrink-0 text-center text-category-icon leading-none select-none"
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
