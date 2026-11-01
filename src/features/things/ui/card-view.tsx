"use client";

import { useRouter } from "next/navigation";
import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiWorking } from "@/components/ai-working";
import { cx } from "@/components/cx";
import { CheckIcon, ChevronRightIcon } from "@/components/icons";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import type { ThingBox } from "@/lib/thing-box";
import { lookUpBox } from "./locate-client";
import {
  cardFailedViewText,
  cardHintText,
  cardReadingText,
  cardViewTitle,
  lookingText,
  markedText,
  notFoundOnCardText,
  thingAtPoint,
  type CardThing,
  type CardView as Card,
} from "../domain/thing-card";
import { thingNoun, thingNounCap } from "../domain/thing-noun";
import { countText } from "../domain/thing-count";
import { AddCardThings } from "./add-card-things";
import { RemoveCard } from "./remove-card";
import { RetakeCard } from "./retake-card";
import { ThingSheet } from "./thing-sheet";
import { openThingText } from "../domain/thing-edit";

// Kortet i stort (Story 18.7): the card's whole photo, never cropped, with a
// thin box and the name of every föremål that has a box, and the föremål listed
// under it (beside it on a desktop). A tap on a row or a box marks that föremål:
// its box is drawn thick and the rest of the photo is shaded; a second tap
// clears the mark. A föremål without a box (a card read before the boxes came)
// is looked up with one small AI call the first time it is marked ("Letar …");
// when that finds nothing it says so. The › at the end of a row opens the
// föremål's sheet (Pontus 1 Nov: count, name, Ta bort föremålet), as in the room
// and in search. The card's buttons (Ta om, Lägg till föremål, Ta bort kortet
// last) are here too.

/** A box's place on the photo, in percent. */
function boxStyle(box: ThingBox) {
  const percent = (fraction: number) => `${Math.round(fraction * 100_000) / 1_000}%`;
  return { left: percent(box.left), top: percent(box.top), width: percent(box.width), height: percent(box.height) };
}

