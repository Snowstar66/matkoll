import { catalogName, type Location } from "@/features/catalog";
import { savedPhotoMarkers } from "./place-photo";
import { definite } from "./places";
import type { PhotoPoint } from "./photo-numbers";

// Enhetlig fotovisning (Matvaror): one photo view for "Senaste foto" and for
// "Ändra vara" (PhotoViewer). Every number of a photo is a marker with a name
// and, when the photo remembers which of its numbers were confirmed, a status:
// still on the list ("Finns i kylen"), no longer there ("Finns inte längre",
// a red cross on the marker) or never added ("Lades inte till", a dashed
// ring). Photos without that memory, and items from before photos were linked
// to rows, show plain numbers. Pure, so it is tested without a browser.

/** What became of a number on the photo. */
export type PhotoMarkerStatus = "present" | "gone" | "skipped";

/** A living pantry item that was read from a photo: its number on it, its name and where it is. */
export type PhotoLink = { photoId: string; number: number; name: string; location: Location };

/** A number on the photo as the view shows it: its place in percent of the photo, its name and its status (`null` when not known). */
export type PhotoViewMarker = {
  n: number;
  left: number;
  top: number;
  name: string;
  status: PhotoMarkerStatus | null;
  /** Where the item is, for "present". */
  location: Location | null;
};

/** What the view needs to know of a saved photo. */
export type PhotoViewSource = {
  id: string;
  reading: readonly string[];
  points: readonly PhotoPoint[] | null;
  confirmedNumbers?: readonly number[] | null;
};

/**
 * The markers of a photo with their names and statuses. A photo whose
 * `confirmedNumbers` is not known has no statuses. Otherwise a number with a
 * living item linked to it is "present" (named after the item, which may have
 * been renamed since), a confirmed number without one is "gone" (named from
 * the AI's reading) and a number that was never confirmed is "skipped".
 */
export function photoViewMarkers(photo: PhotoViewSource, links: readonly PhotoLink[]): PhotoViewMarker[] {
  const confirmed = photo.confirmedNumbers ? new Set(photo.confirmedNumbers) : null;
  const living = new Map<number, PhotoLink>();
  for (const link of links) if (link.photoId === photo.id && !living.has(link.number)) living.set(link.number, link);
  return savedPhotoMarkers(photo.points ? [...photo.points] : null, [...photo.reading]).map((marker) => {
    const link = living.get(marker.label);
    const reading = photo.reading[marker.label - 1] ?? "";
    const base = { n: marker.label, left: marker.left, top: marker.top };
    if (!confirmed) return { ...base, name: reading, status: null, location: null };
    if (link) return { ...base, name: link.name, status: "present", location: link.location };
    return { ...base, name: reading, status: confirmed.has(marker.label) ? "gone" : "skipped", location: null };
  });
}

/** The status in words: "Finns i kylen", "Finns inte längre", "Lades inte till". */
export function photoStatusText(marker: Pick<PhotoViewMarker, "status" | "location">): string | null {
  switch (marker.status) {
    case "present":
      return marker.location ? `Finns i ${definite[marker.location]}` : "Finns i listan";
    case "gone":
      return "Finns inte längre";
    case "skipped":
      return "Lades inte till";
    default:
      return null;
  }
}

/** A marker's name for a screen reader, status included: "Vara 3: Grädde, finns inte längre". */
export function photoMarkerName(marker: PhotoViewMarker): string {
  const status = photoStatusText(marker);
  const label = `Vara ${marker.n}: ${catalogName(marker.name)}`;
  return status ? `${label}, ${status.charAt(0).toLowerCase()}${status.slice(1)}` : label;
}

/** What the legend under the overview explains, in this order. */
export const photoLegend: readonly { status: PhotoMarkerStatus; text: string }[] = [
  { status: "present", text: "Finns i listan" },
  { status: "gone", text: "Finns inte längre" },
  { status: "skipped", text: "Lades inte till" },
];

/** The legend's entries for these markers: only statuses that occur, none for a photo without statuses. */
export function legendFor(markers: readonly Pick<PhotoViewMarker, "status">[]): typeof photoLegend {
  return photoLegend.filter((entry) => markers.some((marker) => marker.status === entry.status));
}

/** The line under the title in the overview when nothing else is said (Ändra vara; Senaste foto adds when it was taken, photoTakenText). */
export const overviewHint = "Tryck på en siffra för att se vad det är.";

/** The line under the title when zoomed in. */
export const zoomedHint = "Tryck på bilden för att backa.";

/** The photo's name for a screen reader when zoomed: a tap goes back to the overview. */
export function backToOverviewLabel(title: string): string {
  return `${title}, tryck för att backa`;
}
