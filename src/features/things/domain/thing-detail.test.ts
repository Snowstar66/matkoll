import { describe, expect, it } from "vitest";
import { cardPhotoMarkers, numberOnCard, roomHref, thingCrumbs, type ThingDetailCardThing, type ThingDetailPlace } from "./thing-detail";

const place: ThingDetailPlace = { id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a02", siteId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a03", room: "Garaget", roomKey: "garaget", part: null, kind: "part" };

describe("the crumbs of a föremål", () => {
  it("links the room's page", () => {
    expect(roomHref({ siteId: "s1", roomKey: "små rum" })).toBe("/prylar/rum/s1/sm%C3%A5%20rum");
  });

  it("is only the room for a place without a part", () => {
    expect(thingCrumbs(place)).toEqual([{ label: "Garaget", href: `/prylar/rum/${place.siteId}/garaget` }]);
  });

  it("names the part without a link, since a part has no page", () => {
    expect(thingCrumbs({ ...place, part: "Hylla 2" }).map((crumb) => [crumb.label, crumb.href === null])).toEqual([
      ["Garaget", false],
      ["Hylla 2", true],
    ]);
  });

  it("links a box to its page", () => {
    expect(thingCrumbs({ ...place, kind: "box", part: "Jul" })[1]).toEqual({ label: "Låda Jul", href: `/prylar/lada/${place.id}` });
    expect(thingCrumbs({ ...place, kind: "box" })[1]?.label).toBe("Låda");
  });
});

describe("the numbers of a card in the photo view", () => {
  const box = (left: number, top: number) => ({ left, top, width: 0.2, height: 0.2 });
  const things: ThingDetailCardThing[] = [
    { id: "a", name: "Hammare", box: box(0.1, 0.1) },
    { id: "b", name: "Spade", box: null },
    { id: "c", name: "Såg", box: box(0.5, 0.6) },
  ];

  it("numbers the föremål with a box in the card's order, the same as the card's page, without statuses", () => {
    expect(cardPhotoMarkers(things)).toEqual([
      { n: 1, left: 20, top: 20, name: "Hammare", status: null, location: null },
      { n: 2, left: 60, top: 70, name: "Såg", status: null, location: null },
    ]);
  });

  it("finds a föremål's number, or none for one without a box or not on the card", () => {
    expect(numberOnCard(things, "c")).toBe(2);
    expect(numberOnCard(things, "b")).toBeNull();
    expect(numberOnCard(things, "z")).toBeNull();
  });
});
