import { findRestaurants } from "@/features/restaurant-agent/server";
import type { RestaurantAgentActions } from "@/features/restaurant-agent/ui";

// The route layer's adapter between the screens of Restaurangagenten and its Server Actions (AD-1). The screens' port
// (ui/actions-port.ts) is structurally identical to the actions' contract; tsc checks it here and in contract-match.test.ts.
// findRestaurants (the AI web search) is parked behind the Tillval restaurantAgentWeb; the screens only offer it with that
// on. The Tillval is per device and the action does not know it, so the gate is the screen's, not the server's.
export const restaurantActions: RestaurantAgentActions = { findRestaurants };

/** What the web search costs, in words, before it starts (an estimate: the searches and the pages read; the map search is free). */
export const restaurantCostText = "Webbsökningen kostar cirka 1 kr";
