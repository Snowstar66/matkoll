"use client";

import { type ComponentProps, useState } from "react";
import { MenuAdvisor } from "@/features/menu-advisor/ui/menu-advisor";
import { RestaurantAgentCard, RestaurantFlow } from "@/features/restaurant-agent/ui";
import { restaurantActions, restaurantCostText } from "./restaurant-agent-actions";

// The route layer's composition (AD-1): Menyrådgivaren with Restaurangagenten's card on its start screen. The card
// shows only with the Tillval on; one tap swaps the screen for the agent's journey, and "Ta bild" there comes back here.
// TODO(restaurang-agent): `onUseMenu` is left out on purpose. Menyrådgivaren reads a photo (POST /api/menu/read takes an
// image only), so a menu found as text cannot be handed over yet; the handover screen shows the text and the photo way.

export function MenuWithRestaurants({ members, profiles }: Pick<ComponentProps<typeof MenuAdvisor>, "members" | "profiles">) {
  const [agent, setAgent] = useState(false);
  if (agent) return <RestaurantFlow actions={restaurantActions} costText={restaurantCostText} onClose={() => setAgent(false)} />;
  return <MenuAdvisor members={members} profiles={profiles} startSlot={<RestaurantAgentCard onOpen={() => setAgent(true)} />} />;
}
