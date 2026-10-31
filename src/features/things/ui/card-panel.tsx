import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import { cx } from "@/components/cx";
import { categoryCountText, groupByCategory, thingMeta, thingTiles, unseenText, type Thing, type ThingCategory } from "../domain/thing";
import { cardDateText, noThingsText, type ThingCard } from "../domain/thing-photo";

// A place's card (Story 18.2): the photo's thumbnail with "Kort från 31 okt",
// the line about what is not visible ("Innehållet i 3 lådor syns inte – fota
// insidan"), and the things under their categories, each with where in the
// photo and "kanske" for a guess. Quiet row cards, a category's emoji on a
// light tile; the tile is decoration and the category's name stands beside it.

function CategoryHeading({ category, count, id }: { category: ThingCategory; count: number; id: string }) {
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

export function CardPanel({ card, things }: { card: ThingCard; things: readonly Thing[] }) {
  const unseen = unseenText(card.unseenCount, card.unseenNote);
  const groups = groupByCategory(things);
  return (
    <div className="flex flex-col gap-5" data-testid="card-panel">
      <div className="flex items-center gap-4">
        {/* The photo is served by the route that checks the user; nothing is fetched from anywhere else. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/things/photo/${card.id}`}
          alt="Kortet av platsen"
          width={96}
          height={72}
          className="h-[72px] w-24 shrink-0 rounded-md bg-border object-cover"
        />
        <div className="min-w-0">
          <p className="text-row-title text-ink">{cardDateText(card.takenAt)}</p>
          <p className="text-meta text-ink-2">{categoryCountText(things.length)}</p>
        </div>
      </div>
      {unseen ? (
        <p className="rounded-md bg-sand px-4 py-3 text-body text-ink" data-testid="unseen-note">
          {unseen}
        </p>
      ) : null}
      {groups.length === 0 ? (
        <p className="text-body text-ink-2">{noThingsText}</p>
      ) : (
        groups.map((group) => (
          <section key={group.category} className="flex flex-col gap-2" data-testid="thing-group">
            <CategoryHeading category={group.category} count={group.things.length} id={`cat-${group.category}`} />
            <ListGroup labelledBy={`cat-${group.category}`}>
              {group.things.map((thing) => (
                <ListRow key={thing.id} title={thing.name} meta={thingMeta(thing)} data-testid="thing" />
              ))}
            </ListGroup>
          </section>
        ))
      )}
    </div>
  );
}
