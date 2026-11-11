import { vi } from "vitest";
import type { FindResult, RestaurantAgentActions, SuggestionView } from "./actions-port";

// A typed in-memory fake of the backend's action, for the screens' tests (not exported from index). The restaurant
// names are invented.

export const salvia: SuggestionView = {
  placeId: "place-salvia",
  name: "Trattoria Salvia",
  address: "Exempelgatan 4, Uppsala",
  distanceM: 700,
  openNow: true,
  mapsUrl: "https://www.google.com/maps/place/?q=place_id:place-salvia",
  why: [{ text: "Fyra vegetariska pastarätter och en pizza utan nötter.", sourceUrl: "https://www.trattoriasalvia.example/meny" }],
  menuStatus: "found",
  menuText: "Pasta al pomodoro 135 kr\nPizza margherita 125 kr",
  flags: ["allergy_unverified"],
};

export const fyrvaktaren: SuggestionView = {
  placeId: "place-fyr",
  name: "Bistro Fyrvaktaren",
  address: "Hamngatan 1, Uppsala",
  distanceM: 1200,
  openNow: false,
  mapsUrl: "https://www.google.com/maps/place/?q=place_id:place-fyr",
  why: [{ text: "Två vegetariska rätter. Barnmeny finns.", sourceUrl: "https://fyrvaktaren.example/" }],
  menuStatus: "found",
  menuText: "Husmanskost",
  flags: [],
};

export const wok: SuggestionView = {
  placeId: "place-wok",
  name: "Wok & Ris Kök 7",
  address: "Storgatan 7, Uppsala",
  distanceM: 1800,
  openNow: null,
  mapsUrl: "https://www.google.com/maps/place/?q=place_id:place-wok",
  why: [],
  menuStatus: "missing",
  menuText: null,
  flags: ["menu_missing", "open_hours_unverified"],
};

export const okResult = (suggestions: SuggestionView[] = [salvia, fyrvaktaren, wok]): FindResult => ({ status: "ok", suggestions, costSek: 0.6, model: "haiku-5.5" });

export function fakeActions(result: FindResult = okResult()): RestaurantAgentActions & { findRestaurants: ReturnType<typeof vi.fn> } {
  return { findRestaurants: vi.fn(async () => result) } as never;
}
