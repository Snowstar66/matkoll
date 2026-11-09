import type { ThingBox } from "@/lib/thing-box";

// The detail of one föremål for its sheet (Pontus 9 Nov): its card photo and
// where on it, and where it is kept, read when the sheet opens. No new data:
// all of it is in thing_item and thing_place already. Pure.

/** Where a föremål is kept, as the sheet's crumbs show it. */
export type ThingDetailPlace = {
  id: string;
  siteId: string;
  room: string;
  roomKey: string;
  part: string | null;
  kind: "part" | "box";
};

/** What the sheet reads about one föremål. Plain data: it crosses from the server to the browser. */
export type ThingDetail = {
  /** The card it is seen on; null for a noted föremål, which has no card. */
  photoId: string | null;
  source: "photo" | "added" | "noted";
  /** Where on the card, 0 to 1; null when there is none (an older card) or it is not reasonable. */
  box: ThingBox | null;
  place: ThingDetailPlace;
};

/** One step of the crumbs: its words, and where it links when there is a page for it. */
export type ThingCrumb = { label: string; href: string | null };

/** The page of a room, as its other links have it. */
export function roomHref(place: Pick<ThingDetailPlace, "siteId" | "roomKey">): string {
  return `/prylar/rum/${place.siteId}/${encodeURIComponent(place.roomKey)}`;
}

/** "Garaget › Hylla 2" for a part of a room, "Garaget › Låda Jul" for a box; the room and a box link, a part has no page of its own. */
export function thingCrumbs(place: ThingDetailPlace): ThingCrumb[] {
  const crumbs: ThingCrumb[] = [{ label: place.room, href: roomHref(place) }];
  if (place.kind === "box") crumbs.push({ label: place.part ? `Låda ${place.part}` : "Låda", href: `/prylar/lada/${place.id}` });
  else if (place.part) crumbs.push({ label: place.part, href: null });
  return crumbs;
}
