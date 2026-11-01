"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, useCallback, useId, useRef, useState } from "react";
import { Button } from "@/components/button";
import { cx } from "@/components/cx";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { Chip } from "@/components/chip";
import { Segment } from "@/components/segment";
import { Notice } from "@/components/notice";
import { PhotoRow } from "@/components/photo-row";
import { Sheet } from "@/components/sheet";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import { useOnAiJobsFinished, useShowingAiResults } from "@/lib/ai-jobs-client";
import type { AiJob } from "@/lib/ai-job-shape";
import { errorMessages, fail, type AppError, type Result } from "@/lib/errors";
import { ensureCapturePlace } from "../actions/capture-place";
import {
  captureHintText,
  captureTitle,
  emptyCaptureRoomText,
  exactPlaceText,
  newRoomText,
  openCameraText,
  pickerAccept,
  pickImagesText,
  roomExactText,
  skippedImageText,
  sendingText,
  sentText,
  takeAnotherText,
  type CaptureInput,
} from "../domain/capture";
import { maxPlaceNameChars, normalizePlaceName } from "../domain/thing-place";
import { useLastRoom } from "./device-store";
import { useCardUpload } from "./use-card-upload";

// "Ta kort" (Story 18.11): the first row of Förråd, and the two buttons on a
// room's page (Story 18.16). A sheet asks only where the card is taken: the room
// (the last used one is chosen), and, folded out, a part or a box; without either
// the card goes to the whole room. Under that, two equal buttons: "Ta foto" opens
// the back camera on a phone (on a desktop it is the same as the next) and "Välj
// från Bilder" takes several images from the photo library (the file window on a
// desktop). On a room's page the same two buttons are on the page itself, since
// the room is chosen; "Mer exakt plats …" there opens the sheet. Every image is
// its own card, read by the AI in the background, and after a card from the
// camera "Ta ett till" opens the camera again for the same place. The inputs are
// always in the page and clicked in the tap itself (iOS Safari refuses an input
// that no tap opened); the place is made once the images are chosen.

export type TakeCardProps = {
  siteId: string;
  /** The rooms the boende has, once each. */
  rooms: readonly string[];
  /** A room's page: its own room is chosen, whatever was used last. */
  defaultRoom?: string;
  variant: "primary" | "default";
  /** "room": the two buttons are on the page itself (a room's page), the room being `defaultRoom`. */
  layout?: "row" | "room";
  title: string;
  /** The line under the title. */
  sub?: string;
  /** The row is hidden (not unmounted), so a card being sent keeps its state and status. */
  hideRow?: boolean;
};

const newRoom = "\u0000new";

type Where = { siteId: string; room: string; part: string; box: boolean };

