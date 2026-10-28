"use client";

import { type RefObject, useEffect, useRef } from "react";
import { ChevronLeftIcon } from "@/components/icons";
import { cx } from "@/components/cx";
import { useAiJobs } from "@/lib/ai-jobs-client";
import { jobRowText } from "../domain/ai-job-text";
import { useAiJobsSheet } from "./ai-jobs-provider";

// The job row (Story 12.4, DESIGN.md job-row): a white strip in the tab bar,
// above the tabs, or at the top of the side menu from 1024 px, while some AI
// job is queued or running: "AI: Letar efter rättförslag · 2 i kö". A tap
// opens the sheet AI-jobb. It has a name of its own for a screen reader
// ("AI-jobb: Letar efter rättförslag, 2 i kö"), is at least 44 px high, and
// says nothing by itself when it is polled (the provider's live region says
// when a job starts). The dot pulses calmly, and stands still with "Minska
// rörelse".

/**
 * Tells the page how tall the job row in the tab bar is (--job-row-height,
 * globals.css), so what sits above the bar (the toast, FixedAction, the
 * page's bottom padding) clears it. 0 again when the row goes.
 */
function useJobRowHeight(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty("--job-row-height", `${element.offsetHeight}px`);
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      root.style.removeProperty("--job-row-height");
    };
  }, [ref, enabled]);
}

export function AiJobRow({ variant }: { variant: "bar" | "side" }) {
  const { jobs } = useAiJobs();
  const { open } = useAiJobsSheet();
  const row = jobRowText(jobs);
  const ref = useRef<HTMLButtonElement>(null);
  useJobRowHeight(ref, variant === "bar" && row !== null);
  if (!row) return null;
  return (
    <button
      ref={ref}
      type="button"
      data-testid="ai-job-row"
      aria-label={row.label}
      onClick={open}
      className={cx(
        "flex min-h-tap w-full items-center gap-3 bg-surface text-left text-meta text-ink-2",
        variant === "bar" ? "border-b border-hairline px-page" : "rounded-md border border-hairline px-3",
      )}
    >
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-accent motion-safe:animate-pulse" />
      <span className="min-w-0 flex-1 truncate">{row.text}</span>
      <ChevronLeftIcon size={18} className="shrink-0 rotate-180 text-ink-3" />
    </button>
  );
}
