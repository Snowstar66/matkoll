"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/button";
import { ChevronRightIcon } from "@/components/icons";
import { ListGroup } from "@/components/list-group";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { fail, type Result } from "@/lib/errors";
import { createThingBox } from "../actions/create-box";
import {
  closedBoxesHintText,
  closedBoxesText,
  closedBoxesTitle,
  closedBoxMeta,
  cropStyle,
  photographInsideText,
  type ClosedBox,
} from "../domain/thing-closed";
import { maxPlaceNameChars } from "../domain/thing-place";

// The row "3 lådor där innehållet inte syns" and its sheet (Pontus 6 Nov): each
// closed box the AI named is listed with its crop of the card, its name, where
// it stands, the day of the card and "Fota insidan". The button makes the box
// (a place of its own, like "Lägg till låda") and opens the room's page with
// the camera ready for it (`?fota=<box>`).

export type ClosedBoxesProps = {
  /** The place the boxes are added to (a part or the whole room). */
  placeId: string;
  /** The room's page, where the camera of a new box is offered. */
  roomHref: string;
  boxes: readonly ClosedBox[];
};

/** The row of the closed boxes, shared with the sheet that names a box by hand: readable, never cut, with a chevron. */
export function ClosedRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="unseen-note"
      className="flex min-h-tap w-full items-center gap-2 rounded-lg bg-surface px-4 py-3 text-left text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className="min-w-0 flex-1 wrap-break-word">{label}</span>
      <ChevronRightIcon size={20} aria-hidden="true" className="shrink-0 text-ink-3" />
    </button>
  );
}

export function ClosedBoxes({ placeId, roomHref, boxes }: ClosedBoxesProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function photograph(box: ClosedBox) {
    if (busy) return;
    setBusy(box.id);
    setNotice(null);
    let result: Result<{ id: string }>;
    try {
      result = await createThingBox({ placeId, name: Array.from(box.name).slice(0, maxPlaceNameChars).join("") });
    } catch {
      result = fail("things_place_failed");
      router.refresh();
    }
    setBusy(null);
    if (result.ok) {
      setOpen(false);
      router.push(`${roomHref}?fota=${result.data.id}`);
      return;
    }
    if (result.error.code === "unauthorized" || result.error.code === "things_place_gone") router.refresh();
    setNotice(result.error.fields?.name ?? result.error.message);
  }

  return (
    <>
      <ClosedRow
        label={closedBoxesText(boxes.length)}
        onClick={() => {
          setNotice(null);
          setOpen(true);
        }}
      />
      <Sheet open={open} onClose={() => setOpen(false)} title={closedBoxesTitle} closeLabel="Klar" preventClose={busy !== null}>
        <div className="flex flex-col gap-4">
          {notice ? <Notice role="alert">{notice}</Notice> : null}
          <p className="text-meta text-ink-3">{closedBoxesHintText}</p>
          <ListGroup label={closedBoxesTitle}>
            {boxes.map((box) => (
              <li key={box.id} className="flex flex-col gap-2 px-3 py-3" data-testid="closed-box">
                <div className="flex items-center gap-3">
                  <Crop box={box} />
                  <div className="min-w-0 flex-1">
                    <p className="text-row-title wrap-break-word text-ink">{box.name}</p>
                    <p className="text-meta text-ink-3">{closedBoxMeta(box)}</p>
                  </div>
                </div>
                <Button variant="secondary" fullWidth onClick={() => void photograph(box)} disabled={busy !== null} aria-label={`${photographInsideText}: ${box.name}`} data-testid="photograph-inside">
                  {busy === box.id ? "Öppnar …" : photographInsideText}
                </Button>
              </li>
            ))}
          </ListGroup>
        </div>
      </Sheet>
    </>
  );
}

/** The crop of the card around the box's marker, 64 px square at most; without a marker the whole card. */
function Crop({ box }: { box: ClosedBox }) {
  const src = `/api/things/photo/${box.cardId}`;
  const frame = "flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-border";
  if (!box.box) {
    return (
      <span className={frame} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      </span>
    );
  }
  const crop = cropStyle(box.box, box.photoWidth, box.photoHeight);
  return (
    <span className={frame} aria-hidden="true">
      <span className="relative block max-h-full max-w-full overflow-hidden" style={{ aspectRatio: crop.aspect, height: crop.aspect < 1 ? "100%" : undefined, width: crop.aspect >= 1 ? "100%" : undefined }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" loading="lazy" className="absolute max-w-none" style={{ left: crop.left, top: crop.top, width: crop.width, height: crop.height }} />
      </span>
    </span>
  );
}
