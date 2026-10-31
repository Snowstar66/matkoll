"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { useAiJobs } from "@/lib/ai-jobs-client";
import { cardFailureText, retryText, shortDateText } from "../domain/thing-photo";
import { cardMeta, type RoomCard } from "../domain/thing-room";
import { errorMessages, fail, isErrorCode, type AppError, type Result } from "@/lib/errors";
import type { AiJob } from "@/lib/ai-job-shape";
import Link from "next/link";
import { writtenEditText, writtenMeta, type WrittenBox } from "../domain/thing-written";
import { AddCardThings } from "./add-card-things";
import { RemoveCard } from "./remove-card";
import { RetakeCard } from "./retake-card";
import { AiWorking } from "@/components/ai-working";
import { thingNoun } from "../domain/thing-noun";
import { cardViewHref } from "../domain/thing-card";

/** The input of a card is always its photo. */
const cardSteps = ["Tittar på kortet …", `Hittar ${thingNoun.definitePlural} …`];

// The room's cards (Story 18.12): thumbnails in two columns, each with what it
// shows ("Hela rummet", "Väggen", "Låda: Black box"), its number of things and
// its date, and "Ta om" (Story 18.11) and "Ta bort" (Story 18.3, with "Ångra").
// A card being read says so; one whose reading did not go has "Försök igen".
// The thumbnail of a read card opens it big, whole and with its föremål marked
// (Story 18.7); the ⤢ in its corner says so.

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

export function RoomCards({
  cards,
  written = [],
  menuFor,
}: {
  cards: readonly RoomCard[];
  written?: readonly WrittenBox[];
  /** The ⋯ of a place's label (Story 18.16): "Byt namn" and "Ta bort" for a part or a box; `null` for the whole room. */
  menuFor?: (placeId: string) => ReactNode;
}) {
  if (cards.length === 0 && written.length === 0) return <Notice>Inga kort än. Tryck på Ta foto eller Välj från Bilder ovanför.</Notice>;
  return (
    <ul role="list" className="grid grid-cols-2 gap-2.5" data-testid="room-cards">
      {cards.map((card) => (
        <li key={card.id} className="flex flex-col overflow-hidden rounded-md bg-surface" data-testid="room-card">
          {card.status === "done" ? (
            <Link href={cardViewHref(card.id)} className="relative block focus-visible:-outline-offset-2" aria-label={`Visa kortet ${card.label}`} data-testid="open-card">
              {/* The photo is served by the route that checks the user; nothing is fetched from anywhere else. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/things/photo/${card.id}`} alt={`Kort: ${card.label}`} loading="lazy" className="h-24 w-full bg-border object-cover" />
              <span
                aria-hidden="true"
                className="absolute right-1.5 bottom-1.5 flex size-6.5 items-center justify-center rounded-full bg-photo-chip text-meta leading-none text-photo-mark"
              >
                ⤢
              </span>
            </Link>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/things/photo/${card.id}`} alt={`Kort: ${card.label}`} loading="lazy" className="h-24 w-full bg-border object-cover" />
          )}
          <div className="flex flex-col px-2.5 py-2">
            <div className="-my-1 flex items-start justify-between gap-1">
              <p className="py-1 text-meta font-semibold wrap-break-word text-ink">{card.label}</p>
              {menuFor?.(card.placeId)}
            </div>
            {card.status === "reading" ? (
              <AiWorking size="sm" steps={cardSteps} />
            ) : (
              <p className="text-meta text-ink-3">{card.status === "done" ? cardMeta(card) : `Kunde inte läsas · ${shortDateText(card.takenAt)}`}</p>
            )}
            {card.status === "failed" ? (
              <p className="text-meta text-ink-2">{cardFailureText(card.errorCode && isErrorCode(card.errorCode) ? card.errorCode : null)}</p>
            ) : null}
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-x-1 px-1 pb-1">
            {card.status === "done" ? (
              <>
                <RetakeCard cardId={card.id} placeId={card.placeId} name={card.label} />
                <AddCardThings cardId={card.id} name={card.label} />
                <RemoveCard cardId={card.id} takenAt={card.takenAt} compact name={card.label} />
              </>
            ) : null}
            {card.status !== "done" ? (
              <>
                {card.status === "failed" ? <RetryCard id={card.id} /> : null}
                <RemoveCard cardId={card.id} takenAt={card.takenAt} compact name={card.label} />
              </>
            ) : null}
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
            <div className="-my-1 flex items-start justify-between gap-1">
              <p className="py-1 text-meta font-semibold wrap-break-word text-ink">{`Låda: ${box.part}`}</p>
              {menuFor?.(box.placeId)}
            </div>
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
