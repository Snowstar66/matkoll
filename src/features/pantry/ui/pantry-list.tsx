"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { CategoryHeader } from "@/components/category-header";
import { EmptyState } from "@/components/empty-state";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import type { SearchFieldHandle } from "@/components/search-field";
import { SwipeRow } from "@/components/swipe-row";
import { formatQuantity, type Location } from "@/features/catalog";
import type { PantryItem } from "../domain/pantry-item";
import { filterPantry, groupPantryByCategory, oldItemText, type PantryCategoryGroup } from "../domain/pantry-meta";
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
/** How a row is named, so two rows that look alike can be told apart. */
type RowNames = {
  /** The line under the name: the brand ("Arla laktosfri"), or `null`. */
  meta: string | null;
  /** For screen readers only, after the two lines: the amount ("1 l") or the row's number when the name and the brand are both the same as another row's. */
  extra: string | undefined;
  /** The swipe action's name: "Ta bort Mjölk", with the brand and the extra when the name is not enough. */
  removeLabel: string;
};

/** The brand of an item, or `null`; a brand of only spaces is none. */
function brandOf(item: PantryItem): string | null {
  return item.label?.trim() || null;
}

/**
 * Names for every row shown (Story 11.3, Story 14.6): a name that two rows
 * share gets the brand in the swipe action's name ("Ta bort Mjölk, Arla");
 * when that is the same too, the amount ("Ta bort Mjölk, 1 l"), or else the
 * row's number among them, is added to it and to the row's name.
 */
function rowNames(items: readonly PantryItem[]): Map<string, RowNames> {
  const count = (key: (item: PantryItem) => string) => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
    return counts;
  };
  const byName = count((item) => item.name);
  const byNameAndBrand = count((item) => `${item.name}\n${brandOf(item) ?? ""}`);
  const seen = new Map<string, number>();
  const names = new Map<string, RowNames>();
  for (const item of items) {
    const meta = brandOf(item);
    const both = `${item.name}\n${meta ?? ""}`;
    let extra: string | undefined;
    if ((byNameAndBrand.get(both) ?? 0) > 1) {
      const place = (seen.get(both) ?? 0) + 1;
      seen.set(both, place);
      extra = item.amount !== null && item.unit !== null ? formatQuantity(item.amount, item.unit) : `nummer ${place}`;
    }
    const parts = [item.name];
    if ((byName.get(item.name) ?? 0) > 1 && meta) parts.push(meta);
    if (extra) parts.push(extra);
    names.set(item.id, { meta, extra, removeLabel: `Ta bort ${parts.join(", ")}` });
  }
  return names;
}

/**
 * One location's items in the new look (Story 11.3, FR-40, FR-41, Story
 * 14.6): "Sök i kylen" at the top, then the items under their category
 * headings (CategoryHeader, ListGroup) in the store's order, one row per item
 * with the name to the left, the brand under it when there is one, and the
 * amount to the right when it has one ("4 st"); an item that has lain longer
 * than its location's limit (oldItemText) has a small sand label ("9 dagar").
 * A tap on a row opens the sheet Lagervara (needs a PantrySheetProvider
 * above). There is no bin: swiping the row to the left reveals "Ta bort"
 * (SwipeRow, also reached with Tab after the row), and the sheet has "Ta
 * bort" too; both remove at once and the confirmation offers "Ångra"
 * (PantryRemovalProvider).
 *
 * Focus after "Ta bort" (EXPERIENCE.md) moves only for the keyboard or a
 * screen reader, never after a swipe, so the iPhone keyboard never comes up
 * over the confirmation: to the next item's row, else the one before; after
 * the last one shown, to the search field when the location still has items,
 * else to "Lägg till vara". When the removal fails, focus goes back to the
 * item's row. After "Ta bort" in the sheet, to the next item's row, else the
 * one before. A list shown anew (another place or location) moves no focus
 * that was waiting.
 *
 * The search is emptied when the location becomes empty and when an item is
 * saved from the sheet, so it never hides a new item. A location without
 * items shows "Inget i kylen än." and "Lägg till vara", without a search
 * field; a search without a match shows "Inget i kylen matchar." and "Rensa
 * sökning". Förråd keys the list on the place and the location, so the
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
  const names = rowNames(shown);
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
      const row = root?.querySelector<HTMLElement>(`[${itemAttribute}="${refocus.current}"]`);
      const active = document.activeElement;
      if (row) {
        refocus.current = null;
        // Unless Pontus has gone on somewhere else meanwhile.
        if (!active || active === document.body || root?.contains(active)) row.focus();
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
          ? root?.querySelector<HTMLElement>(`[${itemAttribute}="${target}"]`)
          : ((fromBin ? root?.querySelector<HTMLElement>('input[type="search"]') : null) ??
            root?.querySelector<HTMLElement>('button'));
        element?.focus();
      }
      keyboardRemoval.current = null;
      focusMoved();
    }
    lastOrder.current = order;
  });

  /**
   * "Ta bort" after a swipe, or reached with Tab, was pressed: removes at once
   * (the swipe is the second step), and "Ångra" follows. From the keyboard
   * focus moves on to the next row, else the one before.
   */
  function removeBySwipe(item: PantryItem, keyboard: boolean) {
    const accepted = removeItem(item, {
      moveFocus: keyboard,
      onFailed: keyboard
        ? () => {
            refocus.current = item.id;
          }
        : undefined,
    });
    if (accepted && keyboard) keyboardRemoval.current = item.id;
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
            <CategoryGroup key={group.category} group={group} names={names} now={now} location={location} onRemove={removeBySwipe} />
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
  now,
  location,
  onRemove,
}: {
  group: PantryCategoryGroup;
  names: ReadonlyMap<string, RowNames>;
  now: Date;
  location: Location;
  onRemove: (item: PantryItem, keyboard: boolean) => void;
}) {
  const headingId = useId();
  const { openItem } = usePantrySheet();
  return (
    <div className="flex flex-col gap-2" data-testid="pantry-category">
      <CategoryHeader id={headingId} category={group.category} count={group.items.length} />
      <ListGroup labelledBy={headingId}>
        {group.items.map((item) => {
          const { meta, extra, removeLabel } = names.get(item.id) ?? { meta: null, extra: undefined, removeLabel: `Ta bort ${item.name}` };
          const amount = item.amount !== null && item.unit !== null ? formatQuantity(item.amount, item.unit) : "";
          const old = oldItemText(item, location, now);
          return (
            <li key={item.id}>
              <SwipeRow actionLabel="Ta bort" actionName={removeLabel} onAction={(via) => onRemove(item, via === "keyboard")}>
                <ListRow
                  as="div"
                  title={item.name}
                  meta={meta}
                  srStatus={extra}
                  onPress={() => openItem(item)}
                  pressProps={{ "data-testid": "pantry-row", [itemAttribute]: item.id, "aria-haspopup": "dialog" }}
                  trailing={
                    amount || old ? (
                      // The amount to the right of the name, and when the item has lain too long a small sand label (Story 14.6).
                      // "dagar" is hidden from nobody: the label is the text.
                      <span className="flex items-center gap-2 pr-2">
                        {amount ? <span className="text-meta text-ink-3 tabular-nums" data-testid="pantry-amount">{amount}</span> : null}
                        {old ? (
                          <span className="rounded-full bg-sand px-2 py-0.5 text-badge text-sand-ink" data-testid="pantry-old">
                            {old}
                          </span>
                        ) : null}
                      </span>
                    ) : undefined
                  }
                />
              </SwipeRow>
            </li>
          );
        })}
      </ListGroup>
    </div>
  );
}
