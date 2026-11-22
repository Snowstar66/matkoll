"use client";

import Link from "next/link";
import { Fragment, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/icons";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import { Notice } from "@/components/notice";
import { errorMessages, fail, type Result } from "@/lib/errors";
import { useOption } from "@/lib/use-option";
import { loadRoomPhotoThings } from "../actions/room-things";
import { categoryCountText, isMaybe, maybeText, thingMeta, type Thing } from "../domain/thing";
import { cardViewHref } from "../domain/thing-card";
import { shortDateText } from "../domain/thing-photo";
import { worthTitleText } from "../domain/thing-worth";
import type { RoomCard, RoomPhotoThings } from "../domain/thing-room";
import { AsideTitle } from "./card-things";
import { ThingSheet } from "./thing-sheet";
import { StarCountAfter } from "./worth-marker";
import { RemovedThingRow, type RemovedThing, useRemovedThings, useRemovedThingsHost } from "./removed-things";

// The room's things per photo (Pontus 20 Nov): "i förråd när jag gått in i ett rum kan det finnas flera foton",
// and a föremål is found by remembering its photo. Each done card is a group with its photo as a small
// heading (a tap opens the whole card), its date and how many things it shows, then its things as quiet rows
// (the count at the right when it has one). A föremål seen on two cards is under both. Things written in
// without a card come last. The rows are read again when the page is (a card added, a thing renamed).

type Loaded = RoomPhotoThings | { error: string };

export type RoomPhotosProps = {
  siteId: string;
  roomKey: string;
  cards: readonly RoomCard[];
};

/** What a screen reader says for a folded photo: "Hela rummet, 22 nov, 12 saker, 2 kan ha värde, fäll ut". */
export function photoFoldLabel(parts: { label: string; date: string; count: number; starred: number; open: boolean }): string {
  return [parts.label, parts.date, categoryCountText(parts.count), parts.starred > 0 ? `${parts.starred} ${worthTitleText.toLowerCase()}` : null, parts.open ? "fäll ihop" : "fäll ut"]
    .filter(Boolean)
    .join(", ");
}

/** Where a föremål is in a list (the end when it is not there). */
function indexIn(things: readonly Thing[], id: string): number {
  const index = things.findIndex((entry) => entry.id === id);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

/** The rows, with each removed föremål's struck-through row where the föremål was. */
function withRemoved(things: readonly Thing[], removed: readonly { thing: RemovedThing; at: number }[], rows: (things: readonly Thing[]) => ReactNode): ReactNode {
  const parts: ReactNode[] = [];
  let from = 0;
  for (const { thing, at } of [...removed].sort((a, b) => a.at - b.at)) {
    const to = Math.min(Math.max(at, from), things.length);
    parts.push(<Fragment key={`rows-${thing.id}`}>{rows(things.slice(from, to))}</Fragment>, <RemovedThingRow key={thing.id} thing={thing} />);
    from = to;
  }
  parts.push(<Fragment key="rows-rest">{rows(things.slice(from))}</Fragment>);
  return parts;
}

/**
 * One photo of the room as a folded row: its thumbnail and its text (both open the card), what it shows, the date, how many föremål and how
 * many have a star, and a ⌄ (the only thing that folds) that unfolds the föremål list (the rows as they were, with the "Kan ha värde" pill) and "Öppna kortet" last.
 * A line of what the card holds comes under the name once cards have one (Värdetips, summary).
 */
function PhotoFold({
  card,
  things,
  removed,
  open,
  onToggle,
  rows,
}: {
  card: RoomCard;
  things: readonly Thing[];
  /** The föremål just removed from this photo, kept as struck-through rows for "Ångra". */
  removed: readonly { thing: RemovedThing; at: number }[];
  open: boolean;
  onToggle: () => void;
  rows: (things: readonly Thing[]) => ReactNode;
}) {
  const worthOn = useOption("worthLook");
  const starred = worthOn ? things.filter((thing) => thing.worth).length : 0;
  const date = shortDateText(card.takenAt);
  const panelId = useId();
  return (
    <section className="overflow-hidden rounded-lg bg-surface" data-testid="room-photo">
      <div className="flex items-center gap-3 py-2.5 pr-1.5 pl-3">
        <Link href={cardViewHref(card.id)} aria-label={`Visa kortet ${card.label}`} className="shrink-0 overflow-hidden rounded-md bg-border" data-testid="room-photo-thumb">
          {/* The photo is served by the route that checks the user; nothing is fetched from anywhere else. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/things/photo/${card.id}`} alt="" loading="lazy" className="block size-14 object-cover" />
        </Link>
        {/* The row opens the card, like the photo; only the chevron folds the list out and in. */}
        <Link href={cardViewHref(card.id)} aria-label={`Visa kortet ${card.label}`} className="flex min-h-tap min-w-0 flex-1 flex-col justify-center text-left" data-testid="room-photo-row">
          <span className="text-row-title font-semibold wrap-break-word text-ink">{card.label}</span>
          <span className="text-meta text-ink-2">
            {card.named && card.placeLabel ? `${card.placeLabel} · ` : ""}
            {date} · {categoryCountText(things.length)}
            <StarCountAfter count={starred} />
          </span>
          {card.summary ? (
            <span className="truncate text-meta text-ink-3" data-testid="card-summary">
              {card.summary}
            </span>
          ) : null}
        </Link>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={photoFoldLabel({ label: card.label, date, count: things.length, starred, open })}
          className="flex size-tap shrink-0 items-center justify-center rounded-md text-ink-3"
          data-testid="room-photo-toggle"
        >
          <ChevronDownIcon size={20} className={open ? "rotate-180" : undefined} />
        </button>
      </div>
      {open ? (
        <div id={panelId} className="border-t border-hairline">
          {things.length > 0 || removed.length > 0 ? (
            <ListGroup label={`${card.label}, ${date}`}>
              {withRemoved(things, removed, rows)}
            </ListGroup>
          ) : null}
          <Link
            href={cardViewHref(card.id)}
            className="flex min-h-tap items-center justify-between gap-2 border-t border-hairline px-4 text-meta font-medium text-accent"
            data-testid="room-photo-open"
          >
            Öppna kortet
            <ChevronRightIcon size={16} className="text-ink-3" />
          </Link>
        </div>
      ) : null}
    </section>
  );
}

export function RoomPhotos({ siteId, roomKey, cards }: RoomPhotosProps) {
  const done = cards.filter((card) => card.status === "done");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [open, setOpen] = useState(false);
  // Kept while the sheet closes, so its text does not blank during the animation.
  const [selected, setSelected] = useState<Thing | null>(null);
  const latest = useRef(0);
  const idsKey = done.map((card) => card.id).join("|");

  useEffect(() => {
    const request = ++latest.current;
    void (async () => {
      let result: Result<RoomPhotoThings>;
      try {
        result = await loadRoomPhotoThings({ siteId, roomKey, photoIds: idsKey === "" ? [] : idsKey.split("|") });
      } catch {
        result = fail("things_unavailable");
      }
      if (request === latest.current) setLoaded(result.ok ? result.data : { error: errorMessages[result.error.code] });
    })();
    // `cards` is new on every refresh of the page, which reads the rows again.
  }, [cards, idsKey, siteId, roomKey]);

  // Every photo starts folded (Värdetips sketches, E); the unfolded ones are this visit's.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  // UX-B: a föremål removed from a photo leaves its row, struck through, for "Ångra"; the photo is unfolded to show it.
  useRemovedThingsHost();
  const removedThings = useRemovedThings();
  // Where each one was in its photo's list, read the first time it is seen (the list still has it then).
  const [anchors, setAnchors] = useState<ReadonlyMap<string, number>>(new Map());
  const fresh = removedThings.filter((thing) => thing.photoId !== null && !anchors.has(thing.id));
  if (fresh.length > 0 && loaded && !("error" in loaded)) {
    setAnchors(new Map([...anchors, ...fresh.map((thing) => [thing.id, indexIn(loaded.byPhoto[thing.photoId ?? ""] ?? [], thing.id)] as const)]));
    setExpanded(new Set([...expanded, ...fresh.flatMap((thing) => (thing.photoId ? [thing.photoId] : []))]));
  }
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  function press(thing: Thing) {
    setSelected(thing);
    setOpen(true);
  }

  const rows = (things: readonly Thing[]) =>
    things.map((thing) => (
      <ListRow
        key={thing.id}
        title={<AsideTitle name={thing.name} hint={thing.noted ? thingMeta(thing) : isMaybe(thing) ? maybeText : ""} quantity={thing.quantity ?? null} worth={thing.worth} />}
        onPress={() => press(thing)}
        pressProps={{ "aria-haspopup": "dialog", "data-testid": "thing-press" }}
        data-testid="thing"
      />
    ));

  if (loaded && "error" in loaded) return <Notice role="alert">{loaded.error}</Notice>;
  if (!loaded) return <p className="px-1 text-body text-ink-2">Läser …</p>;
  return (
    <div className="flex flex-col gap-2.5" data-testid="room-photos">
      {done.map((card) => (
        <PhotoFold
          key={card.id}
          card={card}
          things={loaded.byPhoto[card.id] ?? []}
          removed={removedThings.filter((thing) => thing.photoId === card.id).map((thing) => ({ thing, at: anchors.get(thing.id) ?? Number.MAX_SAFE_INTEGER }))}
          open={expanded.has(card.id)}
          onToggle={() => toggle(card.id)}
          rows={rows}
        />
      ))}
      {loaded.noted.length > 0 || removedThings.some((thing) => thing.noted) ? (
        <section className="flex flex-col gap-2" data-testid="room-photo-noted">
          <h3 className="m-0 px-1 text-section-label text-ink-2">Skrivna utan foto</h3>
          <ListGroup label="Skrivna utan foto">
            {rows(loaded.noted)}
            {removedThings
              .filter((thing) => thing.noted)
              .map((thing) => (
                <RemovedThingRow key={thing.id} thing={thing} />
              ))}
          </ListGroup>
        </section>
      ) : null}
      <ThingSheet thing={selected} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
