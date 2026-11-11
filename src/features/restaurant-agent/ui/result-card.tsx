import type { ReactNode } from "react";
import { cx } from "@/components/cx";
import { CheckIcon, InfoIcon, LinkIcon } from "@/components/icons";
import type { SuggestionView } from "./actions-port";
import { distanceText, flagLines, hostOf, openText, safeHttpsUrl, texts } from "./format";

// One suggestion. What comes from Google Maps (name, distance, open or closed, the map link) is shown as Google gave
// it, never reworded, and the words "Google Maps" stand on the chip next to it (Google's terms). What comes from the
// restaurant's own site is the "why", each with its source. A claim without a source is not shown.

export const chipClass = "inline-flex min-h-7 items-center gap-1 rounded-pill px-2.5 py-0.5 text-badge font-semibold";

export function MenuChip({ status }: { status: SuggestionView["menuStatus"] }) {
  return status === "found" ? (
    <span className={cx(chipClass, "bg-mint text-mint-ink")} data-testid="menu-status">
      <CheckIcon size={14} />
      {texts.menuFound}
    </span>
  ) : (
    <span className={cx(chipClass, "bg-sand text-sand-ink")} data-testid="menu-status">
      <InfoIcon size={14} />
      {texts.menuMissing}
    </span>
  );
}

/** The chip that opens the place in Google Maps; "Google Maps" is its text, as the attribution requires. */
export function MapsChip({ url }: { url: string }) {
  const href = safeHttpsUrl(url);
  if (!href) return <span className={cx(chipClass, "bg-sky text-sky-ink")}>Google Maps</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cx(chipClass, "bg-sky text-sky-ink no-underline")} data-testid="maps-link">
      <LinkIcon size={14} />
      Google Maps
    </a>
  );
}

export function SourceChips({ suggestion }: { suggestion: SuggestionView }) {
  const sources = [...new Set(suggestion.why.map((reason) => hostOf(reason.sourceUrl)).filter((host): host is string => host !== null))];
  return (
    <div className="flex flex-wrap gap-1.5">
      <MenuChip status={suggestion.menuStatus} />
      <MapsChip url={suggestion.mapsUrl} />
      {suggestion.why.flatMap((reason) => {
        const href = safeHttpsUrl(reason.sourceUrl);
        const host = hostOf(reason.sourceUrl);
        if (!href || !host || !sources.includes(host)) return [];
        sources.splice(sources.indexOf(host), 1);
        return [
          <a key={host} href={href} target="_blank" rel="noopener noreferrer" className={cx(chipClass, "bg-sky text-sky-ink no-underline")} data-testid="source-link">
            <LinkIcon size={14} />
            {host}
          </a>,
        ];
      })}
    </div>
  );
}

export function WhyList({ suggestion }: { suggestion: SuggestionView }) {
  if (suggestion.why.length === 0 || suggestion.menuStatus === "missing") {
    return <p className="text-body text-ink">{suggestion.menuStatus === "missing" ? texts.menuMissingWhy : "Inget skäl har någon källa."}</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {suggestion.why.map((reason, index) => (
        <li key={index} className="text-body text-ink wrap-break-word">
          {reason.text}
        </li>
      ))}
    </ul>
  );
}

export function ResultCard({ suggestion, selected, onSelect, onMore }: { suggestion: SuggestionView; selected: boolean; onSelect: () => void; onMore: () => void }): ReactNode {
  const distance = distanceText(suggestion.distanceM);
  const open = openText(suggestion.openNow);
  const flags = flagLines(suggestion.flags);
  return (
    <article data-testid="restaurant-card" data-selected={selected} className={cx("flex flex-col gap-2 rounded-xl bg-surface p-3.5", selected && "outline-2 outline-accent")}>
      <button type="button" onClick={onSelect} aria-pressed={selected} className="flex min-h-tap flex-col gap-1 text-left" data-testid="restaurant-select">
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 text-section-title font-semibold text-ink wrap-break-word">{suggestion.name}</span>
          {distance ? <span className="shrink-0 text-meta text-ink-2">{distance}</span> : null}
        </span>
        {open ? <span className="text-meta text-ink-2">{open}</span> : null}
      </button>
      <WhyList suggestion={suggestion} />
      {flags.length > 0 ? (
        <ul className="flex flex-col gap-0.5 text-meta text-ink-2">
          {flags.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <SourceChips suggestion={suggestion} />
      <button type="button" onClick={onMore} className="min-h-tap self-start rounded-md pr-3 text-control font-semibold text-accent underline" data-testid="restaurant-more">
        {texts.moreAbout}
      </button>
    </article>
  );
}
