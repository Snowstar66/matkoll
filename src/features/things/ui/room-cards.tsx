"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { useAiJobs } from "@/lib/ai-jobs-client";
import { cardFailureText, retryText, shortDateText } from "../domain/thing-photo";
import { cardMeta, type RoomCard } from "../domain/thing-room";
import { errorMessages, fail, isErrorCode, type AppError, type Result } from "@/lib/errors";
import type { AiJob } from "@/lib/ai-job-shape";
import Link from "next/link";
import { writtenEditText, writtenMeta, type WrittenBox } from "../domain/thing-written";
import { RemoveCard } from "./remove-card";
import { RetakeCard } from "./retake-card";

// The room's cards (Story 18.12): thumbnails in two columns, each with what it
// shows ("Hela rummet", "Väggen", "Låda: Black box"), its number of things and
// its date, and "Ta om" (Story 18.11) and "Ta bort" (Story 18.3, with "Ångra").
// A card being read says so; one whose reading did not go has "Försök igen".

function RetryCard({ id }: { id: string }) {
  const router = useRouter();
  const { start } = useAiJobs();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<AppError | null>(null);

  async function retry() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    let answer: Result<{ job: AiJob }>;
    try {
      answer = await start("/api/things/retry", { card: id }, crypto.randomUUID());
    } catch {
      answer = fail("ai_unavailable");
    }
    setBusy(false);
    if (!answer.ok) setProblem(answer.error);
    router.refresh();
  }

  return (
    <>
      {problem ? <p role="alert" className="px-2.5 text-meta text-ink-2">{errorMessages[problem.code]}</p> : null}
      <Button variant="compact" onClick={retry} disabled={busy} data-testid="retry-card">
        {retryText}
      </Button>
    </>
  );
}

export function RoomCards({ cards, written = [] }: { cards: readonly RoomCard[]; written?: readonly WrittenBox[] }) {
  if (cards.length === 0 && written.length === 0) return <Notice>Inga kort än.</Notice>;
  return (
    <ul role="list" className="grid grid-cols-2 gap-2.5" data-testid="room-cards">
      {cards.map((card) => (
        <li key={card.id} className="flex flex-col overflow-hidden rounded-md bg-surface" data-testid="room-card">
          {/* The photo is served by the route that checks the user; nothing is fetched from anywhere else. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/things/photo/${card.id}`} alt={`Kort: ${card.label}`} loading="lazy" className="h-24 w-full bg-border object-cover" />
          <div className="flex flex-col px-2.5 py-2">
            <p className="text-meta font-semibold wrap-break-word text-ink">{card.label}</p>
            <p className="text-meta text-ink-3">
              {card.status === "done"
                ? cardMeta(card)
                : card.status === "reading"
                  ? "Tittar på kortet …"
                  : `Kunde inte läsas · ${shortDateText(card.takenAt)}`}
            </p>
            {card.status === "failed" ? (
              <p className="text-meta text-ink-2">{cardFailureText(card.errorCode && isErrorCode(card.errorCode) ? card.errorCode : null)}</p>
            ) : null}
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-x-1 px-1 pb-1">
            {card.status === "done" ? (
              <>
                <RetakeCard cardId={card.id} placeId={card.placeId} name={card.label} />
                <RemoveCard cardId={card.id} takenAt={card.takenAt} compact name={card.label} />
              </>
            ) : null}
            {card.status === "failed" ? <RetryCard id={card.id} /> : null}
          </div>
        </li>
      ))}
      {/* Things written into a box (Story 18.13) have no photo: the card is the box, with "Ändra". */}
      {written.map((box) => (
        <li key={box.placeId} className="flex flex-col overflow-hidden rounded-md bg-surface" data-testid="room-card-written">
          <div aria-hidden="true" className="flex h-24 w-full items-center justify-center bg-tile-clay text-section-title leading-none">
            {"\u{1F4E6}"}
          </div>
          <div className="flex flex-col px-2.5 py-2">
            <p className="text-meta font-semibold wrap-break-word text-ink">{`Låda: ${box.part}`}</p>
            <p className="text-meta text-ink-3">{writtenMeta(box)}</p>
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-x-1 px-1 pb-1">
            <Link
              href={`/prylar/lada/${box.placeId}`}
              className="inline-flex min-h-tap min-w-tap items-center justify-center rounded-md px-2 text-meta font-semibold text-accent"
              data-testid="edit-written"
            >
              {writtenEditText}
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
