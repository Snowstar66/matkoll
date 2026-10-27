"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { CategoryHeader } from "@/components/category-header";
import { EmptyState } from "@/components/empty-state";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import type { SearchFieldHandle } from "@/components/search-field";
import { focusAfterRemoval, TrashButton } from "@/components/trash-button";
import { formatQuantity, type Location } from "@/features/catalog";
import type { PantryItem } from "../domain/pantry-item";
import { filterPantry, groupPantryByCategory, pantryMetaText, type PantryCategoryGroup } from "../domain/pantry-meta";
import { emptyPlaceText } from "../domain/places";
import { AddPantryItemButton, usePantrySheet } from "./pantry-item-sheet";
import { usePantryRemoval } from "./pantry-removal";
import { PantryNoMatch, PantrySearchField, PantrySearchStatus } from "./pantry-search";
import { usePantryNow } from "./use-pantry-now";

export type PantryListProps = {
  location: Location;
  /** The location's items (listPantry sorts by name; the list groups them itself). */
  items: readonly PantryItem[];
  /**
   * What comes after the list while no search is on ("Töm kylen"): it acts on
   * the whole location, so it never shows while the list shows only matches.
   */
  after?: ReactNode;
};

/** Marks a row's press target, so focus can go back to an item after a removal in the sheet. */
const itemAttribute = "data-pantry-item";
/** Marks a row's bin, so focus can go back to it when its removal fails. */
const binAttribute = "data-pantry-bin";

/** How a row is named, so two rows that look alike can be told apart. */
type RowNames = {
  meta: string | null;
  /** For screen readers only, after the two lines: the amount ("1 l") when the name and the line under it are both the same as another row's. */
  extra: string | undefined;
  /** The bin's name: "Ta bort Mjölk", or with the line under it, and the extra, when the name is not enough. */
  binLabel: string;
};

/**
 * Names for every row shown (Story 11.3, README of the components): a name
 * that two rows share gets the line under it in the bin's name ("Ta bort
 * Mjölk, Arla"); when that is the same too, the amount ("Ta bort Mjölk,
 * Tillagd idag, 1 l"), or else the row's number among them, is added to the
 * bin's and the row's names.
 */
function rowNames(items: readonly PantryItem[], now: Date): Map<string, RowNames> {
  const metas = new Map(items.map((item) => [item.id, pantryMetaText(item, now)]));
  const count = (key: (item: PantryItem) => string) => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
    return counts;
  };
  const byName = count((item) => item.name);
  const byNameAndMeta = count((item) => `${item.name}\n${metas.get(item.id) ?? ""}`);
  const seen = new Map<string, number>();
  const names = new Map<string, RowNames>();
  for (const item of items) {
    const meta = metas.get(item.id) ?? null;
    const both = `${item.name}\n${meta ?? ""}`;
    let extra: string | undefined;
    if ((byNameAndMeta.get(both) ?? 0) > 1) {
      const place = (seen.get(both) ?? 0) + 1;
      seen.set(both, place);
      extra = item.amount !== null && item.unit !== null ? formatQuantity(item.amount, item.unit) : `nummer ${place}`;
    }
    const parts = [item.name];
    if ((byName.get(item.name) ?? 0) > 1 && meta) parts.push(meta);
    if (extra) parts.push(extra);
    names.set(item.id, { meta, extra, binLabel: `Ta bort ${parts.join(", ")}` });
  }
  return names;
}

/**
 * One location's items in the new look (Story 11.3, FR-40, FR-41): "Sök i
 * kylen" at the top, then the items under their category headings
 * (CategoryHeader, ListGroup) in the store's order, one ListRow per item with
 * the brand or "Tillagd …" under the name and never the amount. A tap on a
 * row opens the sheet Lagervara (needs a PantrySheetProvider above). The bin
 * at the end of a row removes the item at once, without a question; the
 * confirmation offers "Ångra" (PantryRemovalProvider). There is no swipe.
 *
 * Focus after a bin (EXPERIENCE.md, Soptunna) moves only for the keyboard
 * or a screen reader (the bin has focus, or the press had no pointer), never
 * after a tap, so the iPhone keyboard never comes up over the confirmation:
 * to the next item's bin, else the one before (focusAfterRemoval, before the
 * row leaves); after the last one shown, to the search field when the
 * location still has items, else to "Lägg till vara". When the removal fails,
 * focus goes back to the item's bin. After "Ta bort" in the sheet, to the
 * next item's row, else the one before. A list shown anew (another place or
 * location) moves no focus that was waiting.
 *
 * The search is emptied when the location becomes empty and when an item is
 * saved from the sheet, so it never hides a new item. A location without
 * items shows "Inget i kylen än." and "Lägg till vara", without a search
 * field; a search without a match shows "Inget i kylen matchar." and "Rensa
 * sökning". Lagersaldo keys the list on the place and the location, so the
 * search starts empty for each.
 */
