import type { PhotoViewMarker } from "@/features/pantry";
import type { ThingBox } from "@/lib/thing-box";
import { thingDots } from "./thing-card";
import type { ThingWorth } from "./thing-worth";

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
  /** Every föremål on the same card in the card's order, for the photo view's numbers (the same as on the card's page); empty without a card. */
  cardThings: ThingDetailCardThing[];
  /** Värt en titt: why it may be worth a closer look; null when it has no tip. */
  worth: ThingWorth | null;
};

/** A föremål on the card the sheet's föremål is seen on. */
export type ThingDetailCardThing = { id: string; name: string; box: ThingBox | null };

/**
 * The numbers of a card as the photo view shows them: the same numbers as the
 * card's page (a föremål without a box has none), each with its name. Förrådet
 * keeps nothing about what became of a föremål (a removed one is gone from the
 * database), so no marker has a status. Pure.
 */
export function cardPhotoMarkers(things: readonly ThingDetailCardThing[]): PhotoViewMarker[] {
  const names = new Map(things.map((thing) => [thing.id, thing.name]));
  return thingDots(things).map((dot) => ({ n: dot.number, left: dot.left, top: dot.top, name: names.get(dot.id) ?? "", status: null, location: null }));
}

/** The number of föremål `id` on its card's photo, or `null` when it has no box. */
export function numberOnCard(things: readonly ThingDetailCardThing[], id: string): number | null {
  return thingDots(things).find((dot) => dot.id === id)?.number ?? null;
}

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
