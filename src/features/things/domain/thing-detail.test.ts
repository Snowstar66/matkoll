import { describe, expect, it } from "vitest";
import { roomHref, thingCrumbs, type ThingDetailPlace } from "./thing-detail";

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
