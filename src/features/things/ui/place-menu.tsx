"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/button";
import { MoreIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { removeThingPlace, renameThingPlace } from "../actions/edit-place";
import { moreActionsText } from "../domain/thing-clear";
import {
  placeRemovedText,
  removeMenuText,
  removePlaceDetailText,
  removePlaceLeadText,
  removePlaceTitle,
  removingText,
  renameMenuText,
  renamePlaceTitle,
  type PlaceCounts,
} from "../domain/thing-place-edit";
import { RenameSheet } from "./rename-sheet";

// The ⋯ of a part or a box (Story 18.16), in the list of boxes and parts and on
// the label of a card in the view Kort: "Byt namn" and "Ta bort". The list clips
// a dropdown, so the choices are in a small sheet (as on a phone anyway). "Ta
// bort" asks first and says what goes (the cards and things of the place); then
// the place, its cards, files and things are removed. When the room has no place
// left it is gone too and the user is back on Förråd.

export type PlaceMenuProps = {
  placeId: string;
  /** The part's or box's name. */
  part: string;
  box: boolean;
  counts: PlaceCounts;
  /** Whether the room has other places than this one (else the room goes with it). */
  roomHasOthers: boolean;
};

export function PlaceMenu({ placeId, part, box, counts, roomHasOthers }: PlaceMenuProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [mode, setMode] = useState<"closed" | "menu" | "rename" | "remove">("closed");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const kind = { part, box };

  async function remove() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    let result;
    try {
      result = await removeThingPlace({ placeId });
    } catch {
      // No answer: it may have gone through, so the page is read again.
      router.refresh();
      setBusy(false);
      setNotice("Det gick inte att ta bort. Försök igen.");
      return;
    }
    setBusy(false);
    if (!result.ok) {
      if (result.error.code === "things_place_gone") router.refresh();
      setNotice(result.error.message);
      return;
    }
    setMode("closed");
    if (result.data.roomLeft) router.refresh();
    else router.replace("/prylar");
    showToast(placeRemovedText(part));
  }

  return (
    <>
      <button
        type="button"
        aria-label={`${moreActionsText}: ${part}`}
        aria-haspopup="dialog"
        onClick={() => setMode("menu")}
        className="flex size-tap shrink-0 items-center justify-center rounded-full text-ink-2"
        data-testid="place-menu"
      >
        <MoreIcon size={24} />
      </button>
      <Sheet open={mode === "menu"} onClose={() => setMode("closed")} title={part} closeLabel="Avbryt">
        <div className="flex flex-col gap-2">
          <Button fullWidth variant="secondary" onClick={() => setMode("rename")} data-testid="place-rename">
            {renameMenuText}
          </Button>
          <Button fullWidth variant="secondary" onClick={() => { setNotice(null); setMode("remove"); }} data-testid="place-remove">
            {removeMenuText}
          </Button>
        </div>
      </Sheet>
      <RenameSheet
        open={mode === "rename"}
        onClose={() => setMode("closed")}
        title={renamePlaceTitle(kind)}
        label={box ? "Namn på lådan" : "Del av rummet"}
        initial={part}
        submit={async (name) => {
          const result = await renameThingPlace({ placeId, name });
          if (result.ok) {
            router.refresh();
            return { kind: "done" };
          }
          if (result.error.code === "things_place_gone") router.refresh();
          return { kind: "error", message: result.error.fields?.name ?? result.error.message, field: Boolean(result.error.fields?.name) };
        }}
      />
      <Sheet
        open={mode === "remove"}
        onClose={() => setMode("closed")}
        title={removePlaceTitle(kind)}
        closeLabel="Avbryt"
        preventClose={busy}
        initialFocus="close"
        footer={
          <Button fullWidth disabled={busy} onClick={remove} data-testid="place-remove-confirm">
            {busy ? removingText : removeMenuText}
          </Button>
        }
      >
        <div className="flex flex-col gap-3" aria-busy={busy || undefined}>
          {notice ? <Notice role="alert">{notice}</Notice> : null}
          <p className="text-body font-semibold text-ink" data-testid="place-remove-counts">
            {removePlaceLeadText(counts)}
          </p>
          <p className="text-body text-ink-2">{removePlaceDetailText(box)}</p>
          {roomHasOthers ? null : <p className="text-body text-ink-2">Det är rummets enda plats, så rummet tas bort också.</p>}
        </div>
      </Sheet>
    </>
  );
}
