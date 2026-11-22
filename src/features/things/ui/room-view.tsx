"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { useState } from "react";
import { ChoiceRows } from "@/components/choice-rows";
import { Sheet } from "@/components/sheet";
import { EmptyState } from "@/components/empty-state";
import { ChevronDownIcon, GridIcon, ListIcon } from "@/components/icons";
import { Segment, type SegmentOption } from "@/components/segment";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import { isActive, type AiJob } from "@/lib/ai-job-shape";
import { useAiJobs, useOnAiJobsFinished, useShowingAiResults } from "@/lib/ai-jobs-client";
import { unseenText, type ThingCategory } from "../domain/thing";
import { type ClosedBox } from "../domain/thing-closed";
import { moreCardsText } from "../domain/capture";
import { isJobInRoom } from "../domain/thing-news";
import { parseRoomGrouping, parseRoomView, type RoomCard, type RoomGrouping, type RoomSummary, type RoomView as View } from "../domain/thing-room";
import { boxesLabelText, boxMeta, type WrittenBox, writeInsteadText } from "../domain/thing-written";
import Link from "next/link";
import { buttonClasses } from "@/components/button";
import { AddBox } from "./add-box";
import { ClosedBoxes } from "./closed-boxes";
import { useRoomGroupingStored, useRoomViewStored } from "./device-store";
import { PlaceMenu } from "./place-menu";
import type { PlaceCounts } from "../domain/thing-place-edit";
import { partsLabelText, partMeta } from "../domain/thing-written";
import { useRemovedThings } from "./removed-things";
import { roomMemoryKey, useRoomScroll } from "./room-memory";
import { RoomCards } from "./room-cards";
import { RemoveRoomButton } from "./remove-room";
import { RoomCategories } from "./room-categories";
import { RoomPhotos } from "./room-photos";
import { TakeCard } from "./take-card";
import { UploadCardRow } from "./upload-card-row";
import { appName } from "@/app/app-info";
import { thingNoun } from "../domain/thing-noun";

// A room's page (Story 18.12): the one camera "Fota" with "Välj från album"
// (Pontus 6 Nov), and the icon switch between Lista (the room's merged things
// per category, folded in) and Kort (the cards as thumbnails), the choice kept
// on the device like Recept's. While a card is being read the page reads itself
// again every few seconds, and when a job of this room finishes.

export type RoomViewProps = {
  siteId: string;
  summary: RoomSummary;
  categories: { category: ThingCategory; things: number }[];
  cards: RoomCard[];
  /** The closed boxes the AI named, each with its crop (Pontus 6 Nov). */
  closedBoxes: readonly ClosedBox[];
  /** The boxes with things written into them (Story 18.13). */
  written: WrittenBox[];
  /** Every room of the boende, for the sheet of "Ta fler kort". */
  rooms: readonly string[];
  /** The place the room's boxes are added to (a part or the whole room), if it has one. */
  boxParent: string | null;
  /** A box made a moment ago (`?fota=`): its camera is offered at once. */
  photographBox: { id: string; name: string } | null;
  initialView: View;
  placeIds: readonly string[];
  /** The room's boxes, each opening its page (Story 18.13). */
  boxes: readonly { id: string; part: string | null }[];
  /** The room's parts (not the whole room), each with a ⋯ (Story 18.16). */
  parts: readonly { id: string; part: string }[];
  /** What removing each place takes, by place id. */
  placeCounts: Record<string, PlaceCounts>;
  /** How many places the room has: the last one takes the room with it. */
  placeTotal: number;
  /** No föremål and no card: the room ends with "Ta bort rummet" (Pontus 1 Nov). */
  empty?: boolean;
};

const views: readonly SegmentOption<View>[] = [
  { value: "things", icon: <ListIcon size={18} />, iconOnly: true, label: "Lista" },
  { value: "cards", icon: <GridIcon size={18} />, iconOnly: true, label: "Kort" },
];

const groupings: readonly { value: RoomGrouping; label: string }[] = [
  { value: "photo", label: "Per foto" },
  { value: "category", label: "Per kategori" },
];

