import "server-only";
import type { Coordinates } from "../domain/location";
import type { RadiusM } from "../domain/types";

// Google Places API (New): the finder. Google content (names, addresses, hours) passes through here to the browser and
// nowhere else: it is never logged, stored or given to the model (legal design in domain/types.ts). The coordinates
// arrive already rounded and go only to Google.

const base = "https://places.googleapis.com/v1";

/**
 * The field mask is the minimum the screen shows plus what the finder needs: id, name, address, location (distance),
 * primary type (weighting), Maps link, open now, and the restaurant's own website address. websiteUri and
 * currentOpeningHours put the request in the Enterprise tier (35 USD per 1000, domain/cost.ts usdPerPlacesRequest).
 * Rating is left out: nothing shows it.
 */
export const placesFieldMask = ["places.id", "places.displayName", "places.formattedAddress", "places.location", "places.primaryType", "places.googleMapsUri", "places.currentOpeningHours.openNow", "places.websiteUri"].join(",");

export type RawPlace = {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  primaryType: string | null;
  mapsUrl: string | null;
  openNow: boolean | null;
  websiteUri: string | null;
};

export type PlacesQuery = { kind: "nearby"; at: Coordinates; radiusM: RadiusM } | { kind: "text"; text: string };

export type PlacesOutcome = { ok: true; places: RawPlace[] } | { ok: false; reason: "http" | "network" | "shape" };

const maxResults = 20;
const timeoutMs = 8_000;

const str = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

function toPlace(item: unknown): RawPlace | null {
  const place = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : null;
  const id = str(place?.id);
  if (!place || !id) return null;
  const name = typeof place.displayName === "object" && place.displayName !== null ? str((place.displayName as Record<string, unknown>).text) : null;
  const location = typeof place.location === "object" && place.location !== null ? (place.location as Record<string, unknown>) : {};
  const hours = typeof place.currentOpeningHours === "object" && place.currentOpeningHours !== null ? (place.currentOpeningHours as Record<string, unknown>) : {};
  return {
    id,
    name: name ?? "",
    address: str(place.formattedAddress) ?? "",
    lat: num(location.latitude),
    lng: num(location.longitude),
    primaryType: str(place.primaryType),
    mapsUrl: str(place.googleMapsUri),
    openNow: typeof hours.openNow === "boolean" ? hours.openNow : null,
    websiteUri: str(place.websiteUri),
  };
}

/** One Places request (Nearby Search around coordinates, or Text Search for a typed place). Never throws; logs only a reason. */
export async function searchPlaces(apiKey: string, query: PlacesQuery, fetcher: typeof fetch = fetch): Promise<PlacesOutcome> {
  const nearby = query.kind === "nearby";
  const body = nearby
    ? { includedTypes: ["restaurant"], maxResultCount: maxResults, languageCode: "sv", regionCode: "SE", locationRestriction: { circle: { center: { latitude: query.at.lat, longitude: query.at.lng }, radius: query.radiusM } } }
    : { textQuery: query.text, includedType: "restaurant", maxResultCount: maxResults, languageCode: "sv", regionCode: "SE" };
  try {
    const response = await fetcher(`${base}/places:${nearby ? "searchNearby" : "searchText"}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey, "x-goog-fieldmask": placesFieldMask },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("restaurant_places_http", { status: response.status });
      return { ok: false, reason: "http" };
    }
    const json: unknown = await response.json();
    const list = typeof json === "object" && json !== null ? (json as Record<string, unknown>).places : undefined;
    if (list !== undefined && !Array.isArray(list)) return { ok: false, reason: "shape" };
    return { ok: true, places: (list ?? []).flatMap((item) => toPlace(item) ?? []) };
  } catch {
    console.error("restaurant_places_failed");
    return { ok: false, reason: "network" };
  }
}
