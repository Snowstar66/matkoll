import { cx } from "@/components/cx";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import { roomMeta, roomsTotalText, roomTile, type RoomSummary } from "../domain/thing-room";

// The rooms of a boende (Story 18.11): "Rum" with the sum at the right
// ("3 rum · 112 prylar"), and a quiet row per room with an emoji tile, its
// things, cards and newest date ("74 prylar · 9 kort · 31 okt"). A room is the
// distinct room of the boende's places; its row opens the room's page.

export function roomHref(siteId: string, key: string): string {
  return `/prylar/rum/${siteId}/${encodeURIComponent(key)}`;
}

export function RoomsList({ siteId, rooms }: { siteId: string; rooms: readonly RoomSummary[] }) {
  return (
    <section aria-labelledby="rooms-label" className="flex flex-col gap-2" data-testid="rooms">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 id="rooms-label" className="text-section-label text-ink-2">
          Rum
        </h2>
        <span className="text-meta text-ink-3" data-testid="rooms-total">
          {roomsTotalText(rooms)}
        </span>
      </div>
      <ListGroup labelledBy="rooms-label">
        {rooms.map((room) => {
          const { icon, tile } = roomTile(room.room);
          return (
            <ListRow
              key={room.key}
              href={roomHref(siteId, room.key)}
              title={room.room}
              meta={roomMeta(room)}
              leading={
                <span aria-hidden="true" className={cx("flex size-tile shrink-0 items-center justify-center rounded-sm text-tile-icon leading-none select-none", tile)}>
                  {icon}
                </span>
              }
              trailing={
                <span aria-hidden="true" className="text-row-title text-ink-3">
                  ›
                </span>
              }
              pressProps={{ "data-testid": "room-row" }}
            />
          );
        })}
      </ListGroup>
    </section>
  );
}
