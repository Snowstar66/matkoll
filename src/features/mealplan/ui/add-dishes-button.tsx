"use client";

import { PlusIcon } from "@/components/icons";

/** The page's header and the planner are apart (server page, client planner): the "+" tells it by this event. */
export const openAddDishesEvent = "matkoll:open-add-dishes";

/** "+" in Matsedel's header (UX-07): opens Lägg till nya rätter for the week shown, and scrolls to it. */
export function AddDishesButton() {
  return (
    <button
      type="button"
      aria-label="Lägg till rätt"
      data-testid="add-dishes-header"
      onClick={() => window.dispatchEvent(new Event(openAddDishesEvent))}
      className="flex size-tap items-center justify-center rounded-full text-accent"
    >
      <PlusIcon size={26} />
    </button>
  );
}
