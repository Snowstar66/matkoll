"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useId, useRef, useState } from "react";
import { Button } from "@/components/button";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { PlusIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { fail, type Result } from "@/lib/errors";
import { createThingPlace } from "../actions/create-place";
import { emptyRoomText, maxPlaceNameChars, newPlaceText } from "../domain/thing-place";

// "Ny plats" (Story 18.1): a sheet with the room (the rooms the user already
// has are suggested in a list, so the same room is reused) and an optional
// part, for the boende the page shows. "Skapa" opens the new place, ready for
// its first photo. A name that is empty or taken is said under its field; a
// boende that is gone is said at the top, and the page is read again.

export type NewPlaceProps = {
  /** The boende the page shows: a new place belongs to it, also if another is selected meanwhile. */
  siteId: string;
  /** The rooms the user has in this boende, once each, for the suggestions. */
  rooms: readonly string[];
  /** Where the button sits: the round "+" in the header, or the text button of the empty list and the foot of the list. */
  variant: "icon" | "primary" | "text";
};

export function NewPlace({ siteId, rooms, variant }: NewPlaceProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [room, setRoom] = useState("");
  const [part, setPart] = useState("");
  const [errors, setErrors] = useState<{ room?: string; part?: string }>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const roomRef = useRef<HTMLInputElement>(null);
  const ids = useId();

  function openSheet() {
    setRoom("");
    setPart("");
    setErrors({});
    setNotice(null);
    setOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setNotice(null);
    if (room.trim() === "") {
      setErrors({ room: emptyRoomText });
      roomRef.current?.focus();
      return;
    }
    setSaving(true);
    let result: Result<{ id: string }>;
    try {
      result = await createThingPlace({ siteId, room, part });
    } catch {
      // No answer (e.g. no connection): it may have been saved, so the page is read again.
      result = fail("things_place_failed");
      router.refresh();
    }
    setSaving(false);
    if (result.ok) {
      setOpen(false);
      router.push(`/prylar/${result.data.id}`);
      return;
    }
    const { code, message, fields } = result.error;
    if (code === "unauthorized" || code === "things_place_gone") router.refresh();
    if (fields && (fields.room || fields.part)) {
      setErrors({ room: fields.room, part: fields.part });
      (fields.room ? roomRef : undefined)?.current?.focus();
      return;
    }
    setNotice(message);
  }

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          aria-label={newPlaceText}
          onClick={openSheet}
          className="flex size-tap items-center justify-center rounded-full text-accent"
        >
          <PlusIcon size={26} />
        </button>
      ) : (
        <Button variant={variant} onClick={openSheet}>
          {newPlaceText}
        </Button>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={newPlaceText} preventClose={saving} closeLabel="Avbryt">
        <form onSubmit={submit} noValidate aria-busy={saving || undefined} className="flex flex-col gap-4">
          {notice ? <Notice role="alert">{notice}</Notice> : null}
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor={`${ids}-room`}>Rum</FieldLabel>
            <Input
              ref={roomRef}
              id={`${ids}-room`}
              name="room"
              list={`${ids}-rooms`}
              placeholder="Skräpförrådet"
              autoComplete="off"
              maxLength={maxPlaceNameChars * 2}
              value={room}
              onChange={(event) => {
                setRoom(event.target.value);
                setErrors((current) => ({ ...current, room: undefined }));
              }}
              aria-invalid={errors.room ? true : undefined}
              aria-describedby={errors.room ? `${ids}-room-error` : undefined}
            />
            <datalist id={`${ids}-rooms`}>
              {rooms.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            {errors.room ? <FieldError id={`${ids}-room-error`}>{errors.room}</FieldError> : null}
          </div>
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor={`${ids}-part`}>Del (valfritt)</FieldLabel>
            <Input
              id={`${ids}-part`}
              name="part"
              placeholder="Översta hyllan"
              autoComplete="off"
              maxLength={maxPlaceNameChars * 2}
              value={part}
              onChange={(event) => {
                setPart(event.target.value);
                setErrors((current) => ({ ...current, part: undefined }));
              }}
              aria-invalid={errors.part ? true : undefined}
              aria-describedby={errors.part ? `${ids}-part-error` : undefined}
            />
            {errors.part ? <FieldError id={`${ids}-part-error`}>{errors.part}</FieldError> : null}
          </div>
          <Button type="submit" fullWidth aria-disabled={saving || undefined}>
            {saving ? "Skapar …" : "Skapa"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
