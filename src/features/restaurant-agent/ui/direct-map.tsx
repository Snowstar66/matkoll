import { buttonClasses } from "@/components/button";
import { PinIcon } from "@/components/icons";
import type { CuisineId } from "../domain/types";
import { ExternalLink } from "./parts";
import { directMapQuery, mapLinkFor, type MapView, texts } from "./format";

// "Sök i Google Maps": a ready search of the person's own choices, opened by a plain link they tap. One button. No AI, no
// API, no key, no cost: without a fetched place Google Maps uses the phone's own position. It works whenever the screen
// does, so it is also the way on when the agent cannot run.

/** The button alone (the question screen's main action), or `section` for the explained card on the other screens. */
export function DirectMap({ cuisines, place, view = null, primary = false }: { cuisines: readonly CuisineId[]; place: string | null; view?: MapView | null; primary?: boolean }) {
  const link = mapLinkFor(directMapQuery(cuisines, place), view);
  const buttons = (
    <ExternalLink href={link.href} className={buttonClasses(primary ? "primary" : "secondary", true)} testId="direct-map-link">
      <PinIcon size={20} />
      {texts.directOpen}
    </ExternalLink>
  );
  if (primary) return <div data-testid="direct-map">{buttons}</div>;
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-surface p-3" data-testid="direct-map">
      <h3 className="text-body font-semibold text-ink">{texts.directTitle}</h3>
      <p className="text-meta text-ink-2">{texts.directBody}</p>
      {buttons}
    </section>
  );
}
