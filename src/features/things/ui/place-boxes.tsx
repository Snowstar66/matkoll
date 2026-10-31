import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import { partLabel, type ThingPlace } from "../domain/thing-place";
import { placeMeta } from "./places-list";

// The boxes of a place's room (Story 18.5), as quiet rows under the card:
// each opens the box's own card.

export function PlaceBoxes({ boxes }: { boxes: readonly ThingPlace[] }) {
  return (
    <section aria-labelledby="place-boxes" className="flex flex-col gap-2" data-testid="place-boxes">
      <h2 id="place-boxes" className="px-1 text-section-label text-ink-2">
        Lådor
      </h2>
      <ListGroup labelledBy="place-boxes">
        {boxes.map((box) => (
          <ListRow key={box.id} href={`/prylar/${box.id}`} title={partLabel(box)} meta={placeMeta(box)} pressProps={{ "data-testid": "box" }} />
        ))}
      </ListGroup>
    </section>
  );
}
