"use client";

import { type FormEvent, useId, useRef, useState } from "react";
import { Button } from "@/components/button";
import { cx } from "@/components/cx";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { errorMessages, fail, type Result } from "@/lib/errors";
import { rememberThing } from "../actions/remember-thing";
import { maxThingNameChars } from "../domain/thing-edit";
import {
  chooseRoomText,
  editProposalText,
  movedFromText,
  newRoomBadgeText,
  notedIcon,
  notedNameLabel,
  notedPartLabel,
  notedPartPlaceholder,
  notedRoomLabel,
  optionalText,
  yourRoomsLabel,
  rememberText,
  savingNotedText,
  type NotedProposal,
  type Remembered,
} from "../domain/thing-noted";
import { maxPlaceNameChars, normalizePlaceName } from "../domain/thing-place";

// "Kom ihåg" in the chat (Story 18.19): the AI's proposal of a thing to remember
// in the answer's bubble (a note tile, the name, "Sovrummet · Översta
// byrålådan"), "Kom ihåg" to save it as it is, and "Ändra" for a sheet with the
// name, the room (with the boende's rooms as chips) and the part. Nothing is
// saved before a tap.

type Fields = { name?: string; room?: string; part?: string };

/** The noted thing's tile: a note on lilac, decoration only. */
export function NotedTile({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cx("flex shrink-0 items-center justify-center rounded-sm bg-tile-lilac text-tile-icon leading-none select-none", className)}>
      {notedIcon}
    </span>
  );
}

export function RememberProposal({
  proposal,
  siteId,
  rooms,
  onSaved,
}: {
  proposal: NotedProposal;
  siteId: string;
  /** The boende's rooms, offered as chips in the sheet. */
  rooms: readonly string[];
  onSaved: (saved: Remembered, name: string) => void;
}) {
  const ids = useId();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(proposal.name);
  const [room, setRoom] = useState(proposal.room ?? "");
  const [part, setPart] = useState(proposal.part ?? "");
  const [errors, setErrors] = useState<Fields>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const roomRef = useRef<HTMLInputElement>(null);

  async function save(values: { name: string; room: string; part: string }): Promise<boolean> {
    if (saving) return false;
    setSaving(true);
    setNotice(null);
    let result: Result<Remembered>;
    try {
      result = await rememberThing({ siteId, name: values.name, room: values.room, part: values.part, category: proposal.category, replaces: proposal.moves?.id ?? null });
    } catch {
      result = fail("things_noted_failed");
    }
    setSaving(false);
    if (result.ok) {
      onSaved(result.data, values.name.trim());
      return true;
    }
    const fields = result.error.fields;
    if (fields && (fields.name || fields.room || fields.part)) {
      setErrors(fields);
      setOpen(true);
      // The first field that is wrong gets focus, so its message is read.
      (fields.name ? nameRef : roomRef).current?.focus();
      return false;
    }
    setNotice(result.error.message ?? errorMessages[result.error.code]);
    return false;
  }

  function openSheet() {
    setErrors({});
    setOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await save({ name, room, part })) setOpen(false);
  }

  const where = proposal.room ? (
    <>
      {proposal.room}
      {proposal.newRoom ? (
        <span className="ml-1.5 rounded-pill bg-mint px-1.5 align-[1px] text-meta font-semibold text-mint-ink" data-testid="proposal-new-room">
          {newRoomBadgeText}
        </span>
      ) : null}
      {proposal.part ? ` · ${proposal.part}` : null}
    </>
  ) : (
    chooseRoomText
  );
  const known = (option: string) => normalizePlaceName(option) === normalizePlaceName(room);

  return (
    <div data-testid="chat-proposal">
      <div className="mt-2 flex items-center gap-2.5 rounded-md border border-border bg-surface p-2.5">
        <NotedTile className="size-tile" />
        <span className="flex min-w-0 flex-col">
          <span className="text-row-title wrap-break-word text-ink" data-testid="proposal-name">
            {proposal.name}
          </span>
          <span className="text-meta wrap-break-word text-ink-2" data-testid="proposal-where">
            {where}
          </span>
        </span>
      </div>
      {proposal.moves ? <p className="mt-2 text-meta text-ink-2">{movedFromText(proposal.moves)}</p> : null}
      {notice ? (
        <div className="mt-2">
          <Notice role="alert">{notice}</Notice>
        </div>
      ) : null}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Button
          variant="compact-primary"
          aria-disabled={saving || undefined}
          onClick={() => (proposal.room ? void save({ name: proposal.name, room: proposal.room, part: proposal.part ?? "" }) : openSheet())}
          data-testid="proposal-save"
        >
          {saving ? savingNotedText : proposal.room ? rememberText : chooseRoomText}
        </Button>
        <Button variant="compact" onClick={openSheet} disabled={saving} data-testid="proposal-edit">
          {editProposalText}
        </Button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title={proposal.name} closeLabel="Avbryt" preventClose={saving}>
        <form onSubmit={submit} noValidate aria-busy={saving || undefined} className="flex flex-col gap-4">
          {notice ? <Notice role="alert">{notice}</Notice> : null}
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor={`${ids}-name`}>{notedNameLabel}</FieldLabel>
            <Input
              ref={nameRef}
              id={`${ids}-name`}
              autoComplete="off"
              maxLength={maxThingNameChars * 2}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setErrors((all) => ({ ...all, name: undefined }));
              }}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? `${ids}-name-error` : undefined}
            />
            {errors.name ? <FieldError id={`${ids}-name-error`}>{errors.name}</FieldError> : null}
          </div>
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor={`${ids}-room`}>{notedRoomLabel}</FieldLabel>
            <Input
              ref={roomRef}
              id={`${ids}-room`}
              autoComplete="off"
              maxLength={maxPlaceNameChars * 2}
              value={room}
              onChange={(event) => {
                setRoom(event.target.value);
                setErrors((all) => ({ ...all, room: undefined }));
              }}
              aria-invalid={errors.room ? true : undefined}
              aria-describedby={errors.room ? `${ids}-room-error` : undefined}
            />
            {errors.room ? <FieldError id={`${ids}-room-error`}>{errors.room}</FieldError> : null}
            {rooms.length > 0 ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label={yourRoomsLabel}>
                {rooms.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={known(option)}
                    onClick={() => {
                      setRoom(option);
                      setErrors((all) => ({ ...all, room: undefined }));
                    }}
                    className="group flex min-h-tap shrink-0 items-center rounded-pill outline-none"
                    data-testid="proposal-room-chip"
                  >
                    <span
                      className={cx(
                        "flex h-[34px] items-center rounded-pill px-[14px] text-meta font-semibold group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent",
                        known(option) ? "bg-accent text-on-accent" : "bg-bg text-ink-2",
                      )}
                    >
                      {option}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor={`${ids}-part`}>
              {notedPartLabel} <span className="font-normal text-ink-3">{optionalText}</span>
            </FieldLabel>
            <Input
              id={`${ids}-part`}
              autoComplete="off"
              maxLength={maxPlaceNameChars * 2}
              placeholder={notedPartPlaceholder}
              value={part}
              onChange={(event) => {
                setPart(event.target.value);
                setErrors((all) => ({ ...all, part: undefined }));
              }}
              aria-invalid={errors.part ? true : undefined}
              aria-describedby={errors.part ? `${ids}-part-error` : undefined}
            />
            {errors.part ? <FieldError id={`${ids}-part-error`}>{errors.part}</FieldError> : null}
          </div>
          <Button type="submit" fullWidth aria-disabled={saving || undefined} data-testid="proposal-sheet-save">
            {saving ? savingNotedText : rememberText}
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
