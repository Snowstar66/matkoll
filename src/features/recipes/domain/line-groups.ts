// Ingredient groups (the recipe format of Linas Matkasse cards and the like):
// a recipe's lines listed under the part of the dish they belong to,
// "Rostad småpotatis", "Örtstekt kyckling". Pure, so the recipe view, the
// form and the tests group the same way.

/** A group's lines in the recipe's order; `name` is null for the lines without a group. */
export type LineGroup<L> = { name: string | null; lines: L[] };

/** The line's group name, trimmed, or null when it has none. */
export function lineGroupName(line: { group?: string | null }): string | null {
  const name = line.group?.trim();
  return name ? name : null;
}

/**
 * The lines by group: first the lines without a group (no heading), then each
 * group in the order of its first line, each with its lines in the recipe's
 * order. Lines of the same group are kept together even when other lines
 * stand between them. A recipe without groups is one group with name null,
 * so it looks as it did before groups; no lines is no groups.
 */
export function groupLines<L extends { group?: string | null }>(lines: readonly L[]): LineGroup<L>[] {
  const ungrouped: L[] = [];
  const named = new Map<string, L[]>();
  for (const line of lines) {
    const name = lineGroupName(line);
    if (name === null) {
      ungrouped.push(line);
      continue;
    }
    const group = named.get(name);
    if (group) group.push(line);
    else named.set(name, [line]);
  }
  const groups: LineGroup<L>[] = ungrouped.length > 0 ? [{ name: null, lines: ungrouped }] : [];
  for (const [name, groupLines] of named) groups.push({ name, lines: groupLines });
  return groups;
}

/** True when some line has a group, so the lines are shown under headings. */
export function hasGroups(lines: readonly { group?: string | null }[]): boolean {
  return lines.some((line) => lineGroupName(line) !== null);
}

/** The groups' names in order, for suggestions when a group is typed. */
export function groupNames(lines: readonly { group?: string | null }[]): string[] {
  return groupLines(lines).flatMap((group) => (group.name === null ? [] : [group.name]));
}
