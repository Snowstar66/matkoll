"use client";

import { WelcomeTour } from "@/features/welcome/ui/welcome-tour";
import { useAreasMessage, useWelcomeExit } from "../welcome-exit";

/** The tour played again (Story 20.1): Hoppa över and Esc go back to `returnTo`, the choices lead on. */
export function ReplayTour({ returnTo }: { returnTo: string }) {
  const onExit = useWelcomeExit(returnTo);
  const areasMessage = useAreasMessage();
  return (
    <WelcomeTour
      onAreasChosen={areasMessage.choose}
      onExit={(exit, photo) => {
        onExit(exit, photo);
        areasMessage.announce();
      }}
    />
  );
}
