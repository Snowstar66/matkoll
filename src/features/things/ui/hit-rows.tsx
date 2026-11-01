"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/button";
import { cx } from "@/components/cx";
import { useToast } from "@/components/toast";
import { fail } from "@/lib/errors";
import { undoThingChange } from "../actions/thing-count";
import { changedText, countText } from "../domain/thing-count";
import { showInRoomText, showOnCardText, showThingOnCardText } from "../domain/thing-edit";
import { CountActions, type CountChange } from "./count-actions";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import { hitHref, hitLine, hitOpensSheet, hitShowHref, hitThumbnail, showSimilarText, similarLabelText, type ThingHit } from "../domain/thing-search";
import { NotedTile } from "./remember-proposal";
import { ThingSheet, type SheetThing, type ThingSheetEvent } from "./thing-sheet";

// A found thing as a row (Story 18.19): its name, where it is (room · part or
// box), and the card's thumbnail at the right (a note for a thing written in
// with where it is, a box for a thing written into a box). The hits that answer
// what was written come first; the close ones are "Liknande", shown when
// nothing answers, or folded in under "Visa 5 liknande". Pontus 1 Nov: a tap on
// the row opens the föremål's sheet (the count, Visa på kortet ›, the name, Ta
// bort föremålet); the thumbnail is a link of its own to the card big with the
// föremål marked (Story 18.7). A thing written into a box opens the box's page,
// where it is changed.

