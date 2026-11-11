import type { FindInput, FindResult, RestaurantAgentActions } from "@/features/restaurant-agent/ui";

// The route layer's adapter between the screens of Restaurangagenten and its Server Action (AD-1).
//
// TODO(restaurang-agent PR 2): replace this stub with the real action once PR 2 is on main:
//   import { findRestaurants } from "@/features/restaurant-agent/server";
//   export const restaurantActions: RestaurantAgentActions = { findRestaurants };
// The contract is identical (ui/actions-port.ts), so nothing else changes.
async function findRestaurants(input: FindInput): Promise<FindResult> {
  void input;
  return { status: "error", code: "not_ready", message: "Restaurangagenten är inte klar än. Ta en bild på menyn i stället." };
}

export const restaurantActions: RestaurantAgentActions = { findRestaurants };

/** What a search costs, in words, before it starts (an estimate: Google Maps and the web search are most of it). */
export const restaurantCostText = "Kostar ungefär en krona per sökning";
