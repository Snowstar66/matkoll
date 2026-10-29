"use client";

import { type ReactNode, useRef, useState } from "react";
import { Button } from "@/components/button";
import { FilterPills } from "@/components/filter-pills";
import { useToast } from "@/components/toast";
import { useAiJobs } from "@/lib/ai-jobs-client";
import { suggestFromOffersText } from "../domain/offer";

export type SuggestFromOffersButtonProps = {
  /** Without offers there is nothing to build on: the button waits, and a line says why. */
  hasOffers: boolean;
  /** Called when the job has started, e.g. to close the sheet. */
  onStarted?: () => void;
  /** Story 9.14: the stores that have offers; with two or more, Pontus picks the store the dishes are built around. */
  stores?: readonly { id: string; label: string }[];
  /** The store that is chosen until Pontus picks another: the week's best store. */
  defaultStoreId?: string;
  /** Story 14.1: the best-store line, shown first inside the card. */
  bestLine?: ReactNode;
};

/**
 * "Föreslå rätter från veckans erbjudanden" (Story 9.5, FR-36): starts an AI
 * job of the kind `suggest` with `mode: "offers"`. The server reads the
 * offers and the pantry itself, so nothing but the mode is sent (AD-25,
 * AD-28). The job runs in the background; its finished confirmation has
 * "Visa", which opens the suggestions in Recept. One job runs at a time: the
 * button waits while one is started or active. The same key again gives the
 * same job, so a retry after a lost answer never makes a second one.
 */
export function SuggestFromOffersButton({ hasOffers, onStarted, stores = [], defaultStoreId, bestLine }: SuggestFromOffersButtonProps) {
  const { showToast } = useToast();
  const { start } = useAiJobs();
  const [starting, setStarting] = useState(false);
  const key = useRef<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  // Story 9.14: with several stores the dishes are built around one of them; with one the server uses it as before.
  const choose = stores.length > 1;
  const storeId = choose ? (stores.find((store) => store.id === (picked ?? defaultStoreId))?.id ?? stores[0].id) : undefined;

  async function suggest() {
    if (starting) return;
    setStarting(true);
    const clientKey = (key.current ??= crypto.randomUUID());
    const result = await start("/api/ai/jobs", { kind: "suggest", mode: "offers", avoidTitles: [], ...(storeId ? { storeId } : {}) }, clientKey);
    setStarting(false);
    if (!result.ok) {
      // A network error may be tried again with the same key; any other answer is final for this tap.
      if (result.error.code !== "ai_unavailable") key.current = null;
      showToast(result.error.message, { role: "alert" });
      return;
    }
    key.current = null;
    showToast(suggestFromOffersText.started);
    onStarted?.();
  }

  return (
    <section aria-label="Förslag från erbjudandena" className="flex flex-col items-start gap-1 rounded-lg bg-surface px-3 py-2">
      {bestLine}
      {choose && storeId ? (
        <div className="flex w-full min-w-0 items-center gap-2" data-testid="suggest-store-picker">
          <p className="shrink-0 text-meta text-ink-2">Från:</p>
          <FilterPills
            compact
            label="Föreslå rätter från"
            options={stores.map((store) => ({ value: store.id, label: store.label }))}
            value={storeId}
            onChange={(id) => {
              key.current = null;
              setPicked(id);
            }}
            disabled={starting}
            className="min-w-0"
          />
        </div>
      ) : null}
      <Button
        type="button"
        variant="compact-primary"
        disabled={!hasOffers || starting}
        aria-label={suggestFromOffersText.button}
        aria-describedby={hasOffers ? undefined : "suggest-from-offers-hint"}
        onClick={() => void suggest()}
      >
        Föreslå rätter
      </Button>
      {hasOffers ? null : (
        <p id="suggest-from-offers-hint" className="text-meta text-ink-2">
          {suggestFromOffersText.noOffers}
        </p>
      )}
    </section>
  );
}
