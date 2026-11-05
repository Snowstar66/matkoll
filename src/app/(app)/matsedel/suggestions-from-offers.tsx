"use client";

import { lazy, Suspense, useId, useState } from "react";
import type { SearchIngredients } from "@/components/ingredient-picker";
import { ChevronDownIcon, SparkleIcon } from "@/components/icons";
import { cx } from "@/components/cx";
import type { AddToPlan } from "@/features/recipes/ui/add-to-plan-button";
import type { SuggestionsRead } from "./suggestions-panel";

// "Förslag från erbjudanden och lagret" on Matsedel (Story 9.6): a row under
// the week tiles that opens a short list of suggestions, never a week plan.
// Pontus's own recipes come first, read at once without the AI (the offers of
// all his stores and what is at home); "Lägg på en dag" asks for a day and adds
// the dish there. Under them, "Föreslå rätter med AI" asks the same job as
// Story 9.5 for at most two new dishes, with the usual preview before saving.
// Nothing is ever added on its own. Only the row is loaded with the page; the
// panel (suggestions-panel.tsx) is loaded the first time the row is opened.

const SuggestionsPanel = lazy(() => import("./suggestions-panel"));

export type SuggestionsFromOffersProps = {
  read: SuggestionsRead;
  addToPlan: AddToPlan;
  searchIngredients: SearchIngredients;
};

export function SuggestionsFromOffers({ read, addToPlan, searchIngredients }: SuggestionsFromOffersProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  // Once opened, the panel stays mounted (hidden when closed), so its suggestions and its job stay.
  const [opened, setOpened] = useState(false);

  return (
    <section data-testid="suggestions-from-offers" className="mb-4 flex flex-col gap-3">
      <button
        type="button"
        data-testid="suggestions-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((current) => !current);
          setOpened(true);
        }}
        className="flex min-h-tap w-full items-center gap-3 rounded-lg bg-surface px-4 py-2 text-left text-row-title text-ink"
      >
        <SparkleIcon size={22} />
        <span className="min-w-0 flex-1">Förslag från erbjudanden och lagret</span>
        <ChevronDownIcon size={20} className={cx("shrink-0 text-ink-2 motion-safe:transition-transform", open && "rotate-180")} />
      </button>
      {opened ? (
        <Suspense fallback={open ? <p className="text-meta text-ink-2">Letar bland dina recept …</p> : null}>
          <SuggestionsPanel id={panelId} open={open} read={read} addToPlan={addToPlan} searchIngredients={searchIngredients} />
        </Suspense>
      ) : null}
    </section>
  );
}
