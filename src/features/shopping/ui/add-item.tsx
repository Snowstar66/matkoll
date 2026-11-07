"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { PlusIcon } from "@/components/icons";

// Lägg till vara: the "+" in the page header (UX-07, on every width; the floating round "+" is gone) opens the sheet Lägg till vara. The header is
// rendered by the page, beside the list (page.tsx), so the sheet's state is shared through a
// provider around both; a list rendered without one (unit tests) keeps the state itself.

/** The name of the header's "+"; also the sheet's title. */
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

/** "+" in Inköpslista's header (like Recept's): opens Lägg till vara. Nothing without a provider. */
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
      className="flex size-tap items-center justify-center rounded-full text-accent"
    >
      <PlusIcon size={26} />
    </button>
  );
}
