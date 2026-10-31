"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/button";
import { FieldError, FieldLabel } from "@/components/field";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { errorMessages, fail, type Result } from "@/lib/errors";
import { addCardThings, type AddedCardThings } from "../actions/add-card-things";
import {
  addedThingsText,
  addThingsHintText,
  addThingsSaveText,
  addThingsText,
  addThingsTitle,
  maxWrittenTextChars,
  savingWrittenText,
  writtenPlaceholder,
  writtenUncategorizedText,
} from "../domain/thing-written";

// "Lägg till pryl" on a card (Story 18.15): what the AI missed, written like
// "Skriv vad som finns" (one thing a line or with commas). The things are tied to
// this card, sorted into categories by one cheap AI call (Övrigt when it does not
// answer), and replaced when the card is retaken.

export function AddCardThings({ cardId, name }: { cardId: string; name: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    let result: Result<AddedCardThings>;
    try {
      result = await addCardThings({ cardId, text });
    } catch {
      // No answer (e.g. no connection): it may have been saved, so the page is read again.
      result = fail("things_item_failed");
      router.refresh();
    }
    setSaving(false);
    if (result.ok) {
      setOpen(false);
      setText("");
      router.refresh();
      showToast(result.data.categorized ? addedThingsText(result.data.count) : writtenUncategorizedText);
      return;
    }
    if (result.error.fields?.text) {
      setError(result.error.fields.text);
      return;
    }
    if (result.error.code === "things_card_gone" || result.error.code === "unauthorized") router.refresh();
    setNotice(errorMessages[result.error.code]);
  }

  return (
    <>
      <Button variant="compact" aria-label={`${addThingsText} på kortet ${name}`} onClick={() => setOpen(true)} data-testid="add-card-things">
        {addThingsText}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={addThingsTitle} subtitle={name} closeLabel="Avbryt" preventClose={saving}>
        <form onSubmit={submit} className="flex flex-col gap-3" aria-busy={saving || undefined}>
          {notice ? <Notice role="alert">{notice}</Notice> : null}
          <FieldLabel htmlFor={`${ids}-text`}>Vad saknas?</FieldLabel>
          <textarea
            id={`${ids}-text`}
            name="text"
            rows={6}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={writtenPlaceholder}
            maxLength={maxWrittenTextChars}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${ids}-hint ${ids}-error`}
            className="min-h-32 w-full resize-y rounded-md border border-ink-3 bg-surface p-4 text-body text-ink placeholder:text-ink-3 aria-[invalid=true]:border-sky-ink"
            data-testid="add-card-text"
          />
          <p id={`${ids}-hint`} className="px-1 text-meta text-ink-3">
            {addThingsHintText}
          </p>
          <FieldError id={`${ids}-error`} role={error ? "alert" : undefined}>
            {error}
          </FieldError>
          <Button type="submit" fullWidth aria-disabled={saving || undefined} data-testid="add-card-save">
            {saving ? savingWrittenText : addThingsSaveText}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
