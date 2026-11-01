"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/button";
import { cx } from "@/components/cx";
import { useToast } from "@/components/toast";
import { fail } from "@/lib/errors";
import { undoThingChange } from "../actions/thing-count";
import { changedText, countText } from "../domain/thing-count";
import { CountActions, type CountChange } from "./count-actions";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import { hitHref, hitLine, hitThumbnail, showSimilarText, similarLabelText, type ThingHit } from "../domain/thing-search";
import { NotedTile } from "./remember-proposal";

// A found thing as a row (Story 18.19): its name, where it is (room · part or
// box), and the card's thumbnail at the right (a note for a thing written in
// with where it is, a box for a thing written into a box). The hits that answer
// what was written come first; the close ones are "Liknande", shown when
// nothing answers, or folded in under "Visa 5 liknande". A hit on a card opens
// the card big with the thing marked (Story 18.7); a noted thing opens its room.

function HitThumb({ hit }: { hit: ThingHit }) {
  if (hit.noted) return <NotedTile className="h-10 w-13" />;
  const thumbnail = hitThumbnail(hit);
  if (!thumbnail) {
    return (
      <span aria-hidden="true" className="flex h-10 w-13 shrink-0 items-center justify-center rounded-sm bg-tile-clay text-tile-icon leading-none select-none">
        {"\u{1F4E6}"}
      </span>
    );
  }
  // The photo is served by the route that checks the user; nothing is fetched from anywhere else.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={thumbnail} alt="" loading="lazy" className="h-10 w-13 shrink-0 rounded-sm bg-border object-cover" data-testid="hit-thumbnail" />;
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

/**
 * A counted föremål's hit (Story 18.23): the row as any hit (the name, the line and the thumbnail open the card),
 * with its count first in the line and, under it, Ta and Fyll på as buttons of their own. A change shows at once in
 * the row and in a toast with Ångra; the answer's text above stays as it was written.
 */
function CountedHit({ hit, siteId }: { hit: ThingHit & { quantity: number }; siteId?: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [quantity, setQuantity] = useState(hit.quantity);

  function changed(change: CountChange) {
    setQuantity(change.quantity);
    router.refresh();
    showToast(changedText(change.kind, change.amount, hit.name), {
      onUndo: () => {
        void (async () => {
          let undone: Awaited<ReturnType<typeof undoThingChange>>;
          try {
            undone = await undoThingChange(change.changeId);
          } catch {
            undone = fail("things_restore_failed");
          }
          if (undone.ok) setQuantity(undone.data.quantity);
          else showToast(undone.error.message, { role: "alert" });
          router.refresh();
        })();
      },
    });
  }

  return (
    <li data-testid="counted-hit">
      <ListRow
        as="div"
        href={hitHref(hit)}
        title={hit.name}
        meta={<CountMeta quantity={quantity} rest={hitLine(hit, siteId)} />}
        trailing={<HitThumb hit={hit} />}
        pressProps={{ "data-testid": "thing-hit" }}
      />
      <CountActions
        itemId={hit.id}
        quantity={quantity}
        onChanged={changed}
        onError={(message) => showToast(message, { role: "alert" })}
        className="-mt-1 pr-3 pb-3 pl-4"
      />
    </li>
  );
}

function HitList({ hits, label, siteId }: { hits: readonly ThingHit[]; label: string; siteId?: string }) {
  return (
    <ListGroup label={label}>
      {hits.map((hit) =>
        hit.quantity !== null ? (
          <CountedHit key={hit.id} hit={{ ...hit, quantity: hit.quantity }} siteId={siteId} />
        ) : (
          <ListRow
            key={hit.id}
            href={hitHref(hit)}
            title={hit.name}
            meta={hitLine(hit, siteId)}
            trailing={<HitThumb hit={hit} />}
            pressProps={{ "data-testid": "thing-hit" }}
          />
        ),
      )}
    </ListGroup>
  );
}

export function RankedHits({ best, similar, siteId, label }: { best: readonly ThingHit[]; similar: readonly ThingHit[]; siteId?: string; label: string }) {
  const [showSimilar, setShowSimilar] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      {best.length > 0 ? <HitList hits={best} label={label} siteId={siteId} /> : null}
      {similar.length > 0 && best.length > 0 && !showSimilar ? (
        <div>
          <Button variant="compact" onClick={() => setShowSimilar(true)} data-testid="show-similar">
            {showSimilarText(similar.length)}
          </Button>
        </div>
      ) : null}
      {similar.length > 0 && (best.length === 0 || showSimilar) ? (
        <section className="flex flex-col gap-1.5" data-testid="similar-hits">
          <h3 className="px-1 text-section-label text-ink-2">{similarLabelText}</h3>
          <HitList hits={similar} label={similarLabelText} siteId={siteId} />
        </section>
      ) : null}
    </div>
  );
}
