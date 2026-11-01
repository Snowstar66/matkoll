import Link from "next/link";
import { type PlanningTarget, planningBarText } from "../domain/planning";

/**
 * The bar at the top of Recept in planning mode (Story 13.8): "Lägger på
 * onsdag 4 nov · Avbryt". Avbryt leaves the mode and stays in Recept.
 */
export function PlanningBar({ target }: { target: PlanningTarget }) {
  return (
    <div
      role="status"
      data-testid="planning-bar"
      className="mb-3 flex min-h-tap items-center justify-between gap-3 rounded-lg bg-accent/15 pl-3 text-body text-ink"
    >
      <span className="min-w-0 break-words font-medium">{planningBarText(target)}</span>
      <Link href="/recept" className="flex min-h-tap shrink-0 items-center px-3 text-accent underline">
        Avbryt
      </Link>
    </div>
  );
}
