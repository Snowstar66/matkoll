import { categoryCountText, unseenText, type Thing } from "../domain/thing";
import { cardDateText, noThingsText, type ThingCard } from "../domain/thing-photo";
import { AddBox } from "./add-box";
import { CardThings } from "./card-things";
import { RemoveCard } from "./remove-card";

// A place's card (Story 18.2): the photo's thumbnail with "Kort från 31 okt",
// the line about what is not visible ("Innehållet i 3 lådor syns inte – fota
// insidan"), and the things under their categories, each with where in the
// photo and "kanske" for a guess (CardThings: a tap renames or removes one
// thing, Story 18.3). On a place (not in a box) the unseen line is a button
// that adds a box and photographs its inside (Story 18.5). "Ta bort kortet"
// ends the panel.

export function CardPanel({ card, things, placeId, canAddBox }: { card: ThingCard; things: readonly Thing[]; placeId: string; canAddBox: boolean }) {
  const unseen = unseenText(card.unseenCount, card.unseenNote);
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
      {unseen && canAddBox ? <AddBox placeId={placeId} variant="row" label={unseen} /> : null}
      {unseen && !canAddBox ? (
        <p className="rounded-md bg-sand px-4 py-3 text-body text-ink" data-testid="unseen-note">
          {unseen}
        </p>
      ) : null}
      {things.length === 0 ? <p className="text-body text-ink-2">{noThingsText}</p> : <CardThings things={things} />}
      <RemoveCard cardId={card.id} takenAt={card.takenAt} />
    </div>
  );
}
