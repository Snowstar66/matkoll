import type { ReactNode } from "react";
import { cx } from "@/components/cx";
import { CheckIcon, InfoIcon, LinkIcon } from "@/components/icons";
import type { SuggestionView } from "./actions-port";
import { chipClass, ExternalLink } from "./parts";
import { PlaceLinks } from "./place-links";
import { flagLines, hostOf, type MapView, safeHttpsUrl, texts } from "./format";

// One suggestion. Everything comes from the web through the search tool: the "why" each with the page it comes from,
// and the menu chip says whether menu text was quoted from a page. A claim without a source is not shown.

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

export function SourceChips({ suggestion }: { suggestion: SuggestionView }) {
  const sources = [...new Set(suggestion.why.map((reason) => hostOf(reason.sourceUrl)).filter((host): host is string => host !== null))];
  return (
    <div className="flex flex-wrap gap-1.5">
      <MenuChip status={suggestion.menuStatus} />
      {suggestion.why.flatMap((reason) => {
        const href = safeHttpsUrl(reason.sourceUrl);
        const host = hostOf(reason.sourceUrl);
        if (!href || !host || !sources.includes(host)) return [];
        sources.splice(sources.indexOf(host), 1);
        return [
          <ExternalLink key={host} href={href} className={cx(chipClass, "bg-sky text-sky-ink no-underline")} testId="source-link">
            <LinkIcon size={14} />
            {host}
          </ExternalLink>,
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

export function ResultCard({ suggestion, place, view = null, selected, onSelect, onMore }: { suggestion: SuggestionView; place: string; view?: MapView | null; selected: boolean; onSelect: () => void; onMore: () => void }): ReactNode {
  const flags = flagLines(suggestion.flags);
  return (
    <article data-testid="restaurant-card" data-selected={selected} className={cx("flex flex-col gap-2 rounded-xl bg-surface p-3.5", selected && "outline-2 outline-accent")}>
      <button type="button" onClick={onSelect} aria-pressed={selected} className="flex min-h-tap flex-col gap-1 text-left" data-testid="restaurant-select">
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 text-section-title font-semibold text-ink wrap-break-word">{suggestion.name}</span>
          {suggestion.area ? <span className="shrink-0 text-meta text-ink-2">{suggestion.area}</span> : null}
        </span>
      </button>
      <WhyList suggestion={suggestion} />
      {flags.length > 0 ? (
        <ul className="flex flex-col gap-0.5 text-meta text-ink-2">
          {flags.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <PlaceLinks suggestion={suggestion} place={place} view={view} />
      <SourceChips suggestion={suggestion} />
      <button type="button" onClick={onMore} className="min-h-tap self-start rounded-md pr-3 text-control font-semibold text-accent underline" data-testid="restaurant-more">
        {texts.moreAbout}
      </button>
    </article>
  );
}
