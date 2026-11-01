"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { PlusIcon } from "@/components/icons";

// Lägg till vara (fix after go-live): a floating round "+" on a phone and a "+" in the page header
// on a desktop open the same sheet Lägg till vara. The header is
// rendered by the page, beside the list (page.tsx), so the sheet's state is shared through a
// provider around both; a list rendered without one (unit tests) keeps the state itself.

/** The name of the floating "+" and the header's "+"; also the sheet's title. */
export const addItemText = "Lägg till vara";

/** The sheet Lägg till vara: open or not, and a new session each time it opens (the form starts empty). */
export type AddItemSheetState = { open: boolean; session: number };

type AddItemSheet = {
  sheet: AddItemSheetState;
  openSheet: () => void;
  closeSheet: () => void;
};

const AddItemContext = createContext<AddItemSheet | null>(null);

function useSheetState(openOnStart: boolean): AddItemSheet {
  const [sheet, setSheet] = useState<AddItemSheetState>({ open: openOnStart, session: openOnStart ? 1 : 0 });
  const openSheet = useCallback(() => setSheet((current) => ({ open: true, session: current.session + 1 })), []);
  const closeSheet = useCallback(() => setSheet((current) => ({ ...current, open: false })), []);
  return useMemo(() => ({ sheet, openSheet, closeSheet }), [sheet, openSheet, closeSheet]);
}

/**
 * Around Inköpslista's header and list: the header's "+" and the list's field open one sheet.
 * `openOnStart` for the quick-add address (Story 17.9).
 */
export function AddItemProvider({ openOnStart = false, children }: { openOnStart?: boolean; children: ReactNode }) {
  const value = useSheetState(openOnStart);
  return <AddItemContext.Provider value={value}>{children}</AddItemContext.Provider>;
}

/** The sheet's state: the provider's, else the list's own (`openOnStart` only counts then). */
export function useAddItemSheet(openOnStart: boolean): AddItemSheet {
  const shared = useContext(AddItemContext);
  const own = useSheetState(openOnStart);
  return shared ?? own;
}

/** "+" in Inköpslista's header on a desktop (like Recept's): opens Lägg till vara. Nothing without a provider. */
export function AddItemHeaderButton() {
  const context = useContext(AddItemContext);
  if (!context) return null;
  return (
    <button
      type="button"
      aria-label={addItemText}
      aria-haspopup="dialog"
      data-testid="add-item-header"
      data-add-custom-item
      onClick={context.openSheet}
      // On a phone the floating "+" (AddItemFab) does this; from the desktop breakpoint, the header.
      className="hidden size-tap items-center justify-center rounded-full text-accent desktop:flex"
    >
      <PlusIcon size={26} />
    </button>
  );
}

/**
 * The round "+" on a phone (Pontus, after go-live): 56 px (in px, also with larger text), the brand green, bottom right just above
 * the tab bar (and above "Kopiera till ICA-varukorgen" when that is pinned), where the thumb
 * reaches it one-handed in the store. Hidden from the desktop breakpoint, where the header's "+"
 * does the same, and while a sheet or the keyboard is open (a focused text field).
 */
export function AddItemFab({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      data-add-custom-item
      data-testid="add-item-fab"
      aria-haspopup="dialog"
      aria-label={addItemText}
      onClick={onOpen}
      className={[
        "fixed z-20 flex size-[56px] items-center justify-center rounded-full bg-accent text-on-accent shadow-float",
        "right-[calc(var(--gutter-mobile)+env(safe-area-inset-right))]",
        "bottom-[calc(var(--tab-bar-height)+var(--fixed-action-gap)+var(--fixed-action-offset,0px))]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "desktop:hidden [body:has(dialog[open])_&]:hidden [body:has(input:focus)_&]:hidden [body:has(textarea:focus)_&]:hidden",
      ].join(" ")}
    >
      <PlusIcon size={28} />
    </button>
  );
}

/** Room at the end of the list on a phone, so its last row can scroll clear of the "+". */
export function AddItemFabSpacer() {
  return <div aria-hidden="true" data-testid="add-item-fab-spacer" className="h-[calc(56px+var(--fixed-action-gap))] shrink-0 desktop:hidden" />;
}