function CardPhoto({
  card,
  things,
  selected,
  looking,
  onPick,
}: {
  card: Card;
  things: readonly CardThing[];
  selected: CardThing | null;
  looking: boolean;
  onPick: (id: string) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);

  // A tap on the photo marks the smallest box under it; the list is the way for a keyboard and a screen reader.
  function onClick(event: MouseEvent<HTMLDivElement>) {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const hit = thingAtPoint(things, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
    if (hit) onPick(hit.id);
  }

  return (
    // A pointer shortcut only: the list under the photo does the same for a keyboard and a screen reader.
    <div
      ref={frame}
      onClick={onClick}
      // At most half the screen high on a phone (a portrait card would leave no room for the list), and more on a desktop; the width follows, so the boxes stay on their föremål.
      className="relative mx-auto max-w-full overflow-hidden rounded-md bg-border select-none [--photo-max-h:50svh] desktop:[--photo-max-h:75svh]"
      style={{ aspectRatio: `${card.width} / ${card.height}`, width: `min(100%, calc(var(--photo-max-h) * ${card.width / card.height}))` }}
      data-testid="card-photo"
    >
      {/* The photo is served by the route that checks the user; nothing is fetched from anywhere else. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/things/photo/${card.id}`} alt={`Kort: ${cardViewTitle(card)}`} className="absolute inset-0 size-full object-contain" draggable={false} />
      {looking ? <div aria-hidden="true" className="absolute inset-0 bg-photo-veil" /> : null}
      {things.map((thing) => {
        if (!thing.box) return null;
        const isSelected = selected?.id === thing.id;
        const dimmed = selected !== null && !isSelected;
        return (
          <div
            key={thing.id}
            aria-hidden="true"
            data-testid={isSelected ? "card-box-selected" : "card-box"}
            className={cx(
              "pointer-events-none absolute",
              isSelected
                ? "z-10 rounded-[6px] border-3 border-photo-mark shadow-[0_0_0_2px_var(--accent),0_0_0_9999px_var(--photo-shade)]"
                : "rounded-[4px] border-[1.5px] border-photo-mark shadow-[0_0_0_1px_var(--photo-edge)]",
              dimmed && "opacity-35",
            )}
            style={boxStyle(thing.box)}
          >
            {isSelected ? (
              <span
                className={cx(
                  "absolute max-w-56 truncate rounded-[6px] bg-accent px-1.5 py-0.5 text-meta font-semibold text-on-accent",
                  // Under the box when it is at the top of the photo, and anchored right near its right edge, so the name is never cut off.
                  thing.box.top < 0.1 ? "top-full mt-1" : "bottom-full mb-1",
                  thing.box.left > 0.6 ? "-right-[3px]" : "-left-[3px]",
                )}
              >
                {thing.name}
              </span>
            ) : dimmed ? null : (
              <span className="absolute top-0 left-0 max-w-[max(100%,60px)] truncate rounded-[0_0_5px_0] bg-photo-chip px-1 text-[10.5px] leading-[1.35] font-semibold text-photo-mark">
                {thing.name}
              </span>
            )}
          </div>
        );
      })}
      {looking ? (
        <div className="absolute top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface py-2 pr-3.5 pl-2.5" data-testid="card-looking">
          <AiWorking size="sm" label={lookingText} />
        </div>
      ) : null}
    </div>
  );
}

function ThingRowTitle({ thing, selected }: { thing: CardThing; selected: boolean }) {
  return (
    <span className="flex items-baseline justify-between gap-3">
      <span className={cx("min-w-0 wrap-break-word", selected ? "font-semibold text-mint-ink" : "font-normal")}>{thing.name}</span>
      {thing.whereHint || thing.quantity != null ? (
        <span className={cx("max-w-[45%] shrink-0 text-right text-meta font-normal", selected ? "text-mint-ink" : "text-ink-3")}>
          {/* Story 18.23: the count the card shows, first. */}
          {[thing.quantity != null ? countText(thing.quantity) : null, thing.whereHint].filter(Boolean).join(" · ")}
        </span>
      ) : null}
    </span>
  );
}

