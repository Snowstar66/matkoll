"use client";

import { Button } from "@/components/button";
import { Sheet } from "@/components/sheet";
import type { SuggestionView } from "./actions-port";
import { distanceText, flagLines, openText, texts } from "./format";
import { MapsChip, SourceChips, WhyList } from "./result-card";

// The sheet of one place: why it fits, the facts from Google Maps with that name on them, and the sources.

export function DetailSheet({ suggestion, onClose, onChoose }: { suggestion: SuggestionView | null; onClose: () => void; onChoose: (suggestion: SuggestionView) => void }) {
  const distance = suggestion ? distanceText(suggestion.distanceM) : null;
  const open = suggestion ? openText(suggestion.openNow) : null;
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
          <dl className="flex flex-col gap-1 rounded-xl bg-bg p-3 text-body">
            {distance ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">Avstånd</dt>
                <dd className="text-right text-ink">{distance}</dd>
              </div>
            ) : null}
            {open ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">Öppet</dt>
                <dd className="text-right text-ink">{open}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Adress</dt>
              <dd className="min-w-0 text-right text-ink wrap-break-word">{suggestion.address}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <MapsChip url={suggestion.mapsUrl} />
          </div>
          <SourceChips suggestion={suggestion} />
          <p className="text-meta text-ink-3">{texts.googleLine}</p>
          <p className="text-meta text-ink-2">
            <b className="font-semibold">{texts.caveatTitle}</b> {texts.caveatBody}
          </p>
        </div>
      ) : null}
    </Sheet>
  );
}
