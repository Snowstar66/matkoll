"use client";

import { useState } from "react";
import { Button } from "@/components/button";
import { Checkbox } from "@/components/checkbox";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import type { Location } from "@/features/catalog";
import {
  currentAmountText,
  incompleteComparisonText,
  notSeenKeepText,
  notSeenNamesText,
  notSeenPickText,
  notSeenQuestionText,
  notSeenSheetTitle,
  removeCheckedText,
} from "../domain/pantry-suggestion";
import { groupSuggestions, type MissingItem } from "../domain/place-inventory";
import { usePantrySuggestions } from "./pantry-suggestions";

// UX-08: a small optional card above the list once a photo has been saved:
// "5 varor syntes inte på fotot. Ta bort dem?", with the names under it and
// "Behåll" and "Välj vilka". "Välj vilka" opens a sheet with a tick box for
// each item (none ticked from the start: nothing is removed without a tick)
// and "Ta bort N varor"; "Tog bort N varor." with "Ångra" follows. The card
// goes after either choice, and with the next photo of the place. It waits
// while the photo's review still has rows (usePantryAnalysis keeps what was
// not seen), and shows only on the place and location the photo is of.

export function NotSeenCard({ siteId, location }: { siteId: string; location: Location }) {
  const { notSeen, result, clearNotSeen, removeNotSeen } = usePantrySuggestions();
  const [picking, setPicking] = useState(false);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reviewOpen = result ? (({ added, changed }) => added.length + changed.length > 0)(groupSuggestions(result)) : false;
  const showing = notSeen !== null && notSeen.siteId === siteId && notSeen.location === location && !reviewOpen;
  if (!showing || !notSeen) return null;
  const { items, incomplete } = notSeen;

  async function remove(chosen: readonly MissingItem[]) {
    if (saving || chosen.length === 0) return;
    setSaving(true);
    setError(null);
    const failure = await removeNotSeen(chosen);
    setSaving(false);
    if (failure) {
      setError(failure.message);
      return;
    }
    setPicking(false);
    setTicked(new Set());
  }

  const chosen = items.filter((item) => ticked.has(item.id));
  return (
    <>
      <section
        data-testid="pantry-not-seen"
        aria-label={notSeenQuestionText(items.length)}
        className="flex flex-col gap-1.5 rounded-lg bg-surface px-4 py-3"
      >
        <h2 className="text-body font-medium text-ink">{notSeenQuestionText(items.length)}</h2>
        <p className="text-meta text-ink-2 break-words">{notSeenNamesText(items.map(({ name }) => name))}</p>
        {incomplete ? <p className="text-meta text-ink-2">{incompleteComparisonText}</p> : null}
        <div className="flex justify-end gap-1 pt-1">
          <Button variant="text" onClick={clearNotSeen}>
            {notSeenKeepText}
          </Button>
          <Button variant="text" onClick={() => setPicking(true)}>
            {notSeenPickText}
          </Button>
        </div>
      </section>
      <Sheet
        open={picking}
        onClose={() => setPicking(false)}
        title={notSeenSheetTitle}
        closeLabel="Avbryt"
        preventClose={saving}
        footer={
          <>
            {error ? <Notice role="alert">{error}</Notice> : null}
            <Button fullWidth disabled={saving || chosen.length === 0} onClick={() => void remove(chosen)}>
              {saving ? "Tar bort …" : removeCheckedText(chosen.length)}
            </Button>
          </>
        }
      >
        <ul className="flex flex-col overflow-hidden rounded-lg bg-surface">
          {items.map((item) => (
            <li
              key={item.id}
              data-testid="pantry-not-seen-item"
              className="flex min-h-12 items-center gap-3 border-t border-hairline py-1.5 pr-1 pl-4 first:border-t-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-body break-words text-ink">{item.name}</p>
                <p className="text-meta text-ink-2">{currentAmountText(item.location, item.stock)}</p>
              </div>
              <Checkbox
                checked={ticked.has(item.id)}
                onCheckedChange={(on) =>
                  setTicked((before) => {
                    const next = new Set(before);
                    if (on) next.add(item.id);
                    else next.delete(item.id);
                    return next;
                  })
                }
                label={`Ta bort ${item.name}`}
                disabled={saving}
              />
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