export function TakeCard({ siteId, rooms, defaultRoom, variant, layout = "row", title, sub, hideRow = false }: TakeCardProps) {
  const router = useRouter();
  const touch = useCoarsePointer();
  const ids = useId();
  const [last, setLast] = useLastRoom(siteId);
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const newRoomRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<string>(newRoom);
  const [typedRoom, setTypedRoom] = useState("");
  const [exactOpen, setExactOpen] = useState(false);
  const [box, setBox] = useState<"part" | "box">("part");
  const [part, setPart] = useState("");
  const [errors, setErrors] = useState<{ room?: string; part?: string }>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  // What the images being chosen are for, and the place once it is made (for "Ta ett till").
  const where = useRef<Where | null>(null);
  const placeId = useRef<string | null>(null);
  const reuse = useRef(false);
  const [viaCamera, setViaCamera] = useState(false);
  const refresh = useCallback(() => router.refresh(), [router]);
  const upload = useCardUpload(refresh);
  const [problem, setProblem] = useState<AppError | null>(null);

  // The results of this tab's jobs are shown by the page that reads itself again, so no confirmation says what is already there.
  useShowingAiResults("things");
  // A card that was read in the background: the rooms' counts are read again.
  useOnAiJobsFinished(
    useCallback(
      (finished: AiJob[]) => {
        if (finished.some((job) => job.kind === "things")) router.refresh();
      },
      [router],
    ),
  );

  function initialRoom(): string {
    const wanted = defaultRoom ?? last;
    const match = wanted ? rooms.find((room) => normalizePlaceName(room) === normalizePlaceName(wanted)) : undefined;
    return match ?? rooms[0] ?? newRoom;
  }

  function openSheet() {
    setChoice(initialRoom());
    setTypedRoom("");
    setExactOpen(false);
    setBox("part");
    setPart("");
    setErrors({});
    setNotice(null);
    setOpen(true);
  }

  function chosenRoom(): string {
    return choice === newRoom ? typedRoom.trim() : choice;
  }

  /**
   * The tap on "Ta foto" or "Välj från Bilder": checks the room, then opens the
   * input in this very tap (nothing is awaited before the click). `direct`: on a
   * room's page the room is the page's own.
   */
  function choose(camera: boolean, direct = false) {
    if (placing) return;
    const room = direct ? (defaultRoom ?? "") : chosenRoom();
    if (room === "") {
      setErrors({ room: emptyCaptureRoomText });
      newRoomRef.current?.focus();
      return;
    }
    const exact = !direct && exactOpen;
    where.current = { siteId, room, part: exact ? part : "", box: exact && box === "box" };
    reuse.current = false;
    setViaCamera(camera);
    // Without a camera input (a desktop) "Ta foto" is the file picker.
    (camera && cameraRef.current ? cameraRef : pickerRef).current?.click();
  }

  function another() {
    if (!placeId.current) return;
    reuse.current = true;
    setViaCamera(true);
    cameraRef.current?.click();
  }

  async function onChosen(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    const target = where.current;
    if (files.length === 0 || !target || placing) return;
    setProblem(null);
    let id = reuse.current ? placeId.current : null;
    if (!id) {
      setPlacing(true);
      let result: Result<{ placeId: string }>;
      try {
        result = await ensureCapturePlace({ siteId: target.siteId, room: target.room, part: target.part, box: target.box } satisfies CaptureInput);
      } catch {
        result = fail("things_place_failed");
      }
      setPlacing(false);
      if (!result.ok) {
        if (open) {
          const { fields, message } = result.error;
          if (fields?.room || fields?.part) setErrors({ room: fields.room, part: fields.part });
          else setNotice(message);
        } else {
          setProblem(result.error);
        }
        return;
      }
      id = result.data.placeId;
      placeId.current = id;
      setLast(target.room);
    }
    setOpen(false);
    await upload.send(files, { placeId: id });
    // A new room or place is in the list now.
    router.refresh();
  }

  const state = upload.state;
  const sending = placing || state.kind === "sending";
  return (
    <div className="flex flex-col gap-3" data-testid="take-card">
      {layout === "room" ? (
        <div className="flex flex-col gap-2 rounded-lg bg-surface p-3" data-testid="room-capture">
          <CaptureButtons disabled={sending} onChoose={(camera) => choose(camera, true)} />
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            {sub ? <p className="px-1 text-meta text-ink-3">{sub}</p> : <span />}
            <button
              type="button"
              disabled={sending}
              onClick={openSheet}
              className="flex min-h-tap items-center rounded-md px-1 text-meta font-medium text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
              data-testid="room-exact"
            >
              {roomExactText}
            </button>
          </div>
        </div>
      ) : (
        <PhotoRow title={title} onClick={openSheet} disabled={sending} hidden={hideRow} variant={variant === "primary" ? "primary" : "default"}>
          {sub ? <p className={cx("text-meta", variant === "primary" ? "text-on-accent opacity-85" : "text-ink-3")}>{sub}</p> : null}
        </PhotoRow>
      )}
      {/* Mounted empty, so the text is announced when it appears. */}
      <div role="status" className="flex flex-col gap-2" data-testid="take-card-status">
        {sending ? (
          <div className="flex flex-col gap-2">
            <p className="text-body text-ink">{state.kind === "sending" ? sendingText(state.done, state.total) : sendingText(0, 1)}</p>
            <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-hairline">
              <div className="h-full w-1/3 rounded-full bg-accent motion-safe:animate-progress" />
            </div>
          </div>
        ) : null}
        {state.kind === "sent" ? (
          <div className="flex flex-col gap-2">
            {state.count > 0 ? <p className="text-body text-ink">{sentText(state.count)}</p> : null}
            {viaCamera && touch ? (
              <Button variant="secondary" onClick={another} data-testid="take-another">
                {`\u{1F4F7} ${takeAnotherText}`}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {state.kind === "error" && state.skipped.length === 0 ? <Notice role="alert">{errorMessages[state.error.code]}</Notice> : null}
      {state.kind !== "idle" && state.kind !== "sending" && state.skipped.length > 0 ? (
        <Notice role="alert">
          {state.skipped.map((name) => (
            <span key={name} className="block">
              {skippedImageText(name)}
            </span>
          ))}
        </Notice>
      ) : null}
      {problem ? <Notice role="alert">{errorMessages[problem.code]}</Notice> : null}
      {touch ? (
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" tabIndex={-1} aria-hidden="true" className="sr-only" onChange={onChosen} />
      ) : null}
      <input ref={pickerRef} type="file" accept={pickerAccept} multiple tabIndex={-1} aria-hidden="true" className="sr-only" onChange={onChosen} />
      <Sheet open={open} onClose={() => setOpen(false)} title={captureTitle} closeLabel="Avbryt" preventClose={placing}>
        <div className="flex flex-col gap-4">
          {notice ? <Notice role="alert">{notice}</Notice> : null}
          <div className="flex flex-col gap-2">
            <p id={`${ids}-rooms`} className="px-1 text-section-label text-ink-2">
              Rum
            </p>
            <div role="radiogroup" aria-labelledby={`${ids}-rooms`} className="flex flex-wrap gap-2">
              {rooms.map((room) => (
                <Chip key={room} role="radio" aria-checked={choice === room} selected={choice === room} onClick={() => setChoice(room)}>
                  {room}
                </Chip>
              ))}
              <Chip role="radio" aria-checked={choice === newRoom} selected={choice === newRoom} dashed onClick={() => setChoice(newRoom)}>
                {newRoomText}
              </Chip>
            </div>
            {choice === newRoom ? (
              <div className="flex flex-col gap-2">
                <FieldLabel htmlFor={`${ids}-new`}>Nytt rum</FieldLabel>
                <Input
                  ref={newRoomRef}
                  id={`${ids}-new`}
                  placeholder="Skräpförrådet"
                  autoComplete="off"
                  maxLength={maxPlaceNameChars * 2}
                  value={typedRoom}
                  onChange={(event) => {
                    setTypedRoom(event.target.value);
                    setErrors((current) => ({ ...current, room: undefined }));
                  }}
                  aria-invalid={errors.room ? true : undefined}
                  aria-describedby={errors.room ? `${ids}-new-error` : undefined}
                />
              </div>
            ) : null}
            {errors.room ? <FieldError id={`${ids}-new-error`}>{errors.room}</FieldError> : null}
          </div>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              aria-expanded={exactOpen}
              aria-controls={`${ids}-exact`}
              onClick={() => setExactOpen((current) => !current)}
              className="flex min-h-tap items-center self-start rounded-md px-1 text-body font-medium text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {exactPlaceText} {exactOpen ? "▴" : "▾"}
            </button>
            <div id={`${ids}-exact`} hidden={!exactOpen} className="flex flex-col gap-3">
              <Segment
                label="Del eller låda"
                value={box}
                onChange={setBox}
                options={[
                  { value: "part", label: "Del" },
                  { value: "box", label: "Låda" },
                ]}
              />
              <div className="flex flex-col gap-2">
                <FieldLabel htmlFor={`${ids}-part`}>{box === "box" ? "Namn på lådan" : "Del av rummet"}</FieldLabel>
                <Input
                  id={`${ids}-part`}
                  placeholder={box === "box" ? "Blå backen" : "Översta hyllan"}
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
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <CaptureButtons disabled={placing} onChoose={(camera) => choose(camera)} />
            <p className="px-1 pt-1 text-center text-meta text-ink-3">{captureHintText}</p>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

/** The two equal buttons: "Ta foto" and "Välj från Bilder", side by side; their text wraps when it is large. */
function CaptureButtons({ disabled, onChoose }: { disabled?: boolean; onChoose: (camera: boolean) => void }) {
  const look = "h-auto min-h-button flex-col gap-0.5 px-2 py-3 text-center wrap-break-word";
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="secondary" fullWidth disabled={disabled} className={look} onClick={() => onChoose(true)} data-testid="open-camera">
        {openCameraText}
      </Button>
      <Button variant="secondary" fullWidth disabled={disabled} className={look} onClick={() => onChoose(false)} data-testid="pick-images">
        {pickImagesText}
      </Button>
    </div>
  );
}
