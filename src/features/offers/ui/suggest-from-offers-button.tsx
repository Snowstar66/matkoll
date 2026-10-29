"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/button";
import { useToast } from "@/components/toast";
import { useAiJobs } from "@/lib/ai-jobs-client";
import { suggestFromOffersText } from "../domain/offer";

export type SuggestFromOffersButtonProps = {
  /** Without offers there is nothing to build on: the button waits, and a line says why. */
  hasOffers: boolean;
  /** Called when the job has started, e.g. to close the sheet. */
  onStarted?: () => void;
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
export function SuggestFromOffersButton({ hasOffers, onStarted }: SuggestFromOffersButtonProps) {
  const { showToast } = useToast();
  const { start } = useAiJobs();
  const [starting, setStarting] = useState(false);
  const key = useRef<string | null>(null);

  async function suggest() {
    if (starting) return;
    setStarting(true);
    const clientKey = (key.current ??= crypto.randomUUID());
    const result = await start("/api/ai/jobs", { kind: "suggest", mode: "offers", avoidTitles: [] }, clientKey);
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
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="secondary"
        fullWidth
        disabled={!hasOffers || starting}
        aria-describedby={hasOffers ? undefined : "suggest-from-offers-hint"}
        onClick={() => void suggest()}
      >
        {suggestFromOffersText.button}
      </Button>
      {hasOffers ? null : (
        <p id="suggest-from-offers-hint" className="text-meta text-ink-2">
          {suggestFromOffersText.noOffers}
        </p>
      )}
    </div>
  );
}
