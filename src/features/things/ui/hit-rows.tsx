"use client";

import { useState } from "react";
import { Button } from "@/components/button";
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

function HitList({ hits, label, siteId }: { hits: readonly ThingHit[]; label: string; siteId?: string }) {
  return (
    <ListGroup label={label}>
      {hits.map((hit) => (
        <ListRow
          key={hit.id}
          href={hitHref(hit)}
          title={hit.name}
          meta={hitLine(hit, siteId)}
          trailing={<HitThumb hit={hit} />}
          pressProps={{ "data-testid": "thing-hit" }}
        />
      ))}
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
