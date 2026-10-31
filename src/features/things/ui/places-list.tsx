import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import { cardDateText } from "../domain/thing-photo";
import { allOnOtherCardsText, groupByRoom, partLabel, thingCountText, type ThingPlace } from "../domain/thing-place";

// The places of a boende (Story 18.1), grouped by room: the room as a section
// label, its places as quiet rows in one list group, each with how many things
// the latest card has and the card's date ("12 saker · Kort från 31 okt").

/** The line under a place's name. */
export function placeMeta(place: ThingPlace): string {
  const box = place.isBox ? "Låda · " : "";
  if (place.cardState === "reading") return `${box}Tittar på kortet …`;
  if (place.cardTakenAt === null) return `${box}${place.cardState === "failed" ? "Kortet kunde inte läsas" : "Inget kort än"}`;
  // Every thing of the card is counted on another card of the room.
  const count = place.itemCount === 0 && place.mergedAway > 0 ? allOnOtherCardsText : thingCountText(place.itemCount);
  const base = `${box}${count} · ${cardDateText(place.cardTakenAt)}`;
  return place.cardState === "failed" ? `${base} · nytt kort kunde inte läsas` : base;
}

export function PlacesList({ places }: { places: readonly ThingPlace[] }) {
  return (
    <div className="flex flex-col gap-6" data-testid="places">
      {groupByRoom(places).map((group, index) => (
        <section key={group.room} aria-labelledby={`room-${index}`} className="flex flex-col gap-2">
          <h2 id={`room-${index}`} className="px-1 text-section-label wrap-break-word text-ink-2">
            {group.room}
          </h2>
          <ListGroup labelledBy={`room-${index}`}>
            {group.places.map((place) => (
              <ListRow key={place.id} href={`/prylar/${place.id}`} title={partLabel(place)} meta={placeMeta(place)} pressProps={{ "data-testid": "place" }} />
            ))}
          </ListGroup>
        </section>
      ))}
    </div>
  );
}
