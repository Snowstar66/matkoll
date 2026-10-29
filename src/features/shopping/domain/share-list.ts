import { formatQuantity } from "@/features/catalog";
import type { ShoppingLine } from "./compute-list";
import { groupByCategory } from "./list-text";

// "Dela listan" (Story 14.2): the list as plain text per department, for a
// message or a note. Not the store's export format. Pure: no I/O.

/**
 * The lines not checked off, per department ("Frukt & grönt"), one
 * "- Gul lök 1 st" per line (a vague line is just its name), a blank line
 * between departments. Hidden lines are not among `lines`. An empty list
 * gives "".
 */
export function shareListText(lines: readonly ShoppingLine[]): string {
  const open = lines.filter((line) => !line.checked);
  return groupByCategory(open)
    .map(({ category, lines: group }) => {
      const items = group.map((line) => {
        const quantity = formatQuantity(line.amount, line.unit);
        return quantity ? `- ${line.label} ${quantity}` : `- ${line.label}`;
      });
      return [category, ...items].join("\n");
    })
    .join("\n\n");
}
