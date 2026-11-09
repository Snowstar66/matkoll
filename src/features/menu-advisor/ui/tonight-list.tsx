"use client";

import { Button } from "@/components/button";
import { CameraIcon, ChevronLeftIcon } from "@/components/icons";
import { summarizePicks, type TonightPick } from "../domain/tonight";

/** Ikväll: the dishes starred in this session, with the sum in kronor (priced dishes only, about). Gone when the tab closes. */
export function TonightList({
  picks,
  onRemove,
  onClear,
  onBack,
  onNext,
}: {
  picks: TonightPick[];
  onRemove: (pick: TonightPick) => void;
  onClear: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { count, totalSek, unpriced } = summarizePicks(picks);
  return (
    <section aria-label="Ikväll" data-testid="menu-tonight" className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="-ml-2 flex min-h-tap min-w-tap items-center gap-1 self-start rounded-md px-2 text-body text-accent">
        <ChevronLeftIcon size={20} />
        Tillbaka
      </button>
      <div>
        <h2 className="text-section-title text-ink">Ikväll</h2>
        <p className="text-meta text-ink-2">{count === 0 ? "Inga rätter valda än" : `${count} ${count === 1 ? "rätt" : "rätter"} · töms när fliken stängs`}</p>
      </div>
      {count > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-lg bg-surface">
          {picks.map((pick) => (
            <li key={pick.id} data-testid="menu-tonight-row" className="flex items-center gap-2 py-2 pr-1 pl-4">
              <div className="min-w-0 flex-1">
                <p className="text-row-title">{pick.name}</p>
                <p className="text-meta text-ink-2">{[pick.restaurant, pick.explanation].filter(Boolean).join(" · ")}</p>
              </div>
              <span className="shrink-0 text-control">{pick.sek === null ? "" : `ca ${pick.sek} kr`}</span>
              <button
                type="button"
                aria-label={`Ta bort ${pick.name}`}
                onClick={() => onRemove(pick)}
                className="flex size-tap shrink-0 items-center justify-center rounded-md text-headline text-accent"
              >
                <span aria-hidden="true">★</span>
              </button>
            </li>
          ))}
          <li data-testid="menu-tonight-total" className="bg-mint px-4 py-3 text-body text-mint-ink">
            <b className="font-semibold">Totalt ca {totalSek} kr</b>
            {unpriced > 0 ? <span className="block text-meta">{unpriced === 1 ? "1 rätt saknar pris och räknas inte med" : `${unpriced} rätter saknar pris och räknas inte med`}</span> : null}
          </li>
        </ul>
      ) : (
        <p className="text-body text-ink-2">Tryck på stjärnan vid en rätt för att jämföra den här.</p>
      )}
      <div className="flex flex-col gap-2">
        <Button fullWidth onClick={onNext}>
          <CameraIcon size={20} />
          Fota nästa meny
        </Button>
        {count > 0 ? (
          <Button variant="secondary" fullWidth onClick={onClear}>
            Rensa listan
          </Button>
        ) : null}
      </div>
    </section>
  );
}
