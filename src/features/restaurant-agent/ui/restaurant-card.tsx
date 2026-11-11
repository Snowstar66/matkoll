"use client";

import { ChevronRightIcon, PinIcon } from "@/components/icons";
import { useOption } from "@/lib/use-option";
import { texts } from "./format";

// The card on Menyrådgivarens start: one tap opens the agent; nothing runs by itself and no place is asked for.
// Only with the Tillval Restaurangagenten on (per device, so the page, which does not know it, always renders this
// and the card hides itself).

export function RestaurantAgentCard({ onOpen }: { onOpen: () => void }) {
  const on = useOption("restaurantAgent");
  if (!on) return null;
  return (
    <button type="button" onClick={onOpen} data-testid="restaurant-agent-card" className="flex items-start gap-3 rounded-lg bg-mint p-3.5 text-left text-mint-ink">
      <PinIcon size={26} className="mt-0.5 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-headline font-semibold wrap-break-word">{texts.cardTitle}</span>
        <span className="text-control font-normal wrap-break-word opacity-90">{texts.cardBody}</span>
      </span>
      <ChevronRightIcon size={20} className="shrink-0 self-center" />
    </button>
  );
}
