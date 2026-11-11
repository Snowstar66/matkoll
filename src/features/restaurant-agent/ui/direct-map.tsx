import { buttonClasses } from "@/components/button";
import { PinIcon } from "@/components/icons";
import type { CuisineId } from "../domain/types";
import { ExternalLink } from "./parts";
import { directMapQuery, mapLinksFor, type MapView, texts } from "./format";

// "Sök i kartan": a ready search of the person's own choices, opened in the map app by a plain link they tap. Always two
// buttons, Apple Kartor and Google Maps, side by side (stacked when narrow or with larger text); the device only decides
// which comes first. No AI, no API, no key, no cost, no permission: with no typed place the map app uses the phone's own
// position. It works whenever the screen does, so it is also the way on when the agent cannot run.

/** The two buttons alone (the question screen's main action), or `section` for the explained card on the other screens. */
export function DirectMap({ cuisines, place, view = null, primary = false }: { cuisines: readonly CuisineId[]; place: string | null; view?: MapView | null; primary?: boolean }) {
  const userAgent = typeof navigator === "undefined" ? null : navigator.userAgent;
  const links = mapLinksFor(directMapQuery(cuisines, place), userAgent, view);
  const buttons = (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))] gap-2">
      {links.map((link, index) => (
        <ExternalLink key={link.href} href={link.href} className={buttonClasses(primary && index === 0 ? "primary" : "secondary")} testId="direct-map-link">
          <PinIcon size={20} />
          {`${texts.directOpen} ${link.label}`}
        </ExternalLink>
      ))}
    </div>
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
