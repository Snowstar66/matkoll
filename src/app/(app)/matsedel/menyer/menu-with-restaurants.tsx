"use client";

import { type ComponentProps, useState } from "react";
import { cleanMenuText } from "@/features/menu-advisor";
import { MenuAdvisor } from "@/features/menu-advisor/ui/menu-advisor";
import { RestaurantAgentCard, RestaurantFlow } from "@/features/restaurant-agent/ui";
import { restaurantActions, restaurantCostText } from "./restaurant-agent-actions";

// The route layer's composition (AD-1): Menyrådgivaren with Restaurangagenten's card on its start screen. The card
// shows only with the Tillval on; one tap swaps the screen for the agent's journey. "Ta bild" there comes back to the
// advisor's start (the photo way). A menu found as text goes on to the advisor, which reads it as it would a photo;
// nothing but that text (cleaned and cut to the advisor's limit) is handed over, never the place.

export function MenuWithRestaurants({ members, profiles }: Pick<ComponentProps<typeof MenuAdvisor>, "members" | "profiles">) {
  const [agent, setAgent] = useState(false);
  const [menuText, setMenuText] = useState<string | null>(null);
  if (agent) {
    return (
      <RestaurantFlow
        actions={restaurantActions}
        costText={restaurantCostText}
        onClose={() => setAgent(false)}
        onUseMenu={(menu) => {
          const text = cleanMenuText(menu.menuText);
          if (text === "") return setAgent(false);
          setMenuText(text);
          setAgent(false);
        }}
      />
    );
  }
  return (
    <MenuAdvisor
      // A new reading for every handed-over text; none when the person came back for the photo.
      key={menuText ?? "start"}
      members={members}
      profiles={profiles}
      startWithMenuText={menuText ?? undefined}
      startSlot={<RestaurantAgentCard onOpen={() => (setMenuText(null), setAgent(true))} />}
    />
  );
}
