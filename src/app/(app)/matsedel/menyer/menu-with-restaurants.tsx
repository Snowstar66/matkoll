"use client";

import { type ComponentProps, type ReactNode, useState } from "react";
import { PinIcon } from "@/components/icons";
import { useOption } from "@/lib/use-option";
import { cleanMenuText } from "@/features/menu-advisor";
import { MenuAdvisor } from "@/features/menu-advisor/ui/menu-advisor";
import { RestaurantFlow } from "@/features/restaurant-agent/ui";
import { restaurantActions, restaurantCostText } from "./restaurant-agent-actions";

// The route layer's composition (AD-1): Menyrådgivaren with a quiet link to Sök restauranger under its photo button.
// The link shows only with the Tillval Äta ute on; one tap swaps the screen for the agent's journey. "Ta bild" there
// comes back to the advisor's start (the photo way). A menu found as text goes on to the advisor, which reads it as it
// would a photo; nothing but that text (cleaned and cut to the advisor's limit) is handed over, never the place.

/** "Inte på plats än? Sök restauranger": the way from Tolka menyn to the map, for those still looking for a place. */
function RestaurantSearchLink({ onOpen }: { onOpen: () => void }) {
  const on = useOption("restaurantAgent");
  if (!on) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="restaurant-agent-card"
      className="inline-flex min-h-tap items-center justify-center gap-2 rounded-md px-3 text-body font-medium text-ink-2 underline-offset-4 hover:underline"
    >
      <PinIcon size={18} className="shrink-0" />
      Inte på plats än? Sök restauranger
    </button>
  );
}

export function MenuWithRestaurants({
  members,
  profiles,
  canRaiseCap,
  agentHeader,
}: Pick<ComponentProps<typeof MenuAdvisor>, "members" | "profiles" | "canRaiseCap"> & {
  /** The page header above Sök restauranger (the advisor's own screens carry their title and back link). */
  agentHeader?: ReactNode;
}) {
  const [agent, setAgent] = useState(false);
  const [menuText, setMenuText] = useState<string | null>(null);
  if (agent) {
    return (
      <>
        {agentHeader}
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
      </>
    );
  }
  return (
    <MenuAdvisor
      // A new reading for every handed-over text; none when the person came back for the photo.
      key={menuText ?? "start"}
      members={members}
      profiles={profiles}
      canRaiseCap={canRaiseCap}
      startWithMenuText={menuText ?? undefined}
      startSlot={<RestaurantSearchLink onOpen={() => (setMenuText(null), setAgent(true))} />}
    />
  );
}
