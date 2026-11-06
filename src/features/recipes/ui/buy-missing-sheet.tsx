"use client";

import { useState } from "react";
import { Button } from "@/components/button";
import { Checkbox } from "@/components/checkbox";
import { Sheet } from "@/components/sheet";
import { buyConfirmText, offerTagText, type LineOffer } from "../domain/line-status";

// "Lägg på inköpslistan" (Story 25.1): the sheet behind "Köp det som saknas",
// with the missing ingredients ticked and the offer with what it saves on the
// rows that have one. Only the list: the recipe is not put on the meal plan.

export type BuyRow = {
  ingredientId: string;
  /** "400 g Falukorv": the row's text. */
  text: string;
  offer: LineOffer | null;
};

export type BuyMissingSheetProps = {
  open: boolean;
  onClose: () => void;
  rows: readonly BuyRow[];
  /** Called with the ticked ingredients' ids; the caller closes the sheet. */
  onConfirm: (ingredientIds: string[]) => void;
  pending?: boolean;
};

export function BuyMissingSheet({ open, onClose, rows, onConfirm, pending = false }: BuyMissingSheetProps) {
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());
  const ticked = rows.filter((row) => !off.has(row.ingredientId));
  const flip = (id: string) =>
    setOff((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Lägg på inköpslistan"
      subtitle="Bara listan. Receptet läggs inte på matsedeln."
      closeLabel="Avbryt"
      preventClose={pending}
      footer={
        <Button fullWidth disabled={ticked.length === 0 || pending} onClick={() => onConfirm(ticked.map((row) => row.ingredientId))}>
          {buyConfirmText(ticked.length)}
        </Button>
      }
    >
      <ul aria-label="Varor som saknas" className="flex flex-col rounded-lg bg-surface px-2">
        {rows.map((row) => (
          <li key={row.ingredientId} className="flex items-center gap-1 border-t border-hairline first:border-t-0" data-testid="buy-row">
            <Checkbox
              checked={!off.has(row.ingredientId)}
              onCheckedChange={() => flip(row.ingredientId)}
              label={row.offer ? `${row.text}, ${offerTagText(row.offer)}` : row.text}
            />
            <span className="min-w-0 flex-1 text-item text-ink">{row.text}</span>
            {row.offer ? <span className="shrink-0 pr-2 text-meta font-semibold text-deal-ink">{offerTagText(row.offer)}</span> : null}
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