/** "Per foto ▾": a small pill that opens the two ways to group the föremål; the choice is kept on the device as before. */
function GroupingPill({ grouping, onChange }: { grouping: RoomGrouping; onChange: (value: RoomGrouping) => void }) {
  const [open, setOpen] = useState(false);
  const current = groupings.find((entry) => entry.value === grouping)?.label ?? groupings[0].label;
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`Visa föremålen: ${current}`}
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border bg-surface pl-3.5 pr-2.5 text-control font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        data-testid="room-grouping"
      >
        {current}
        <ChevronDownIcon size={16} className="text-ink-3" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Visa föremålen" closeLabel="Klar">
        <ChoiceRows
          label="Visa föremålen"
          options={groupings}
          value={grouping}
          onChange={onChange}
          onPick={(value) => {
            onChange(value);
            setOpen(false);
          }}
        />
      </Sheet>
    </>
  );
}

/** How often a page with a card being read reads itself again. */
const refreshMs = 3_000;

export function RoomView({ siteId, summary, categories, cards, closedBoxes, written, rooms, boxParent, photographBox, initialView, placeIds, boxes, parts, placeCounts, placeTotal, empty = false }: RoomViewProps) {
  const router = useRouter();
  // Tillbaka from a card keeps the scroll position of the room (C1).
  useRoomScroll(roomMemoryKey(siteId, summary.key));
  const { jobs, markSeen } = useAiJobs();
  const [stored, setStored] = useRoomViewStored();
  // The choice of this device (like Recept's Kort och Lista); the address's `vy` is the first one.
  const view: View = stored === null ? initialView : parseRoomView(stored);
  const setStoredView = (next: View) => setStored(next);
  // Per foto is the first choice (Pontus 20 Nov); the choice of this device is kept.
  const [storedGrouping, setStoredGrouping] = useRoomGroupingStored();
  const grouping: RoomGrouping = parseRoomGrouping(storedGrouping);
  // A föremål just removed keeps its row for "Ångra", even when it was the room's last.
  const hasRemoved = useRemovedThings().length > 0;
  const reading = cards.some((card) => card.status === "reading");

  // The results of this tab's jobs are on this page, so no confirmation says what is already here.
  useShowingAiResults("things");
  // A card moved here with its room (Byt namn på rummet) is found by its id.
  const cardIds = useMemo(() => cards.map((card) => card.id), [cards]);
  useEffect(() => {
    for (const job of jobs) {
      if (job.kind === "things" && isJobInRoom(job, placeIds, cardIds) && !job.seen && !isActive(job)) {
        void markSeen(job.id);
      }
    }
  }, [jobs, placeIds, cardIds, markSeen]);
  useOnAiJobsFinished(
    useCallback(
      (finished: AiJob[]) => {
        if (finished.some((job) => job.kind === "things" && isJobInRoom(job, placeIds, cardIds))) router.refresh();
      },
      [router, placeIds, cardIds],
    ),
  );
  useEffect(() => {
    if (!reading) return;
    const timer = window.setInterval(() => router.refresh(), refreshMs);
    return () => window.clearInterval(timer);
  }, [reading, router]);

  const unseen = unseenText(
    cards.filter((card) => card.status === "done").reduce((sum, card) => sum + card.unseenCount, 0),
    cards.find((card) => card.status === "done" && card.unseenNote)?.unseenNote ?? null,
  );
  const noCounts: PlaceCounts = { things: 0, cards: 0 };
  const menuFor = (id: string, part: string, box: boolean) => (
    <PlaceMenu placeId={id} part={part} box={box} counts={placeCounts[id] ?? noCounts} roomHasOthers={placeTotal > 1} />
  );
  // The ⋯ of a card's label: for a part or a box, not for the whole room.
  const cardMenu = (placeId: string) => {
    const box = boxes.find((entry) => entry.id === placeId);
    if (box?.part) return menuFor(box.id, box.part, true);
    const part = parts.find((entry) => entry.id === placeId);
    return part ? menuFor(part.id, part.part, false) : null;
  };
  const roomHref = `/prylar/rum/${siteId}/${encodeURIComponent(summary.key)}`;

  return (
    <div className="flex flex-col gap-3" data-testid="room">
      {photographBox ? (
        <>
          <UploadCardRow placeId={photographBox.id} title={`Fota insidan av ${photographBox.name}`} />
          <Link href={`/prylar/lada/${photographBox.id}`} className={buttonClasses("secondary", true)} data-testid="write-box">
            {writeInsteadText}
          </Link>
        </>
      ) : null}
      <TakeCard
        siteId={siteId}
        rooms={rooms}
        defaultRoom={summary.room}
        variant="default"
        layout="room"
        title={moreCardsText}
      />
      {/* One slim row: how the föremål are grouped (Per foto / Per kategori) on the left, Lista / Kort on the right. */}
      <div className="flex min-h-9 items-center justify-between gap-2" data-testid="room-toolbar">
        {view === "things" && summary.things > 0 ? <GroupingPill grouping={grouping} onChange={setStoredGrouping} /> : <span />}
        <Segment<View> size="small" label="Visa" value={view} onChange={setStoredView} options={views} />
      </div>
      {view === "things" ? (
        <>
          {summary.things === 0 && !hasRemoved ? (
            <div data-testid="room-empty">
              <EmptyState className="py-8">
                {summary.cards === 0 ? `Inget kort än. Fota en hylla, så listar ${appName} vad som finns.` : `Inga ${thingNoun.plural} hittades på korten.`}
              </EmptyState>
            </div>
          ) : (
            <>
              {grouping === "photo" ? (
                <RoomPhotos siteId={siteId} roomKey={summary.key} cards={cards} />
              ) : (
                <RoomCategories siteId={siteId} roomKey={summary.key} categories={categories} />
              )}
            </>
          )}
          {boxes.length > 0 ? (
            <section className="flex flex-col gap-1.5" data-testid="room-boxes">
              <h2 className="px-1 text-section-label text-ink-2">{boxesLabelText}</h2>
              <ListGroup label={boxesLabelText}>
                {boxes.map((box) => (
                  <ListRow
                    key={box.id}
                    href={`/prylar/lada/${box.id}`}
                    title={box.part ?? boxesLabelText}
                    meta={boxMeta({
                      cards: cards.filter((card) => card.placeId === box.id && card.status === "done").length,
                      written: written.find((entry) => entry.placeId === box.id)?.things ?? 0,
                    })}
                    pressProps={{ "data-testid": "room-box" }}
                    trailing={box.part ? menuFor(box.id, box.part, true) : undefined}
                  />
                ))}
              </ListGroup>
            </section>
          ) : null}
          {parts.length > 0 ? (
            <section className="flex flex-col gap-1.5" data-testid="room-parts">
              <h2 className="px-1 text-section-label text-ink-2">{partsLabelText}</h2>
              <ListGroup label={partsLabelText}>
                {parts.map((place) => (
                  <ListRow
                    key={place.id}
                    title={place.part}
                    meta={partMeta(placeCounts[place.id] ?? noCounts)}
                    data-testid="room-part"
                    trailing={menuFor(place.id, place.part, false)}
                  />
                ))}
              </ListGroup>
            </section>
          ) : null}
          {boxParent && closedBoxes.length > 0 ? <ClosedBoxes placeId={boxParent} roomHref={roomHref} boxes={closedBoxes} /> : null}
          {boxParent && closedBoxes.length === 0 && unseen ? <AddBox placeId={boxParent} variant="row" label={unseen} roomHref={roomHref} /> : null}
          {boxParent ? <AddBox placeId={boxParent} variant="button" roomHref={roomHref} /> : null}
        </>
      ) : (
        <RoomCards cards={cards} written={written} menuFor={cardMenu} />
      )}
      {empty ? <RemoveRoomButton siteId={siteId} roomKey={summary.key} room={summary.room} /> : null}
    </div>
  );
}
