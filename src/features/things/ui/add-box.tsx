"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useId, useRef, useState } from "react";
import { Button } from "@/components/button";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { fail, type Result } from "@/lib/errors";
import { createThingBox } from "../actions/create-box";
import { addBoxText, emptyBoxText, maxPlaceNameChars } from "../domain/thing-place";

// "Lägg till låda" (Story 18.5): a sheet with the box's name, on a place's
// page. The box is a place of its own in the same room, so "Lägg till" opens
// it with the camera ready (`?fota=1`), to photograph the inside. The same
// sheet opens from the row "Innehållet i 3 lådor syns inte – fota insidan",
// which is then a button: the unseen boxes are named and photographed one at a
// time. A name that is empty or taken is said under the field; a place that is
// gone is said at the top, and the page is read again.

export type AddBoxProps = {
  /** The place the box is added to: the box gets its room. */
  placeId: string;
  /** `button` is the text button under the card; `row` is the line about the closed boxes, with `label` as its text. */
  variant: "button" | "row";
  label?: string;
};

export function AddBox({ placeId, variant, label }: AddBoxProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const ids = useId();

  function openSheet() {
    setName("");
    setError(null);
    setNotice(null);
    setOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setNotice(null);
    if (name.trim() === "") {
      setError(emptyBoxText);
      nameRef.current?.focus();
      return;
    }
    setSaving(true);
    let result: Result<{ id: string }>;
    try {
      result = await createThingBox({ placeId, name });
    } catch {
      // No answer (e.g. no connection): it may have been saved, so the page is read again.
      result = fail("things_place_failed");
      router.refresh();
    }
    setSaving(false);
    if (result.ok) {
      setOpen(false);
      router.push(`/prylar/${result.data.id}?fota=1`);
      return;
    }
    const { code, message, fields } = result.error;
    if (code === "unauthorized" || code === "things_place_gone") router.refresh();
    if (fields?.name) {
      setError(fields.name);
      nameRef.current?.focus();
      return;
    }
    setNotice(message);
  }

  return (
    <>
      {variant === "row" ? (
        <button
          type="button"
          onClick={openSheet}
          data-testid="unseen-note"
          className="rounded-md bg-sand px-4 py-3 text-left text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {label}
        </button>
      ) : (
        <Button variant="text" onClick={openSheet} className="self-start">
          {addBoxText}
        </Button>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={addBoxText} preventClose={saving} closeLabel="Avbryt">
        <form onSubmit={submit} noValidate aria-busy={saving || undefined} className="flex flex-col gap-4">
          {notice ? <Notice role="alert">{notice}</Notice> : null}
          <p className="text-body text-ink-2">Ge lådan ett namn, så fotar du insidan direkt.</p>
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor={`${ids}-name`}>Namn på lådan</FieldLabel>
            <Input
              ref={nameRef}
              id={`${ids}-name`}
              name="name"
              placeholder="Blå backen"
              autoComplete="off"
              maxLength={maxPlaceNameChars * 2}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${ids}-name-error` : undefined}
            />
            {error ? <FieldError id={`${ids}-name-error`}>{error}</FieldError> : null}
          </div>
          <Button type="submit" fullWidth aria-disabled={saving || undefined}>
            {saving ? "Lägger till …" : "Lägg till och fota"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
