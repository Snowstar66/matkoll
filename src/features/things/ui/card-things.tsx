"use client";

import { useState } from "react";
import { cx } from "@/components/cx";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import { groupByCategory, thingMeta, thingTiles, type Thing, type ThingCategory } from "../domain/thing";
import { CountMeta } from "./hit-rows";
import { ThingSheet } from "./thing-sheet";

// The things of a card under their categories (Stories 18.2 and 18.3), each a
// row to tap: its sheet (ThingSheet) counts it, renames it, changes its category and
// where on the picture it is (Story 18.15), or removes just it (with "Ångra"), and
// the card, its date and the other things stay as they are. Quiet row
// cards, a category's emoji on a light tile; the tile is decoration and the
// category's name stands beside it.

export function CategoryHeading({ category, count, id }: { category: ThingCategory; count: number; id: string }) {
  const { icon, tile } = thingTiles[category];
  return (
    <div className="flex items-center gap-3 px-1">
      <span
        aria-hidden="true"
        className={cx("flex size-tile shrink-0 items-center justify-center rounded-sm text-tile-icon leading-none select-none", tile)}
      >
        {icon}
      </span>
      <h3 id={id} className="min-w-0 flex-1 text-section-label wrap-break-word text-ink-2">
        {category}
      </h3>
      <span className="shrink-0 text-meta text-ink-2 tabular-nums">{count}</span>
    </div>
  );
}

/**
 * A thing's row in a room's list (Story 18.12): the name, and where it is at the right in small type. Story 18.23:
 * a counted föremål has its count first there ("3 st · översta hyllan, vänster", or "Slut"); no buttons, the
 * list is for looking: Ta and Fyll på are in the sheet.
 */
function AsideTitle({ name, hint, quantity }: { name: string; hint: string; quantity: number | null }) {
  return (
    <span className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 font-normal wrap-break-word">{name}</span>
      {hint || quantity !== null ? (
        <span className="max-w-[45%] shrink-0 text-right text-meta font-normal text-ink-3">
          {quantity !== null ? <CountMeta quantity={quantity} rest={hint} /> : hint}
        </span>
      ) : null}
    </span>
  );
}

export function CardThings({ things, headings = true, aside = false }: { things: readonly Thing[]; headings?: boolean; aside?: boolean }) {
  const [open, setOpen] = useState(false);
  // Kept while the sheet closes, so its text does not blank during the animation.
  const [selected, setSelected] = useState<Thing | null>(null);
  const groups = groupByCategory(things);

  if (groups.length === 0) return null;
  return (
    <>
      {groups.map((group) => (
        <section key={group.category} className="flex flex-col gap-2" data-testid="thing-group">
          {headings ? <CategoryHeading category={group.category} count={group.things.length} id={`cat-${group.category}`} /> : null}
          <ListGroup labelledBy={headings ? `cat-${group.category}` : undefined} label={headings ? undefined : group.category}>
            {group.things.map((thing) => (
              <ListRow
                key={thing.id}
                title={aside ? <AsideTitle name={thing.name} hint={thingMeta(thing)} quantity={thing.quantity ?? null} /> : thing.name}
                meta={aside ? undefined : thing.quantity != null ? <CountMeta quantity={thing.quantity} rest={thingMeta(thing)} /> : thingMeta(thing)}
                onPress={() => {
                  setSelected(thing);
                  setOpen(true);
                }}
                pressProps={{ "aria-haspopup": "dialog", "data-testid": "thing-press" }}
                data-testid="thing"
              />
            ))}
          </ListGroup>
        </section>
      ))}
      <ThingSheet thing={selected} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
