import { describe, expect, it } from "vitest";
import {
  backToOverviewLabel,
  legendFor,
  overviewHint,
  photoMarkerName,
  photoStatusText,
  photoViewMarkers,
  zoomedHint,
  type PhotoLink,
} from "./photo-view";

const photo = {
  id: "photo-1",
  reading: ["Mjölk", "Gurka", "Vispgrädde 3 dl", "Ketchup", "vara"],
  points: [
    { n: 1, x: 100, y: 200 },
    { n: 2, x: 300, y: 400 },
    { n: 3, x: 500, y: 600 },
    { n: 4, x: 700, y: 800 },
    { n: 5, x: 900, y: 100 },
  ],
};
const link = (number: number, name: string, extra: Partial<PhotoLink> = {}): PhotoLink => ({ photoId: "photo-1", number, name, location: "Kyl", ...extra });

describe("photoViewMarkers", () => {
  it("gives a present, a gone and a skipped number their names and statuses", () => {
    const markers = photoViewMarkers({ ...photo, confirmedNumbers: [1, 2, 3] }, [link(1, "Mjölk"), link(2, "Gurka", { location: "Frys" })]);
    expect(markers.map(({ n, name, status, location }) => ({ n, name, status, location }))).toEqual([
      { n: 1, name: "Mjölk", status: "present", location: "Kyl" },
      { n: 2, name: "Gurka", status: "present", location: "Frys" },
      { n: 3, name: "Vispgrädde 3 dl", status: "gone", location: null },
      { n: 4, name: "Ketchup", status: "skipped", location: null },
    ]);
    expect(markers[2]).toMatchObject({ left: 50, top: 60 });
  });

  it("names a present number after the item as it is now, not as the AI read it", () => {
    const [marker] = photoViewMarkers({ ...photo, confirmedNumbers: [1] }, [link(1, "Mellanmjölk")]);
    expect(marker).toMatchObject({ name: "Mellanmjölk", status: "present" });
  });

  it("gives no status at all to a photo whose confirmed numbers were not kept, even for linked items", () => {
    for (const confirmedNumbers of [null, undefined]) {
      const markers = photoViewMarkers({ ...photo, confirmedNumbers }, [link(1, "Mjölk")]);
      expect(markers.map((marker) => marker.status)).toEqual([null, null, null, null]);
      expect(markers.map((marker) => marker.name)).toEqual(["Mjölk", "Gurka", "Vispgrädde 3 dl", "Ketchup"]);
    }
  });

  it("only counts items of this photo, and a living item wins over the confirmed list", () => {
    const markers = photoViewMarkers({ ...photo, confirmedNumbers: [2] }, [link(1, "Mjölk", { photoId: "other" }), link(2, "Gurka")]);
    expect(markers.map((marker) => marker.status)).toEqual(["skipped", "present", "skipped", "skipped"]);
  });

  it("leaves out numbers without a point and the placeholder, and has none for a photo without points", () => {
    expect(photoViewMarkers({ ...photo, points: [{ n: 2, x: 1, y: 1 }], confirmedNumbers: [] }, []).map((marker) => marker.n)).toEqual([2]);
    expect(photoViewMarkers({ ...photo, points: null, confirmedNumbers: [1] }, [])).toEqual([]);
  });
});

describe("the texts", () => {
  it("says what became of an item in words", () => {
    expect(photoStatusText({ status: "present", location: "Kyl" })).toBe("Finns i kylen");
    expect(photoStatusText({ status: "present", location: "Skafferi" })).toBe("Finns i skafferiet");
    expect(photoStatusText({ status: "gone", location: null })).toBe("Finns inte längre");
    expect(photoStatusText({ status: "skipped", location: null })).toBe("Lades inte till");
    expect(photoStatusText({ status: null, location: null })).toBeNull();
  });

  it("names a marker with its number, name and status, so colour is never the only carrier", () => {
    expect(photoMarkerName({ n: 3, left: 1, top: 1, name: "grädde", status: "gone", location: null })).toBe("Vara 3: Grädde, finns inte längre");
    expect(photoMarkerName({ n: 1, left: 1, top: 1, name: "Smör", status: "present", location: "Kyl" })).toBe("Vara 1: Smör, finns i kylen");
    expect(photoMarkerName({ n: 2, left: 1, top: 1, name: "Ketchup", status: "skipped", location: null })).toBe("Vara 2: Ketchup, lades inte till");
    expect(photoMarkerName({ n: 4, left: 1, top: 1, name: "Ägg", status: null, location: null })).toBe("Vara 4: Ägg");
  });

  it("explains only the kinds that occur, and nothing for a photo without statuses", () => {
    expect(legendFor([{ status: "gone" }, { status: "present" }, { status: "gone" }]).map((entry) => entry.text)).toEqual(["Finns i listan", "Finns inte längre"]);
    expect(legendFor([{ status: null }])).toEqual([]);
  });

  it("has the hints and the zoomed photo's name", () => {
    expect(overviewHint).toBe("Tryck på en siffra för att se vad det är.");
    expect(zoomedHint).toBe("Tryck på bilden för att backa.");
    expect(backToOverviewLabel("Fotot av kylen")).toBe("Fotot av kylen, tryck för att backa");
  });
});
