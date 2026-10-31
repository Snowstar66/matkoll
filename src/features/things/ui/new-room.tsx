"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/button";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { fail, type Result } from "@/lib/errors";
import { ensureCapturePlace } from "../actions/capture-place";
import { createRoomText, newRoomExample, newRoomHint, newRoomLabel, newRoomText, newRoomTitle } from "../domain/capture";
import { roomKey } from "../domain/thing-room";
import { maxPlaceNameChars } from "../domain/thing-place";
import { roomHref } from "./rooms-list";

// "+ Nytt rum" (Story 18.21): the last row of Förråd's start page, dashed so it
// does not look like a room. It opens a small sheet asking for the room's name;
// "Skapa rum" makes the room (the whole-room place, as a card taken there would)
// and opens its page, where the photos are taken. A name that is already a room
// just opens that room, since the place is found, not made twice.

export function NewRoom({ siteId }: { siteId: string }) {
  const router = useRouter();
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // The field has focus as the sheet opens (the sheet's own effect has shown it by now, so the field is focusable).
  useEffect(() => {
    if (open) nameRef.current?.focus();
  }, [open]);

  function openSheet() {
    setName("");
    setError(null);
    setNotice(null);
    setOpen(true);
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    let result: Result<{ placeId: string }>;
    try {
      result = await ensureCapturePlace({ siteId, room: name, part: "", box: false });
    } catch {
      result = fail("things_place_failed");
    }
    if (!result.ok) {
      setBusy(false);
      const { fields, message } = result.error;
      if (fields?.room) setError(fields.room);
      else setNotice(message);
      return;
    }
    // The sheet stays up (busy) until the room's page has replaced the list.
    router.push(roomHref(siteId, roomKey(name)));
    setOpen(false);
    setBusy(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        className="flex min-h-14 w-full items-center gap-2.5 rounded-lg border-[1.5px] border-dashed border-border py-0 pr-3.5 pl-2 text-left text-row-title text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        data-testid="new-room"
      >
        <span
          aria-hidden="true"
          className="flex size-tile shrink-0 items-center justify-center rounded-sm border-[1.5px] border-dashed border-accent text-tile-icon leading-none font-medium"
        >
          +
        </span>
        {newRoomText.replace("+ ", "")}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={newRoomTitle} closeLabel="Avbryt" preventClose={busy}>
        <form onSubmit={create} className="flex flex-col gap-4" noValidate>
          {notice ? <Notice role="alert">{notice}</Notice> : null}
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor={`${ids}-name`}>{newRoomLabel}</FieldLabel>
            <Input
              id={`${ids}-name`}
              ref={nameRef}
              placeholder={newRoomExample}
              autoComplete="off"
              maxLength={maxPlaceNameChars * 2}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={`${error ? `${ids}-error ` : ""}${ids}-hint`}
            />
            {error ? <FieldError id={`${ids}-error`}>{error}</FieldError> : null}
            <p id={`${ids}-hint`} className="px-1 text-meta text-ink-3">
              {newRoomHint}
            </p>
          </div>
          <Button type="submit" fullWidth disabled={busy}>
            {createRoomText}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
