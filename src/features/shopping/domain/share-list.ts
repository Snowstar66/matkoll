import { categoryTiles } from "@/components/category-header";
import { formatQuantity } from "@/features/catalog";
import type { ShoppingLine } from "./compute-list";
import { groupByCategory } from "./list-text";

// "Dela listan" (Story 14.2, 14.3): the list as plain text per department, for a
// message or a note. Not the store's export format. Pure: no I/O.

/** The week number in a plan's name ("Vecka 44" gives 44), or `null` when it has none. */
export function weekNumberOfPlan(planName: string | undefined): number | null {
  const match = planName?.match(/\d+/);
  return match ? Number(match[0]) : null;
}

/**
 * "🛒 Inköpslista v. 44", a blank line, then the lines not checked off per
 * department ("🥦 FRUKT & GRÖNT", the icon of the category tiles), one
 * "☐ Gul lök 1 st" per line (a vague line is just its name), a blank line
 * between departments. Hidden lines are not among `lines`. Without a week the
 * heading is "🛒 Inköpslista". An empty list gives "".
 */
export function shareListText(lines: readonly ShoppingLine[], week: number | null = null): string {
  const open = lines.filter((line) => !line.checked);
  const departments = groupByCategory(open).map(({ category, lines: group }) => {
    const items = group.map((line) => {
      const quantity = formatQuantity(line.amount, line.unit);
      return quantity ? `\u2610 ${line.label} ${quantity}` : `\u2610 ${line.label}`;
    });
    return [`${categoryTiles[category].icon} ${category.toUpperCase()}`, ...items].join("\n");
  });
  if (departments.length === 0) return "";
  const heading = week === null ? "\u{1F6D2} Inköpslista" : `\u{1F6D2} Inköpslista v. ${week}`;
  return `${heading}\n\n${departments.join("\n\n")}`;
}
