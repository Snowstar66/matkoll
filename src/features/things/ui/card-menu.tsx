"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AiWorking } from "@/components/ai-working";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { errorMessages } from "@/lib/errors";
import { MoreIcon, TrashIcon } from "@/components/icons";
import { Sheet } from "@/components/sheet";
import { retakeTitleText } from "../domain/capture";
import { moreActionsText } from "../domain/thing-clear";
import { removeCardText } from "../domain/thing-edit";
import { addThingsText } from "../domain/thing-written";
import { renameThingCard } from "../actions/worth-state";
import { renameCardLabelText, renameCardText, summaryFailedText, updateSummaryText, updatingSummaryText } from "../domain/thing-card-title";
import { oneAiCallText } from "../domain/thing-worth";
import { AddCardThings } from "./add-card-things";
import { RemoveCard } from "./remove-card";
import { RenameSheet } from "./rename-sheet";
import { RetakeCard } from "./retake-card";
import { refreshCardSummaryText } from "./worth-client";

// The ⋯ in the header of a card's page (Värdetips sketches, D): the card's actions are here (also Byt namn and Uppdatera sammanfattningen), not as three buttons at
// the end of the page and not on the squares of the room's Kort view. The sheet "Kortet" has Ta om kortet, Lägg till
// föremål and Ta bort kortet (red). Each opens its own question or form as before (RetakeCard, AddCardThings and
// RemoveCard are used as they are, without their own buttons), and a sheet replaces the menu when it opens.

export const cardSheetTitle = "Kortet";

type Mode = "closed" | "menu" | "retake" | "add" | "remove" | "rename";

export function CardMenu({ cardId, placeId, takenAt, name, roomHref }: { cardId: string; placeId: string; takenAt: Date | string; name: string; roomHref: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("closed");
  const [updating, setUpdating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // "Uppdatera sammanfattningen": one AI call; the line and the AI's short name are replaced, the user's own name never.
  async function updateSummary() {
    if (updating) return;
    setUpdating(true);
    setNotice(null);
    const answer = await refreshCardSummaryText(cardId);
    setUpdating(false);
    if (answer.ok) {
      setMode("closed");
      router.refresh();
    } else {
      setNotice(errorMessages[answer.error.code] ?? summaryFailedText);
    }
  }
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
          <Button fullWidth variant="secondary" onClick={() => setMode("rename")} data-testid="card-menu-rename">
            {renameCardText}
          </Button>
          <Button fullWidth variant="secondary" onClick={() => void updateSummary()} disabled={updating} data-testid="card-menu-summary">
            {updating ? (
              <span role="status">
                <AiWorking size="sm" label={updatingSummaryText} />
              </span>
            ) : (
              <span className="flex flex-col items-center leading-tight">
                {updateSummaryText}
                <span className="text-meta font-normal text-ink-2">{oneAiCallText}</span>
              </span>
            )}
          </Button>
          {notice ? <Notice role="alert">{notice}</Notice> : null}
          <Button fullWidth variant="danger" onClick={() => setMode("remove")} data-testid="card-menu-remove">
            <TrashIcon size={20} />
            {removeCardText}
          </Button>
        </div>
      </Sheet>
      <RenameSheet
        open={mode === "rename"}
        onClose={() => setMode("closed")}
        title={renameCardText}
        label={renameCardLabelText}
        initial={name}
        submit={async (value) => {
          const result = await renameThingCard({ id: cardId, name: value });
          if (result.ok) {
            router.refresh();
            return { kind: "done" };
          }
          return { kind: "error", message: result.error.fields?.name ?? result.error.message, field: Boolean(result.error.fields?.name) };
        }}
      />
      {/* The card is replaced once the new photo is read, so the room's Kort view is not kept in the history. */}
      <RetakeCard cardId={cardId} placeId={placeId} name={name} onSent={toRoom} control={control("retake")} />
      <AddCardThings cardId={cardId} name={name} control={control("add")} />
      <RemoveCard cardId={cardId} takenAt={new Date(takenAt)} name={name} onRemoved={toRoom} control={control("remove")} />
    </>
  );
}
