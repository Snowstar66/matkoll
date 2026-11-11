import { findRestaurants } from "@/features/restaurant-agent/server";
import type { RestaurantAgentActions } from "@/features/restaurant-agent/ui";

// The route layer's adapter between the screens of Restaurangagenten and its Server Action (AD-1). The screens' port
// (ui/actions-port.ts) is structurally identical to the action's contract; tsc checks it here and in contract-match.test.ts.
export const restaurantActions: RestaurantAgentActions = { findRestaurants };

/** What a search costs, in words, before it starts (an estimate: Google Maps and the web search are most of it). */
export const restaurantCostText = "Kostar ungefär en krona per sökning";
