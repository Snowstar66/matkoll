import { vi } from "vitest";
import type { FindResult, RestaurantAgentActions, SuggestionView } from "./actions-port";

// A typed in-memory fake of the backend's action, for the screens' tests (not exported from index). The restaurant
// names are invented.

export const salvia: SuggestionView = {
  id: "place-salvia",
  name: "Trattoria Salvia",
  area: "Centrum",
  website: "https://www.trattoriasalvia.example/",
  why: [{ text: "Fyra vegetariska pastarätter och en pizza utan nötter.", sourceUrl: "https://www.trattoriasalvia.example/meny" }],
  menuStatus: "found",
  menuText: "Pasta al pomodoro 135 kr\nPizza margherita 125 kr",
  address: { text: "Exempelgatan 4", sourceUrl: "https://www.trattoriasalvia.example/kontakt" },
  hours: { text: "Mån-fre 11-21", sourceUrl: "https://www.trattoriasalvia.example/kontakt" },
  rating: { value: 4.3, scale: 5, count: 120, sourceName: "omdomen.example", sourceUrl: "https://omdomen.example/salvia" },
  flags: ["allergy_unverified"],
};

export const fyrvaktaren: SuggestionView = {
  id: "place-fyr",
  name: "Bistro Fyrvaktaren",
  area: null,
  website: null,
  why: [{ text: "Två vegetariska rätter. Barnmeny finns.", sourceUrl: "https://fyrvaktaren.example/" }],
  menuStatus: "found",
  menuText: "Husmanskost",
  address: null,
  hours: null,
  rating: null,
  flags: [],
};

export const wok: SuggestionView = {
  id: "place-wok",
  name: "Wok & Ris Kök 7",
  area: null,
  website: null,
  why: [],
  menuStatus: "missing",
  menuText: null,
  address: null,
  hours: null,
  rating: null,
  flags: ["menu_missing", "open_hours_unverified"],
};

export const okResult = (suggestions: SuggestionView[] = [salvia, fyrvaktaren, wok]): FindResult => ({ status: "ok", suggestions, costSek: 0.6, model: "haiku-5.5", place: "Uppsala" });

export function fakeActions(result: FindResult = okResult()): RestaurantAgentActions & { findRestaurants: ReturnType<typeof vi.fn> } {
  return { findRestaurants: vi.fn(async () => result) } as never;
}
