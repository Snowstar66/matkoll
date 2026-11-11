"use client";

import { Button } from "@/components/button";
import { Sheet } from "@/components/sheet";
import type { SuggestionView } from "./actions-port";
import { flagLines, type MapView, texts } from "./format";
import { PlaceLinks } from "./place-links";
import { SourceChips, WhyList } from "./result-card";

// The sheet of one place: why it fits, where it is when a page says, and the sources. All of it from the web.

export function DetailSheet({ suggestion, place, view = null, onClose, onChoose }: { suggestion: SuggestionView | null; place: string; view?: MapView | null; onClose: () => void; onChoose: (suggestion: SuggestionView) => void }) {
  const flags = suggestion ? flagLines(suggestion.flags) : [];
  return (
    <Sheet
      open={suggestion !== null}
      onClose={onClose}
      title={suggestion?.name ?? "Stället"}
      closeLabel="Klar"
      footer={
        suggestion ? (
          <Button fullWidth onClick={() => onChoose(suggestion)} data-testid="restaurant-detail-choose">
            Välj {suggestion.name}
          </Button>
        ) : undefined
      }
    >
      {suggestion ? (
        <div className="flex flex-col gap-3" data-testid="restaurant-detail">
          <section className="flex flex-col gap-1">
            <h3 className="text-meta font-semibold tracking-wide text-ink-3 uppercase">Varför det passar</h3>
            <WhyList suggestion={suggestion} />
            {flags.map((line) => (
              <p key={line} className="text-meta text-ink-2">
                {line}
              </p>
            ))}
          </section>
          {suggestion.area ? (
            <p className="text-body text-ink">
              <span className="text-ink-2">Område: </span>
              {suggestion.area}
            </p>
          ) : null}
          <PlaceLinks suggestion={suggestion} place={place} view={view} />
          <SourceChips suggestion={suggestion} />
          <p className="text-meta text-ink-3">{texts.webLine}</p>
          <p className="text-meta text-ink-2">
            <b className="font-semibold">{texts.caveatTitle}</b> {texts.caveatBody}
          </p>
        </div>
      ) : null}
    </Sheet>
  );
}
