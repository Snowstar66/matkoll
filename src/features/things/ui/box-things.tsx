"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { Button, buttonClasses } from "@/components/button";
import { FieldError, FieldLabel } from "@/components/field";
import { Notice } from "@/components/notice";
import { errorMessages, fail, type Result } from "@/lib/errors";
import { saveBoxThings, type SavedBoxThings } from "../actions/save-box-things";
import {
  alsoPhotographedText,
  maxWrittenTextChars,
  photoInsteadText,
  saveWrittenText,
  savingWrittenText,
  writtenFailedText,
  writtenHintText,
  writtenPlaceholder,
  writtenSavedText,
  writtenTitleText,
  writtenUncategorizedText,
} from "../domain/thing-written";

// A box's page (Story 18.13): the text field "Vad finns i lådan?", one thing per
// line or with commas, "Spara" (the things are sorted into categories by one
// cheap AI call and replace the ones written before) and "Fota insidan i
// stället". Written and photographed things show together everywhere else.

export type BoxThingsProps = {
  placeId: string;
  room: string;
  /** The room's page; "Fota insidan" opens its camera for this box. */
  roomHref: string;
  initialText: string;
  /** The things the box's cards show. */
  photographed: number;
};

export function BoxThings({ placeId, room, roomHref, initialText, photographed }: BoxThingsProps) {
  const router = useRouter();
  const ids = useId();
  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedBoxThings | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    setSaved(null);
    let result: Result<SavedBoxThings>;
    try {
      result = await saveBoxThings({ placeId, text });
    } catch {
      // No answer (e.g. no connection): it may have been saved, so the page is read again.
      result = fail("things_place_failed");
      router.refresh();
    }
    setSaving(false);
    if (result.ok) {
      setSaved(result.data);
      setText(result.data.text);
      router.refresh();
      return;
    }
    if (result.error.fields?.text) setError(result.error.fields.text);
    else {
      if (result.error.code === "unauthorized" || result.error.code === "things_place_gone") router.refresh();
      setNotice(result.error.code === "things_place_failed" ? writtenFailedText : errorMessages[result.error.code]);
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="box">
      <p className="-mt-1.5 px-1 text-meta text-ink-3">{`Låda i ${room}`}</p>
      <form onSubmit={submit} className="flex flex-col gap-3" aria-busy={saving || undefined}>
        <FieldLabel htmlFor={`${ids}-text`}>{writtenTitleText}</FieldLabel>
        <textarea
          id={`${ids}-text`}
          name="text"
          rows={8}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={writtenPlaceholder}
          maxLength={maxWrittenTextChars}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${ids}-hint ${ids}-error`}
          className="min-h-40 w-full resize-y rounded-md border border-ink-3 bg-surface p-4 text-body text-ink placeholder:text-ink-3 aria-[invalid=true]:border-sky-ink"
        />
        <p id={`${ids}-hint`} className="px-1 text-meta text-ink-3">
          {writtenHintText}
        </p>
        <FieldError id={`${ids}-error`} role={error ? "alert" : undefined}>
          {error}
        </FieldError>
        {notice ? <Notice role="alert">{notice}</Notice> : null}
        {/* Mounted empty, so the text is announced when it appears. */}
        <p role="status" className="px-1 text-meta text-ink-2" data-testid="box-saved">
          {saving ? savingWrittenText : saved ? (saved.categorized ? writtenSavedText(saved.count) : writtenUncategorizedText) : ""}
        </p>
        <Button type="submit" fullWidth aria-disabled={saving || undefined}>
          {saving ? savingWrittenText : saveWrittenText}
        </Button>
      </form>
      <Link href={`${roomHref}?fota=${placeId}`} className={buttonClasses("secondary", true)} data-testid="box-photograph">
        <span aria-hidden="true">{"\u{1F4F7}"}</span> {photoInsteadText}
      </Link>
      {photographed > 0 ? <p className="px-1 text-meta text-ink-3">{alsoPhotographedText(photographed)}</p> : null}
    </div>
  );
}
