import type { ShoppingLine } from "../domain/compute-list";
import type { ProductChoice } from "../domain/product-choice";

/**
 * The product choice shown on a list line (Story 11.4), or `null`: the
 * selected store's choice for the line's catalog ingredient. Without a store,
 * or a line without a catalog ingredient, there is none.
 */
export function chipChoice(
  line: Pick<ShoppingLine, "ingredientId">,
  hasStore: boolean,
  productChoices: Readonly<Record<string, ProductChoice>>,
): ProductChoice | null {
  if (!hasStore || line.ingredientId === undefined) return null;
  return productChoices[line.ingredientId] ?? null;
}

/**
 * Produktetikett (DESIGN.md, product-chip; FR-43): the product choice's name
 * in a light blue chip to the right of a list line, e.g. "Scan Falukorv 800
 * g". At most 40 % of the row (40cqw: the list group is the container), cut
 * with "…" on screen only: the whole name stays in the DOM for screen
 * readers. Plain text, not a control: the choice is changed in the line's
 * detail.
 */
export function ProductChip({ name, id }: { name: string; /** For the check's aria-describedby. */ id?: string }) {
  return (
    <span
      id={id}
      data-testid="product-chip"
      className="block max-w-[40cqw] truncate rounded-sm bg-sky px-2 py-0.5 text-badge text-sky-ink"
    >
      {name}
    </span>
  );
}