export function CardView({ card, initialThingId, roomHref }: { card: Card; initialThingId: string | null; roomHref: string }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    initialThingId && card.things.some((thing) => thing.id === initialThingId) ? initialThingId : null,
  );
  // What this visit's lookups gave: a box, or null when it could not be pointed out (also when the AI did not answer).
  const [found, setFound] = useState<Record<string, ThingBox | null>>({});
  const asked = useRef(new Set<string>());

  const things = useMemo(
    () => card.things.map((thing) => (thing.id in found ? { ...thing, box: found[thing.id] } : thing)),
    [card.things, found],
  );
  const selected = things.find((thing) => thing.id === selectedId) ?? null;
  const needsLookup = selected !== null && selected.box === null && !selected.boxMissed && !(selected.id in found);
  const missed = selected !== null && selected.box === null && !needsLookup;

  // A marked föremål without a box is looked up once per visit; the answer is saved by the server.
  useEffect(() => {
    if (!needsLookup || !selected || asked.current.has(selected.id)) return;
    const id = selected.id;
    asked.current.add(id);
    lookUpBox(id)
      .then((result) => setFound((all) => ({ ...all, [id]: result.ok ? result.data.box : null })))
      .catch(() => setFound((all) => ({ ...all, [id]: null })));
  }, [needsLookup, selected]);

  const pick = useCallback((id: string) => setSelectedId((current) => (current === id ? null : id)), []);
  // The föremål's sheet; kept while it closes, so its text does not blank during the animation.
  const [sheetThing, setSheetThing] = useState<CardThing | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const openSheet = (thing: CardThing) => {
    setSheetThing(thing);
    setSheetOpen(true);
  };
  // The card is replaced once the new one is read, so it is not kept in the history.
  const toRoom = useCallback(() => router.replace(`${roomHref}?vy=cards`), [router, roomHref]);
  const title = cardViewTitle(card);

  if (card.status !== "done") {
    return (
      <div className="flex flex-col gap-3" data-testid="card-view">
        <CardPhoto card={card} things={[]} selected={null} looking={false} onPick={() => {}} />
        {card.status === "reading" ? <AiWorking label={cardReadingText} /> : <p className="px-1 text-body text-ink-2">{cardFailedViewText}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 desktop:grid desktop:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] desktop:items-start desktop:gap-6" data-testid="card-view">
      {/* On a phone the photo stays at the top while the list scrolls under it, so the mark is always in sight. */}
      <div className="sticky top-0 z-10 -mx-page flex flex-col gap-2 bg-bg px-page pt-[max(8px,env(safe-area-inset-top))] pb-1 desktop:top-6 desktop:mx-0 desktop:px-0 desktop:pt-0">
        <CardPhoto card={card} things={things} selected={selected} looking={needsLookup} onPick={pick} />
        <div aria-live="polite" className="min-h-6">
          {missed ? (
            <p className="rounded-md bg-surface px-3 py-2.5 text-meta text-ink-2" data-testid="card-missed">
              {notFoundOnCardText}
            </p>
          ) : (
            <p className="px-1 text-meta text-ink-3" data-testid="card-hint">
              {selected ? markedText(selected) : cardHintText(things)}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-4">
        {things.length > 0 ? (
          <section className="flex flex-col gap-1.5" aria-labelledby="card-things-heading">
            <div className="flex items-baseline justify-between px-1">
              <h2 id="card-things-heading" className="text-section-label text-ink-2">
                {thingNounCap.plural}
              </h2>
              <span className="text-meta text-ink-3 tabular-nums">{things.length}</span>
            </div>
            <ListGroup labelledBy="card-things-heading">
              {things.map((thing) => {
                const isSelected = thing.id === selectedId;
                return (
                  <ListRow
                    key={thing.id}
                    title={<ThingRowTitle thing={thing} selected={isSelected} />}
                    onPress={() => pick(thing.id)}
                    pressProps={{ "aria-pressed": isSelected, "data-testid": "card-thing" }}
                    className={isSelected ? "bg-mint" : undefined}
                    trailing={
                      <span className="flex items-center">
                        {isSelected ? <CheckIcon size={18} className="text-accent" /> : null}
                        {/* Pontus 1 Nov: the föremål's sheet (count, name, Ta bort föremålet), the same as in the room and in search. */}
                        <button
                          type="button"
                          aria-label={openThingText(thing.name)}
                          aria-haspopup="dialog"
                          onClick={() => openSheet(thing)}
                          className={cx("flex size-tap items-center justify-center rounded-md", isSelected ? "text-mint-ink" : "text-ink-3")}
                          data-testid="card-thing-open"
                        >
                          <ChevronRightIcon size={18} />
                        </button>
                      </span>
                    }
                  />
                );
              })}
            </ListGroup>
          </section>
        ) : (
          <p className="px-1 text-body text-ink-2">{`Inga ${thingNoun.plural} på kortet.`}</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <RetakeCard cardId={card.id} placeId={card.placeId} name={title} variant="secondary" onSent={toRoom} />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <AddCardThings cardId={card.id} name={title} variant="secondary" />
          </div>
        </div>
        <RemoveCard cardId={card.id} takenAt={new Date(card.takenAt)} name={title} onRemoved={() => router.replace(`${roomHref}?vy=cards`)} />
      </div>
      <ThingSheet
        thing={sheetThing ? (things.find((thing) => thing.id === sheetThing.id) ?? sheetThing) : null}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onEvent={(event) => {
          // A removed föremål is no longer marked; Ångra brings it back unmarked.
          if (event.kind === "removed" && event.id === selectedId) setSelectedId(null);
        }}
      />
    </div>
  );
}
