"use client";

import { Button } from "@/components/button";
import { Sheet } from "@/components/sheet";
import type { RestaurantSettings } from "../domain/types";
import { SettingsFields } from "./settings-fields";
import { texts } from "./format";

// "Ställ in sökningen": the same four choices as the question screen, opened from the result. The choices are kept on
// this device (settings-store.ts) and change at once; "Sök igen" runs the search again with them.

export function RestaurantSettingsSheet({ open, onClose, value, onChange, onSearchAgain }: { open: boolean; onClose: () => void; value: RestaurantSettings; onChange: (next: RestaurantSettings) => void; onSearchAgain?: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={texts.sheetTitle}
      closeLabel={texts.sheetDone}
      footer={
        onSearchAgain ? (
          <Button fullWidth onClick={onSearchAgain} data-testid="restaurant-search-again">
            Sök igen
          </Button>
        ) : undefined
      }
    >
      <div data-testid="restaurant-settings">
        <SettingsFields value={value} onChange={onChange} />
        <p className="mt-4 text-meta text-ink-3">{texts.remembered}</p>
      </div>
    </Sheet>
  );
}
