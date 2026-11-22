"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/button";
import { MoreIcon, TrashIcon } from "@/components/icons";
import { Sheet } from "@/components/sheet";
import { retakeTitleText } from "../domain/capture";
import { moreActionsText } from "../domain/thing-clear";
import { removeCardText } from "../domain/thing-edit";
import { addThingsText } from "../domain/thing-written";
import { AddCardThings } from "./add-card-things";
import { RemoveCard } from "./remove-card";
import { RetakeCard } from "./retake-card";

// The ⋯ in the header of a card's page (Värdetips sketches, D): the card's actions are here, not as three buttons at
// the end of the page and not on the squares of the room's Kort view. The sheet "Kortet" has Ta om kortet, Lägg till
// föremål and Ta bort kortet (red). Each opens its own question or form as before (RetakeCard, AddCardThings and
// RemoveCard are used as they are, without their own buttons), and a sheet replaces the menu when it opens.

export const cardSheetTitle = "Kortet";

type Mode = "closed" | "menu" | "retake" | "add" | "remove";

export function CardMenu({ cardId, placeId, takenAt, name, roomHref }: { cardId: string; placeId: string; takenAt: Date | string; name: string; roomHref: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("closed");
  const toRoom = () => router.replace(`${roomHref}?vy=cards`);
  const control = (own: Mode) => ({ open: mode === own, onOpenChange: (open: boolean) => setMode(open ? own : "closed") });

  return (
    <>
      <button
        type="button"
        aria-label={`${moreActionsText}: ${name}`}
        aria-haspopup="dialog"
        onClick={() => setMode("menu")}
        className="flex size-tap shrink-0 items-center justify-center rounded-full text-ink-2"
        data-testid="card-menu"
      >
        <MoreIcon size={24} />
      </button>
      <Sheet open={mode === "menu"} onClose={() => setMode("closed")} title={cardSheetTitle} subtitle={name} closeLabel="Klar">
        <div className="flex flex-col gap-2">
          <Button fullWidth variant="secondary" onClick={() => setMode("retake")} data-testid="card-menu-retake">
            {retakeTitleText}
          </Button>
          <Button fullWidth variant="secondary" onClick={() => setMode("add")} data-testid="card-menu-add">
            {addThingsText}
          </Button>
          <Button fullWidth variant="danger" onClick={() => setMode("remove")} data-testid="card-menu-remove">
            <TrashIcon size={20} />
            {removeCardText}
          </Button>
        </div>
      </Sheet>
      {/* The card is replaced once the new photo is read, so the room's Kort view is not kept in the history. */}
      <RetakeCard cardId={cardId} placeId={placeId} name={name} onSent={toRoom} control={control("retake")} />
      <AddCardThings cardId={cardId} name={name} control={control("add")} />
      <RemoveCard cardId={cardId} takenAt={new Date(takenAt)} name={name} onRemoved={toRoom} control={control("remove")} />
    </>
  );
}
