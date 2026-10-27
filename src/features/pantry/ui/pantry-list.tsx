"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CategoryHeader } from "@/components/category-header";
import { EmptyState } from "@/components/empty-state";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import type { SearchFieldHandle } from "@/components/search-field";
import { focusAfterRemoval, TrashButton } from "@/components/trash-button";
import type { Location } from "@/features/catalog";
import type { PantryItem } from "../domain/pantry-item";
import { filterPantry, groupPantryByCategory, pantryMetaText, type PantryCategoryGroup } from "../domain/pantry-meta";
import { emptyPlaceText } from "../domain/places";
import { AddPantryItemButton, usePantrySheet } from "./pantry-item-sheet";
import { usePantryRemoval } from "./pantry-removal";
import { PantryNoMatch, PantrySearchField } from "./pantry-search";

export type PantryListProps = {
  location: Location;
  /** The location's items (listPantry sorts by name; the list groups them itself). */
  items: readonly PantryItem[];
};

/** Marks a row's press target, so focus can go back to an item after a removal in the sheet. */
const itemAttribute = "data-pantry-item";

/**
 * One location's items in the new look (Story 11.3, FR-40, FR-41): "Sök i
 * kylen" at the top, then the items under their category headings
 * (CategoryHeader, ListGroup) in the store's order, one ListRow per item with
 * the brand or "Tillagd …" under the name and never the amount. A tap on a
 * row opens the sheet Lagervara (needs a PantrySheetProvider above). The bin
 * at the end of a row removes the item at once, without a question; the
 * confirmation offers "Ångra" (PantryRemovalProvider). There is no swipe.
 *
 * Focus after a removal (EXPERIENCE.md, Soptunna): after a bin, to the next
 * item's bin, else the one before (focusAfterRemoval, before the row leaves);
 * after the last one shown, to the search field when the location still has
 * items, else to "Lägg till vara". After "Ta bort" in the sheet, to the next
 * item's row, else the one before, else the same.
 *
 * A location without items shows "Inget i kylen än." and "Lägg till vara",
 * without a search field; a search without a match shows "Inget i kylen
 * matchar." and "Rensa sökning". Lagersaldo keys the list on the place and the
 * location, so the search starts empty for each.
 */
export function PantryList({ location, items }: PantryListProps) {
  const { removeItem, focusAfter, focusMoved } = usePantryRemoval();
  const [query, setQuery] = useState("");
  const searchRef = useRef<SearchFieldHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const shown = filterPantry(items, query);
  const groups = groupPantryByCategory(shown);
  // The items in the order focus moves through them.
  const order = groups.flatMap((group) => group.items.map((item) => item.id));
  const lastOrder = useRef<readonly string[]>(order);
  const now = new Date();

  useEffect(() => {
    if (focusAfter !== null && !order.includes(focusAfter)) {
      const before = lastOrder.current;
      const index = before.indexOf(focusAfter);
      const neighbours = index === -1 ? [] : [...before.slice(index + 1), ...before.slice(0, index).reverse()];
      const target = neighbours.find((id) => order.includes(id));
      const root = rootRef.current;
      const element = target
        ? root?.querySelector<HTMLElement>(`[${itemAttribute}="${target}"]`)
        : (root?.querySelector<HTMLElement>('input[type="search"]') ?? root?.querySelector<HTMLElement>("button"));
      element?.focus();
      focusMoved();
    }
    lastOrder.current = order;
  });

  /** A bin was pressed: focus moves on before the row leaves, unless it was the last bin. */
  function removeWithBin(item: PantryItem, bin: HTMLButtonElement) {
    const root = rootRef.current;
    const others = root
      ? [...root.querySelectorAll<HTMLButtonElement>("[data-trash-button]")].some(
          (other) => other !== bin && !other.disabled,
        )
      : false;
    if (others && root) {
      focusAfterRemoval(bin, root);
      removeItem(item);
    } else {
      // The search field or "Lägg till vara" exists only once the row is gone.
      removeItem(item, { moveFocus: true });
    }
  }

  if (items.length === 0) {
    return (
      <div ref={rootRef}>
        <EmptyState action={<AddPantryItemButton variant="primary" />}>{emptyPlaceText(location)}</EmptyState>
      </div>
    );
  }
  return (
    <div ref={rootRef} className="flex flex-col gap-5">
      <PantrySearchField location={location} query={query} onQueryChange={setQuery} fieldRef={searchRef} />
      {groups.length === 0 ? (
        <PantryNoMatch location={location} fieldRef={searchRef} />
      ) : (
        groups.map((group) => (
          <CategoryGroup key={group.category} group={group} now={now} onRemove={removeWithBin} />
        ))
      )}
    </div>
  );
}

/** One category: its heading with the count, and its items in one list group. */
function CategoryGroup({
  group,
  now,
  onRemove,
}: {
  group: PantryCategoryGroup;
  now: Date;
  onRemove: (item: PantryItem, bin: HTMLButtonElement) => void;
}) {
  const headingId = useId();
  const { openItem } = usePantrySheet();
  const names = group.items.map((item) => item.name);
  return (
    <div className="flex flex-col gap-2" data-testid="pantry-category">
      <CategoryHeader id={headingId} category={group.category} count={group.items.length} />
      <ListGroup labelledBy={headingId}>
        {group.items.map((item) => {
          const meta = pantryMetaText(item, now);
          // Two rows with the same name: the line under it tells the bins apart.
          const twice = names.indexOf(item.name) !== names.lastIndexOf(item.name);
          const name = twice && meta ? `${item.name}, ${meta}` : item.name;
          return (
            <ListRow
              key={item.id}
              title={item.name}
              meta={meta}
              onPress={() => openItem(item)}
              pressProps={{ "data-testid": "pantry-row", [itemAttribute]: item.id, "aria-haspopup": "dialog" }}
              trailing={<TrashButton label={`Ta bort ${name}`} onPress={(bin) => onRemove(item, bin)} />}
            />
          );
        })}
      </ListGroup>
    </div>
  );
}
