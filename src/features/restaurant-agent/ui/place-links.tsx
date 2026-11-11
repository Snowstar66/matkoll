import { cx } from "@/components/cx";
import { LinkIcon, PinIcon } from "@/components/icons";
import type { SuggestionView } from "./actions-port";
import { accordingTo, hostOf, mapLinks, type MapView, ratingText, safeHttpsUrl, siteLinkOf, texts } from "./format";
import { chipClass, ExternalLink } from "./parts";

// The links that let a person check a place themselves: the restaurant's page (always, when the search gave one), the
// address and opening hours when a returned page said them (each with that page and "enligt <domän>, kontrollera"),
// and a plain map link that is opened by the person (name and city only, no coordinates, nothing fetched by us).

function Quoted({ label, quoted, missing, testId }: { label: string; quoted: SuggestionView["address"]; missing: string; testId: string }) {
  if (!quoted) {
    return (
      <p className="text-meta text-ink-2" data-testid={`${testId}-missing`}>
        {missing}
      </p>
    );
  }
  const href = safeHttpsUrl(quoted.sourceUrl);
  const according = accordingTo(quoted.sourceUrl);
  return (
    <p className="text-meta text-ink-2 wrap-break-word" data-testid={testId}>
      <span className="font-semibold text-ink">{label}</span> {quoted.text}{" "}
      {href ? (
        <ExternalLink href={href} className="inline-flex items-center gap-1 text-accent underline">
          ({according})
        </ExternalLink>
      ) : (
        <span>({according})</span>
      )}
    </p>
  );
}

/** One rating from one page, with its source and link; nothing at all without one. */
function RatingLine({ rating }: { rating: NonNullable<SuggestionView["rating"]> }) {
  const href = safeHttpsUrl(rating.sourceUrl);
  const host = hostOf(rating.sourceUrl);
  if (!href || !host) return null;
  return (
    <p className="text-meta text-ink-2" data-testid="place-rating">
      {ratingText(rating)} enligt{" "}
      <ExternalLink href={href} className="inline-flex items-center gap-1 text-accent underline">
        {host}
      </ExternalLink>
      . {texts.ratingCaveat}
    </p>
  );
}

export function PlaceLinks({ suggestion, place, view = null }: { suggestion: SuggestionView; place: string; view?: MapView | null }) {
  const site = siteLinkOf(suggestion);
  const userAgent = typeof navigator === "undefined" ? null : navigator.userAgent;
  return (
    <div className="flex flex-col gap-1.5" data-testid="place-links">
      {suggestion.rating ? <RatingLine rating={suggestion.rating} /> : null}
      <Quoted label="Adress" quoted={suggestion.address} missing={texts.addressMissing} testId="place-address" />
      <Quoted label="Öppettider" quoted={suggestion.hours} missing={texts.hoursMissing} testId="place-hours" />
      <div className="flex flex-wrap gap-1.5">
        {site ? (
          <ExternalLink href={site} className={cx(chipClass, "bg-sky text-sky-ink no-underline")} testId="site-link">
            <LinkIcon size={14} />
            {texts.siteLink}
          </ExternalLink>
        ) : null}
        {mapLinks(suggestion.name, place, userAgent, view).map((link) => (
          <ExternalLink key={link.href} href={link.href} className={cx(chipClass, "bg-sky text-sky-ink no-underline")} testId="map-link">
            <PinIcon size={14} />
            {`${texts.mapOpen}: ${link.label}`}
          </ExternalLink>
        ))}
      </div>
    </div>
  );
}