export function PantryList({ location, items, after }: PantryListProps) {
  const { removeItem, focusAfter, focusMoved } = usePantryRemoval();
  const { saves } = usePantrySheet();
  const [query, setQuery] = useState("");
  /** Changes when the search is emptied from outside the field, so the field starts anew. */
  const [fieldKey, setFieldKey] = useState(0);
  const [seenSaves, setSeenSaves] = useState(saves);
  const searchRef = useRef<SearchFieldHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const now = usePantryNow();

  // The search goes when the location has nothing left to search, and when an
  // item is saved from the sheet (state adjusted while rendering).
  if (saves !== seenSaves) setSeenSaves(saves);
  if (query !== "" && (items.length === 0 || saves !== seenSaves)) {
    setQuery("");
    setFieldKey((key) => key + 1);
  }

  const shown = filterPantry(items, query);
  const groups = groupPantryByCategory(shown);
  const names = rowNames(shown, now);
  // The items in the order focus moves through them.
  const order = groups.flatMap((group) => group.items.map((item) => item.id));
  const lastOrder = useRef<readonly string[]>(order);
  /** The item whose bin was pressed from the keyboard, until focus has moved on. */
  const keyboardRemoval = useRef<string | null>(null);
  /** An item whose removal failed: its bin takes focus again once it is back. */
  const refocus = useRef<string | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (refocus.current !== null) {
      const bin = root?.querySelector<HTMLElement>(`[${binAttribute}="${refocus.current}"]`);
      const active = document.activeElement;
      if (bin) {
        refocus.current = null;
        // Unless Pontus has gone on somewhere else meanwhile.
        if (!active || active === document.body || root?.contains(active)) bin.focus();
      }
    }
    if (focusAfter !== null && !order.includes(focusAfter)) {
      const before = lastOrder.current;
      const index = before.indexOf(focusAfter);
      // A list shown anew never had the item: the focus that waited goes.
      if (index !== -1) {
        const neighbours = [...before.slice(index + 1), ...before.slice(0, index).reverse()];
        const target = neighbours.find((id) => order.includes(id));
        const fromBin = keyboardRemoval.current === focusAfter;
        const element = target
          ? root?.querySelector<HTMLElement>(fromBin ? `[${binAttribute}="${target}"]` : `[${itemAttribute}="${target}"]`)
          : ((fromBin ? root?.querySelector<HTMLElement>('input[type="search"]') : null) ??
            root?.querySelector<HTMLElement>('button:not([data-trash-button])'));
        element?.focus();
      }
      keyboardRemoval.current = null;
      focusMoved();
    }
    lastOrder.current = order;
  });

  /**
   * A bin was pressed. From the keyboard or a screen reader focus moves on,
   * once the removal is under way: to the next bin at once, before the row
   * leaves, else when the row is gone. A tap leaves focus alone.
   */
  function removeWithBin(item: PantryItem, bin: HTMLButtonElement, pointer: boolean) {
    const root = rootRef.current;
    const keyboard = !pointer || document.activeElement === bin;
    const neighbour =
      keyboard &&
      root !== null &&
      [...root.querySelectorAll<HTMLButtonElement>("[data-trash-button]")].some((other) => other !== bin && !other.disabled);
    const accepted = removeItem(item, {
      moveFocus: keyboard && !neighbour,
      onFailed: keyboard
        ? () => {
            refocus.current = item.id;
          }
        : undefined,
    });
    if (!accepted) return;
    if (keyboard && !neighbour) keyboardRemoval.current = item.id;
    if (neighbour && root) focusAfterRemoval(bin, root);
  }

  if (items.length === 0) {
    return (
      <>
        <div ref={rootRef}>
          <EmptyState action={<AddPantryItemButton variant="primary" />}>{emptyPlaceText(location)}</EmptyState>
        </div>
        {after}
      </>
    );
  }
  const searching = query.trim() !== "";
  return (
    <>
      <div ref={rootRef} className="flex flex-col gap-5">
        <PantrySearchField
          key={fieldKey}
          location={location}
          query={query}
          onQueryChange={setQuery}
          fieldRef={searchRef}
          noMatch={groups.length === 0}
        />
        <PantrySearchStatus location={location} query={query} count={shown.length} />
        {groups.length === 0 ? (
          <PantryNoMatch location={location} fieldRef={searchRef} />
        ) : (
          groups.map((group) => (
            <CategoryGroup key={group.category} group={group} names={names} onRemove={removeWithBin} />
          ))
        )}
      </div>
      {searching ? null : after}
    </>
  );
}

/** One category: its heading with the count, and its items in one list group. */
function CategoryGroup({
  group,
  names,
  onRemove,
}: {
  group: PantryCategoryGroup;
  names: ReadonlyMap<string, RowNames>;
  onRemove: (item: PantryItem, bin: HTMLButtonElement, pointer: boolean) => void;
}) {
  const headingId = useId();
  const { openItem } = usePantrySheet();
  return (
    <div className="flex flex-col gap-2" data-testid="pantry-category">
      <CategoryHeader id={headingId} category={group.category} count={group.items.length} />
      <ListGroup labelledBy={headingId}>
        {group.items.map((item) => {
          const { meta, extra, binLabel } = names.get(item.id) ?? { meta: null, extra: undefined, binLabel: `Ta bort ${item.name}` };
          return (
            <ListRow
              key={item.id}
              title={item.name}
              // "Tillagd idag" may differ between the server and the browser around midnight.
              meta={meta ? <span suppressHydrationWarning>{meta}</span> : null}
              srStatus={extra}
              onPress={() => openItem(item)}
              pressProps={{ "data-testid": "pantry-row", [itemAttribute]: item.id, "aria-haspopup": "dialog" }}
              trailing={
                <TrashButton
                  label={binLabel}
                  {...{ [binAttribute]: item.id }}
                  onPress={(bin, { pointer }) => onRemove(item, bin, pointer)}
                />
              }
            />
          );
        })}
      </ListGroup>
    </div>
  );
}
