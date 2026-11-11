import type { PlaceKind } from "./types";

// Google's primary type of a place mapped to our coarse kind, used only to weigh and order (weights.ts). Pure; it reads
// one short type id (not a name, address or review) and keeps nothing.

const kinds: Readonly<Record<string, PlaceKind>> = {
  pizza_restaurant: "pizza",
  italian_restaurant: "italienskt",
  sushi_restaurant: "sushi",
  japanese_restaurant: "sushi",
  ramen_restaurant: "asiatiskt",
  chinese_restaurant: "asiatiskt",
  thai_restaurant: "asiatiskt",
  vietnamese_restaurant: "asiatiskt",
  korean_restaurant: "asiatiskt",
  asian_restaurant: "asiatiskt",
  indonesian_restaurant: "asiatiskt",
  seafood_restaurant: "fisk",
  hamburger_restaurant: "hamburgare",
  burger_restaurant: "hamburgare",
  mexican_restaurant: "mexikanskt",
  indian_restaurant: "indiskt",
  vegetarian_restaurant: "vegetariskt",
  vegan_restaurant: "vegetariskt",
  swedish_restaurant: "husmanskost",
  scandinavian_restaurant: "husmanskost",
  restaurant: "restaurant",
  fast_food_restaurant: "restaurant",
  cafe: "cafe",
  coffee_shop: "cafe",
  bakery: "cafe",
  bar: "bar",
  pub: "bar",
  night_club: "bar",
};

/** The kind for Google's primary type (`other` for a type we do not know, `restaurant` for a missing one). */
export function placeKindOf(primaryType: unknown): PlaceKind {
  if (typeof primaryType !== "string" || primaryType === "") return "restaurant";
  return kinds[primaryType] ?? (primaryType.endsWith("_restaurant") ? "restaurant" : "other");
}

/** Great-circle distance in metres (haversine). */
export function distanceMetres(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(to.lat - from.lat);
  const dLng = rad(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(a))));
}
