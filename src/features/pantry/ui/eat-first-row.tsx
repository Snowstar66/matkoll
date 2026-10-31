"use client";

import { useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { useAiJobs } from "@/lib/ai-jobs-client";
import { eatFirstRowText } from "../domain/old-items";

/** What the toast says when the job has started. */
export const eatFirstStartedText = "Letar efter rätter med det som legat länge. Du kan göra annat under tiden.";

/**
 * "Ät det här först" (Story 16.13): a calm row at the top of Matvaror when
 * something has lain long ("3 varor har legat länge – föreslå rätter med
 * dem"). A tap starts an AI job of the kind `suggest` with `eatFirst`: the
 * server reads what has lain long itself (the client sends no items), builds
 * every dish around it and says so in the reason line. The job runs in the
 * background and its finished confirmation has "Visa", which opens the
 * suggestions in Recept, as for the offers. One job runs at a time: the row
 * waits while one is being started. Nothing is shown for no old items.
 */
export function EatFirstRow({ count }: { count: number }) {
  const { showToast } = useToast();
  const { start } = useAiJobs();
  const [starting, setStarting] = useState(false);
  const key = useRef<string | null>(null);
  if (count <= 0) return null;

  async function suggest() {
    if (starting) return;
    setStarting(true);
    // The same key again gives the same job, so a retry after a lost answer never makes a second one.
    const clientKey = (key.current ??= crypto.randomUUID());
    const result = await start("/api/ai/jobs", { kind: "suggest", eatFirst: true, avoidTitles: [] }, clientKey);
    setStarting(false);
    if (!result.ok) {
      // A network error may be tried again with the same key; any other answer is final for this tap.
      if (result.error.code !== "ai_unavailable") key.current = null;
      showToast(result.error.message, { role: "alert" });
      return;
    }
    key.current = null;
    showToast(eatFirstStartedText);
  }

  return (
    <button
      type="button"
      data-testid="eat-first-row"
      disabled={starting}
      onClick={() => void suggest()}
      className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg bg-surface p-3 text-left disabled:opacity-60"
    >
      <span className="text-row-title break-words text-ink">{eatFirstRowText(count)}</span>
      <span aria-hidden="true" className="shrink-0 text-meta text-accent">
        Föreslå
      </span>
    </button>
  );
}
