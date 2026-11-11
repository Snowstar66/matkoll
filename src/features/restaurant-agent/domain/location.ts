// Location input. Coordinates are rounded to 2 decimals (about 1 km) before they go anywhere, and only to OpenStreetMap's
// Nominatim, which the SERVER asks for the place name (data/reverse-geocode.ts); the name alone goes on to Claude, never
// the coordinates. A city or postcode typed by hand is checked here too; nothing is stored.

export type Coordinates = { lat: number; lng: number };

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Rounded coordinates (2 decimals, about 1 km), or null when they are not real (NaN, out of range). */
export function roundCoordinates(lat: unknown, lng: unknown): Coordinates | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const rounded = { lat: round2(lat), lng: round2(lng) };
  // Avoid "-0".
  return { lat: rounded.lat + 0, lng: rounded.lng + 0 };
}

export const maxPlaceTextLength = 60;

/** A Swedish postcode "123 45" or "12345", normalised to "123 45". */
const postcode = /^(\d{3})\s?(\d{2})$/;
/** Letters (including åäö and other accents), spaces, hyphens, apostrophes and dots: a place name, nothing else. */
const placeName = /^[\p{L}][\p{L}\s'.-]*$/u;

export type PlaceTextResult = { ok: true; kind: "postcode" | "city"; text: string } | { ok: false; reason: "empty" | "too_long" | "invalid" };

/** Checks the city or postcode field: trims, collapses spaces, and refuses digits mixed with letters, URLs and symbols. */
export function parsePlaceText(input: unknown): PlaceTextResult {
  if (typeof input !== "string") return { ok: false, reason: "invalid" };
  const text = input.trim().replace(/\s+/g, " ");
  if (text === "") return { ok: false, reason: "empty" };
  if (text.length > maxPlaceTextLength) return { ok: false, reason: "too_long" };
  const code = postcode.exec(text);
  if (code) return { ok: true, kind: "postcode", text: `${code[1]} ${code[2]}` };
  if (placeName.test(text)) return { ok: true, kind: "city", text };
  return { ok: false, reason: "invalid" };
}
