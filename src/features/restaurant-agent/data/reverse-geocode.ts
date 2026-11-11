import { cleanModelText } from "@/lib/suggest-input";

// Turns the phone's rounded position (about 1 km) into a place NAME, at OpenStreetMap's Nominatim (a third party, free,
// no account or key). Only the name goes on to Claude; the coordinates are never stored, logged or sent to Anthropic.
//
// Follows the Nominatim usage policy (https://operations.osmfoundation.org/policies/nominatim/, read 2026-11-11):
//  - triggered by one person's tap (never autocomplete, never a grid or a loop), at most 1 request per second per
//    process (waits its turn), identifying User-Agent, and a small in-memory cache of the same rounded spot;
//  - the app can be switched off without a release (env NOMINATIM_DISABLED=1, decided by the caller);
//  - the data is © OpenStreetMap contributors (ODbL): the screen says so where the place is shown.
// SSRF: the host and path are fixed here and the only variables are two finite numbers, so no user-controlled URL exists.

export type PlaceLookup = (lat: number, lng: number) => Promise<{ ok: true; place: string } | { ok: false }>;

const endpoint = "https://nominatim.openstreetmap.org/reverse";
export const userAgent = "Livskoll/1.0 (household food app; restaurant finder; https://livskoll.vercel.app)";
const timeoutMs = 4_000;
const minGapMs = 1_000;
const maxBytes = 20_000;
const cacheMs = 24 * 60 * 60 * 1000;
const maxCache = 200;

type Address = Record<string, unknown>;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** "Luthagen, Uppsala" from Nominatim's address: the district or town, then the municipality without "kommun". Null when there is no name. */
export function placeNameOf(address: Address): string | null {
  const locality = text(address.suburb) || text(address.city_district) || text(address.neighbourhood) || text(address.town) || text(address.city) || text(address.village) || text(address.hamlet);
  const town = text(address.city) || text(address.town) || text(address.village) || text(address.municipality).replace(/\s+kommun$/i, "");
  const parts = [...new Set([locality, town].filter((part) => part !== ""))];
  // One line of letters, spaces and a few marks; everything else is dropped, so nothing odd reaches the model.
  const name = cleanModelText(parts.join(", ")).replace(/[^\p{L}\s'.,-]/gu, "").trim();
  return name === "" || Array.from(name).length > 80 ? null : name;
}

const cache = new Map<string, { at: number; place: string }>();
let lastRequestAt = 0;
let queue: Promise<unknown> = Promise.resolve();

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Runs `task` after the previous one and at least a second after its start: one request per second, whatever the callers do. */
function turn<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + minGapMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    return task();
  });
  queue = run.catch(() => undefined);
  return run;
}

/** @param fetchImpl Replaced in tests. */
export function createReverseGeocoder(fetchImpl: typeof fetch = fetch): PlaceLookup {
  return async (lat, lng) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false };
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < cacheMs) return { ok: true, place: hit.place };
    const url = `${endpoint}?format=jsonv2&zoom=14&addressdetails=1&accept-language=sv&lat=${lat.toFixed(2)}&lon=${lng.toFixed(2)}`;
    try {
      const body = await turn(async () => {
        const response = await fetchImpl(url, { headers: { "User-Agent": userAgent, Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs), redirect: "error", cache: "no-store" });
        if (!response.ok) return null;
        const raw = await response.text();
        return raw.length > maxBytes ? null : raw;
      });
      if (body === null) return { ok: false };
      const parsed: unknown = JSON.parse(body);
      const address = typeof parsed === "object" && parsed !== null ? (parsed as { address?: unknown }).address : null;
      const place = typeof address === "object" && address !== null ? placeNameOf(address as Address) : null;
      if (!place) return { ok: false };
      if (cache.size >= maxCache) cache.delete(cache.keys().next().value as string);
      cache.set(key, { at: Date.now(), place });
      return { ok: true, place };
    } catch {
      // Only a fixed reason is logged, never the position.
      console.error("reverse_geocode_failed");
      return { ok: false };
    }
  };
}

/** For tests: forget the cache and the clock. */
export function resetReverseGeocoder(): void {
  cache.clear();
  lastRequestAt = 0;
}
