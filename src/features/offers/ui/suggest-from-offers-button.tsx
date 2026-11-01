"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/button";
import { ChoiceRows } from "@/components/choice-rows";
import { cx } from "@/components/cx";
import { useToast } from "@/components/toast";
import { useAiJobs } from "@/lib/ai-jobs-client";
import { suggestFromOffersText } from "../domain/offer";

/** The job: the same key again gives the same job, so a retry after a lost answer never makes a second one. */
function useSuggestJob(onStarted?: () => void) {
  const { showToast } = useToast();
  const { start } = useAiJobs();
  const [starting, setStarting] = useState(false);
  const key = useRef<string | null>(null);

  async function suggest(storeId?: string) {
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
  return {
    starting,
    suggest,
    resetKey: () => {
      key.current = null;
    },
  };
}

export type SuggestFromOffersButtonProps = {
  /** Without offers there is nothing to build on: the button waits, and a line says why. */
  hasOffers: boolean;
  /** Called when the job has started, e.g. to close the sheet. */
  onStarted?: () => void;
  /** Story 16.10: with two or more stores the button asks which one first (the sheet shows `StoreChoice`) instead of starting. */
  onChoose?: () => void;
  /** Story 16.11: placement from the card around it (e.g. pushed to the right). */
  className?: string;
};

/**
 * "✨ Föreslå rätter" (Story 9.5, FR-36, Story 16.10): starts an AI job of the
 * kind `suggest` with `mode: "offers"`. The server reads the offers and the
 * pantry itself, so only the mode (and with several stores the chosen one) is
 * sent (AD-25, AD-28). The job runs in the background; its finished
 * confirmation has "Visa", which opens the suggestions in Recept. One job runs
 * at a time: the button waits while one is started or active.
 */
export function SuggestFromOffersButton({ hasOffers, onStarted, onChoose, className }: SuggestFromOffersButtonProps) {
  const { starting, suggest } = useSuggestJob(onStarted);
  return (
    <div className={cx("flex flex-col items-start gap-1", className)}>
      <Button
        type="button"
        variant="compact-primary"
        disabled={!hasOffers || starting}
        aria-label={suggestFromOffersText.button}
        aria-describedby={hasOffers ? undefined : "suggest-from-offers-hint"}
        onClick={() => (onChoose ? onChoose() : void suggest())}
      >
        <span aria-hidden="true">{"✨"}</span>
        Föreslå rätter
      </Button>
      {hasOffers ? null : (
        <p id="suggest-from-offers-hint" className="text-meta text-ink-2">
          {suggestFromOffersText.noOffers}
        </p>
      )}
    </div>
  );
}

/**
 * Story 16.10: "Föreslå rätter från vilken butik?". A big radio option per
 * store (the best one says why and is chosen at first) and one button that
 * starts the job with that store.
 */
export function StoreChoice({
  stores,
  defaultStoreId,
  bestStoreId,
  onStarted,
}: {
  stores: readonly { id: string; label: string }[];
  defaultStoreId: string;
  /** The week's best store, marked "passar dig bäst". */
  bestStoreId?: string;
  onStarted?: () => void;
}) {
  const { starting, suggest, resetKey } = useSuggestJob(onStarted);
  const [picked, setPicked] = useState(defaultStoreId);
  return (
    <div className="flex flex-col gap-4" data-testid="store-choice">
      {/* Story 19.5: rows with a check; the chosen row has no frame, only a green check on the right. */}
      <ChoiceRows
        label="Föreslå rätter från vilken butik?"
        value={picked}
        disabled={starting}
        onChange={(id) => {
          resetKey();
          setPicked(id);
        }}
        options={stores.map((store) => ({
          value: store.id,
          label: store.label,
          detail: store.id === bestStoreId ? "passar dig bäst" : undefined,
        }))}
      />
      <Button
        type="button"
        variant="primary"
        disabled={starting}
        onClick={() => void suggest(picked)}
        data-testid="store-choice-start"
      >
        Föreslå rätter
      </Button>
    </div>
  );
}
