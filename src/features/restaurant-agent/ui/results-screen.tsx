"use client";

import { useState } from "react";
import { SlidersIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import type { RestaurantSettings } from "../domain/types";
import type { SuggestionView } from "./actions-port";
import { DetailSheet } from "./detail-sheet";
import { partyText, radiusLabels, resultsTitle, shown, texts } from "./format";
import { BackLink, BigButton, Headline, StickyFooter } from "./parts";
import { ResultCard } from "./result-card";

// Step 3: three to five places, the best first and already chosen. One tap on "Välj" hands over to Menyrådgivaren.
// The caveat about opening hours stands above the buttons all the time, not behind a link.

export function ResultsScreen({
  suggestions,
  settings,
  where,
  onChoose,
  onSettings,
  onBack,
}: {
  suggestions: readonly SuggestionView[];
  settings: RestaurantSettings;
  where: string;
  onChoose: (suggestion: SuggestionView) => void;
  onSettings: () => void;
  onBack: () => void;
}) {
  const list = shown(suggestions);
  const [selectedId, setSelectedId] = useState(list[0]?.placeId ?? "");
  const [detail, setDetail] = useState<SuggestionView | null>(null);
  const selected = list.find((entry) => entry.placeId === selectedId) ?? list[0];
  return (
    <div className="flex min-h-[calc(100dvh-14rem)] flex-1 flex-col gap-3" data-testid="restaurant-results">
      <div className="flex items-center justify-between">
        <BackLink onClick={onBack}>{texts.adjust}</BackLink>
        <button type="button" onClick={onSettings} aria-label={texts.settingsOpen} data-testid="restaurant-settings-open" className="flex min-h-tap min-w-tap items-center justify-center rounded-md text-accent">
          <SlidersIcon size={22} />
        </button>
      </div>
      <Headline sub={`${partyText(settings.party)}, inom ${radiusLabels[settings.radiusM]} från ${where}`}>{resultsTitle(list.length)}</Headline>
      {list.length < 3 ? <Notice role="status">{list.length === 1 ? "Bara 1 ställe gick att styrka." : `Bara ${list.length} ställen gick att styrka.`} Andra som jag hittade kunde jag inte kontrollera, så de visas inte.</Notice> : null}
      <div className="flex flex-col gap-3">
        {list.map((suggestion) => (
          <ResultCard key={suggestion.placeId} suggestion={suggestion} selected={suggestion.placeId === selected?.placeId} onSelect={() => setSelectedId(suggestion.placeId)} onMore={() => setDetail(suggestion)} />
        ))}
      </div>
      <Notice>
        <b className="font-semibold">{texts.caveatTitle}</b> {texts.caveatBody}
      </Notice>
      <p className="text-meta text-ink-3" data-testid="google-attribution">
        {texts.googleLine}
      </p>
      <StickyFooter>
        {selected ? (
          <BigButton data-testid="restaurant-choose" onClick={() => onChoose(selected)}>
            Välj {selected.name}
          </BigButton>
        ) : null}
      </StickyFooter>
      <DetailSheet suggestion={detail} onClose={() => setDetail(null)} onChoose={(suggestion) => (setDetail(null), onChoose(suggestion))} />
    </div>
  );
}
