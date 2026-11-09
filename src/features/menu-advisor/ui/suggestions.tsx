"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/button";
import { estimateTotalSek } from "../domain/drinks";
import type { Person } from "../domain/profile";
import { defaultSelection, recommend } from "../domain/recommend";
import { buildShareText } from "../domain/share-text";
import type { Menu } from "../domain/types";

/**
 * "Förslag till sällskapet": who could eat what, the approximate total, and a button that shares it as text
 * (Web Share, else the clipboard). Hidden when there are no people to suggest for.
 */
export function Suggestions({ menu, people }: { menu: Menu; people: Person[] }) {
  const [note, setNote] = useState<string | null>(null);
  const suggestions = useMemo(() => recommend(menu, people), [menu, people]);
  const selection = useMemo(() => defaultSelection(suggestions), [suggestions]);
  const totals = useMemo(() => estimateTotalSek(selection, menu, people), [selection, menu, people]);
  if (people.length === 0) return null;

  async function share() {
    const text = buildShareText(menu, selection, totals);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ text });
        return setNote(null);
      }
      await navigator.clipboard.writeText(text);
      setNote("Kopierat. Klistra in i ett meddelande.");
    } catch (error) {
      // Closing the share sheet is not a failure.
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNote("Det gick inte att dela. Markera och kopiera texten själv.");
    }
  }

  return (
    <section aria-label="Förslag till sällskapet" data-testid="menu-suggestions" className="flex flex-col gap-2">
      <h3 className="mx-1 text-section-label text-ink-2 uppercase">Förslag till sällskapet</h3>
      <ul className="divide-y divide-border overflow-hidden rounded-lg bg-surface">
        {suggestions.map(({ person, picks }) => {
          const top = picks.find((pick) => pick.warning === null) ?? picks[0];
          const total = totals.perPerson.find((entry) => entry.personId === person.id);
          return (
            <li key={person.id} className="px-4 py-3">
              <p className="text-row-title">
                {person.name}: {top ? top.dish.originalnamn : "ingen rätt passar"}
              </p>
              {top ? <p className="text-meta text-ink-2">{top.reasons.join(", ")}</p> : null}
              {top?.warning ? <p className="text-meta text-danger">{top.warning}</p> : null}
              {total && total.totalSek > 0 ? <p className="text-meta text-ink-2">ca {total.totalSek} kr med dryck</p> : null}
            </li>
          );
        })}
        {totals.totalSek > 0 ? (
          <li data-testid="menu-suggestions-total" className="bg-mint px-4 py-3 text-body text-mint-ink">
            <b className="font-semibold">Totalt ca {totals.totalSek} kr</b>
            {totals.drinksEstimated ? <span className="block text-meta">Dryckerna är uppskattade.</span> : null}
          </li>
        ) : null}
      </ul>
      <Button variant="secondary" fullWidth onClick={() => void share()}>
        Skicka till sällskapet
      </Button>
      {note ? (
        <p role="status" className="text-meta text-ink-2">
          {note}
        </p>
      ) : null}
    </section>
  );
}