function HitThumb({ hit }: { hit: ThingHit }) {
  if (hit.noted) return <NotedTile className="h-10 w-13" />;
  const thumbnail = hitThumbnail(hit);
  const href = hitShowHref(hit);
  if (!thumbnail || !href) {
    return (
      <span aria-hidden="true" className="flex h-10 w-13 shrink-0 items-center justify-center rounded-sm bg-tile-clay text-tile-icon leading-none select-none">
        {"\u{1F4E6}"}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={showThingOnCardText(hit.name)} className="flex min-h-tap shrink-0 items-center rounded-sm" data-testid="hit-card-link">
      {/* The photo is served by the route that checks the user; nothing is fetched from anywhere else. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumbnail} alt="" loading="lazy" className="h-10 w-13 rounded-sm bg-border object-cover" data-testid="hit-thumbnail" />
    </Link>
  );
}

/** The count first in the line under the name (Story 18.23): "5 st" in ink-2, or a quiet "Slut". */
export function CountMeta({ quantity, rest }: { quantity: number; rest: string }) {
  return (
    <>
      <span className={cx("font-medium", quantity === 0 ? "text-ink-3" : "text-ink-2")} data-testid="hit-count">
        {countText(quantity)}
      </span>
      {rest ? ` · ${rest}` : null}
    </>
  );
}

/** What a tap on a hit's row does: open its sheet, or (a thing written into a box) the box's page. */
function rowPress(hit: ThingHit, onOpen: (hit: ThingHit) => void) {
  return hitOpensSheet(hit)
    ? ({ onPress: () => onOpen(hit), pressProps: { "aria-haspopup": "dialog", "data-testid": "thing-hit" } } as const)
    : ({ href: hitHref(hit), pressProps: { "data-testid": "thing-hit" } } as const);
}

/**
 * A counted föremål's hit (Story 18.23): the row as any hit, with its count first in the line and, under it, Ta and
 * Fyll på as buttons of their own. A change shows at once in the row and in a toast with Ångra ("Slut på
 * gravljus." when the last ones were taken); the answer's text above stays as it was written.
 */
function CountedHit({
  hit,
  siteId,
  onOpen,
  onQuantity,
}: {
  hit: ThingHit & { quantity: number };
  siteId?: string;
  onOpen: (hit: ThingHit) => void;
  onQuantity: (id: string, quantity: number) => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();

  function changed(change: CountChange) {
    onQuantity(hit.id, change.quantity);
    router.refresh();
    showToast(changedText(change.kind, change.amount, hit.name, change.quantity), {
      onUndo: () => {
        void (async () => {
          let undone: Awaited<ReturnType<typeof undoThingChange>>;
          try {
            undone = await undoThingChange(change.changeId);
          } catch {
            undone = fail("things_restore_failed");
          }
          if (undone.ok) onQuantity(hit.id, undone.data.quantity);
          else showToast(undone.error.message, { role: "alert" });
          router.refresh();
        })();
      },
    });
  }

  return (
    <li data-testid="counted-hit">
      <ListRow as="div" title={hit.name} meta={<CountMeta quantity={hit.quantity} rest={hitLine(hit, siteId)} />} trailing={<HitThumb hit={hit} />} {...rowPress(hit, onOpen)} />
      <CountActions
        itemId={hit.id}
        quantity={hit.quantity}
        onChanged={changed}
        onError={(message) => showToast(message, { role: "alert" })}
        className="-mt-1 pr-3 pb-3 pl-4"
      />
    </li>
  );
}

function HitList({
  hits,
  label,
  siteId,
  onOpen,
  onQuantity,
}: {
  hits: readonly ThingHit[];
  label: string;
  siteId?: string;
  onOpen: (hit: ThingHit) => void;
  onQuantity: (id: string, quantity: number) => void;
}) {
  return (
    <ListGroup label={label}>
      {hits.map((hit) =>
        hit.quantity !== null ? (
          <CountedHit key={hit.id} hit={{ ...hit, quantity: hit.quantity }} siteId={siteId} onOpen={onOpen} onQuantity={onQuantity} />
        ) : (
          <ListRow key={hit.id} title={hit.name} meta={hitLine(hit, siteId)} trailing={<HitThumb hit={hit} />} {...rowPress(hit, onOpen)} />
        ),
      )}
    </ListGroup>
  );
}

/** A hit as its sheet needs it. */
function sheetThing(hit: ThingHit): SheetThing {
  return {
    id: hit.id,
    name: hit.name,
    category: hit.category,
    whereHint: hit.whereHint,
    confidence: "high",
    seenOn: hit.seenOn,
    noted: hit.noted ? { at: hit.takenAt, part: hit.part } : null,
    quantity: hit.quantity,
  };
}

export function RankedHits({ best, similar, siteId, label }: { best: readonly ThingHit[]; similar: readonly ThingHit[]; siteId?: string; label: string }) {
  const [showSimilar, setShowSimilar] = useState(false);
  // What the sheet and the count buttons changed, over the hits as the search gave them.
  const [changes, setChanges] = useState<Readonly<Record<string, Partial<ThingHit>>>>({});
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  // Kept while the sheet closes, so its text does not blank during the animation.
  const [selected, setSelected] = useState<ThingHit | null>(null);
  const [open, setOpen] = useState(false);

  const change = (id: string, values: Partial<ThingHit>) => setChanges((all) => ({ ...all, [id]: { ...all[id], ...values } }));
  const shown = (hits: readonly ThingHit[]) => hits.filter((hit) => !gone.has(hit.id)).map((hit) => (changes[hit.id] ? { ...hit, ...changes[hit.id] } : hit));
  const shownBest = shown(best);
  const shownSimilar = shown(similar);
  const current = selected ? { ...selected, ...changes[selected.id] } : null;

  function onEvent(event: ThingSheetEvent) {
    if (event.kind === "saved") change(event.id, { name: event.name, category: event.category, whereHint: event.whereHint });
    else if (event.kind === "counted") change(event.id, { quantity: event.quantity });
    else
      setGone((all) => {
        const next = new Set(all);
        if (event.kind === "removed") next.add(event.id);
        else next.delete(event.id);
        return next;
      });
  }

  const openHit = (hit: ThingHit) => {
    setSelected(hit);
    setOpen(true);
  };
  const onQuantity = (id: string, quantity: number) => change(id, { quantity });
  const showHref = current ? hitShowHref(current) : null;

  return (
    <div className="flex flex-col gap-2">
      {shownBest.length > 0 ? <HitList hits={shownBest} label={label} siteId={siteId} onOpen={openHit} onQuantity={onQuantity} /> : null}
      {shownSimilar.length > 0 && shownBest.length > 0 && !showSimilar ? (
        <div>
          <Button variant="compact" onClick={() => setShowSimilar(true)} data-testid="show-similar">
            {showSimilarText(shownSimilar.length)}
          </Button>
        </div>
      ) : null}
      {shownSimilar.length > 0 && (shownBest.length === 0 || showSimilar) ? (
        <section className="flex flex-col gap-1.5" data-testid="similar-hits">
          <h3 className="px-1 text-section-label text-ink-2">{similarLabelText}</h3>
          <HitList hits={shownSimilar} label={similarLabelText} siteId={siteId} onOpen={openHit} onQuantity={onQuantity} />
        </section>
      ) : null}
      <ThingSheet
        thing={current ? sheetThing(current) : null}
        open={open}
        onClose={() => setOpen(false)}
        subtitle={current && !current.noted ? hitLine(current, siteId) : undefined}
        link={current && showHref ? { href: showHref, label: current.noted ? showInRoomText : showOnCardText } : null}
        onEvent={onEvent}
      />
    </div>
  );
}
