"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Segment } from "@/components/segment";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import { isActive, type AiJob } from "@/lib/ai-job-shape";
import { useAiJobs, useOnAiJobsFinished, useShowingAiResults } from "@/lib/ai-jobs-client";
import { unseenText, type ThingCategory } from "../domain/thing";
import { moreCardsText } from "../domain/capture";
import { isJobInRoom } from "../domain/thing-news";
import { latestCardText } from "../domain/thing-photo";
import { type RoomCard, type RoomSummary, type RoomView as View } from "../domain/thing-room";
import { boxesLabelText, boxMeta, type WrittenBox, writeInsteadText } from "../domain/thing-written";
import Link from "next/link";
import { buttonClasses } from "@/components/button";
import { AddBox } from "./add-box";
import { PlaceMenu } from "./place-menu";
import type { PlaceCounts } from "../domain/thing-place-edit";
import { partsLabelText, partMeta } from "../domain/thing-written";
import { RoomCards } from "./room-cards";
import { RemoveRoomButton } from "./remove-room";
import { RoomCategories } from "./room-categories";
import { TakeCard } from "./take-card";
import { UploadCardRow } from "./upload-card-row";
import { appName } from "@/app/app-info";
import { thingNoun, thingNounCap } from "../domain/thing-noun";

// A room's page (Story 18.12): the summary (things, categories and cards), the
// buttons "Ta foto" and "Välj från Bilder" (Story 18.16) with the date of the newest card, and the segmented choice
// between Prylar (the room's merged things per category, folded in) and Kort
// (the cards as thumbnails). While a card is being read the page reads itself
// again every few seconds, and when a job of this room finishes.

export type RoomViewProps = {
  siteId: string;
  summary: RoomSummary;
  categories: { category: ThingCategory; things: number }[];
  cards: RoomCard[];
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

/** How often a page with a card being read reads itself again. */
const refreshMs = 3_000;

export function RoomView({ siteId, summary, categories, cards, written, rooms, boxParent, photographBox, initialView, placeIds, boxes, parts, placeCounts, placeTotal, empty = false }: RoomViewProps) {
  const router = useRouter();
  const { jobs, markSeen } = useAiJobs();
  const [view, setView] = useState<View>(initialView);
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
      <dl className="grid grid-cols-3 rounded-lg bg-surface p-3.5 text-center" data-testid="room-summary">
        <Stat value={summary.things} label={thingNoun.plural} />
        <Stat value={categories.length} label="kategorier" />
        <Stat value={summary.cards} label="kort" />
      </dl>
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
        sub={latestCardText(summary.latest)}
      />
      <Segment<View>
        label="Visa"
        value={view}
        onChange={setView}
        options={[
          { value: "things", label: thingNounCap.plural },
          { value: "cards", label: "Kort" },
        ]}
        className="w-full"
      />
      {view === "things" ? (
        <>
          {summary.things === 0 ? (
            <p className="px-1 text-body text-ink-2" data-testid="room-empty">
              {summary.cards === 0 ? `Inget kort än. Ta ett kort, så listar ${appName} vad som finns.` : `Inga ${thingNoun.plural} hittades på korten.`}
            </p>
          ) : (
            <RoomCategories siteId={siteId} roomKey={summary.key} categories={categories} />
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
          {unseen && boxParent ? <AddBox placeId={boxParent} variant="row" label={unseen} roomHref={roomHref} /> : null}
          {boxParent ? <AddBox placeId={boxParent} variant="button" roomHref={roomHref} /> : null}
        </>
      ) : (
        <RoomCards cards={cards} written={written} menuFor={cardMenu} />
      )}
      {empty ? <RemoveRoomButton siteId={siteId} roomKey={summary.key} room={summary.room} /> : null}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <dd className="text-section-title text-ink tabular-nums">{value}</dd>
      <dt className="text-meta text-ink-3">{label}</dt>
    </div>
  );
}
