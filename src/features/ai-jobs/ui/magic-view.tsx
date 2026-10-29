"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CheckIcon } from "@/components/icons";
import { isActive, type AiJob, type AiJobKind } from "@/lib/ai-job-shape";
import { subjectText } from "../domain/ai-job-text";
import { fixedStatusLine, progressText, statusLine, stepAt } from "../domain/ai-job-magic";
import "./magic.css";

// The magical view at the top of the sheet AI-jobb (Story 12.8): while a job
// runs, a slowly turning cube of glowing edges with particles in orbit, a
// status line that changes every 2.5 s, and the time so far against the usual
// time. When nothing runs the cube gives way to a still glow and a check with
// "Klart!". A screen reader gets one steady status that changes only when the
// state does; the cycling line is hidden from it. With "Minska rörelse"
// nothing moves and the status line is one fixed text.

const reducedQuery = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const list = window.matchMedia(reducedQuery);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => typeof window.matchMedia === "function" && window.matchMedia(reducedQuery).matches,
    () => false,
  );
}

/** The job the view talks about: one that runs before one that waits, the oldest first. */
function leadJob(active: readonly AiJob[]): AiJob {
  const sorted = [...active].sort((a, b) => Number(b.status === "running") - Number(a.status === "running") || a.createdAt.localeCompare(b.createdAt));
  return sorted[0];
}

function Cube({ size, inner = false }: { size: number; inner?: boolean }) {
  return (
    <div className={inner ? "magic-scene magic-scene-inner" : "magic-scene"} style={{ ["--s" as string]: `${size}px` }}>
      {inner ? <span className="magic-core" /> : null}
      <span className="magic-face" />
      <span className="magic-face" />
      <span className="magic-face" />
      <span className="magic-face" />
      <span className="magic-face" />
      <span className="magic-face" />
    </div>
  );
}

function Running({ kind, since, reduced }: { kind: AiJobKind; since: number | null; reduced: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  const [fallbackSince] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const elapsedMs = Math.max(0, now - (since ?? fallbackSince));
  const step = reduced ? 0 : stepAt(elapsedMs);
  const text = reduced ? fixedStatusLine(kind) : statusLine(kind, step);
  return (
    <>
      <div className="magic-hero" aria-hidden="true" data-testid="magic-hero">
        <span className="magic-glow" />
        <Cube size={72} />
        <Cube size={34} inner />
        <span className="magic-orbit" style={{ ["--r" as string]: "62px" }}>
          <span />
        </span>
        <span className="magic-orbit" style={{ ["--r" as string]: "50px", animationDuration: "13s", animationDirection: "reverse" }}>
          <span />
        </span>
      </div>
      <p key={step} aria-hidden="true" data-testid="magic-status" className="magic-status text-body text-ink">
        {text}
      </p>
      <p aria-hidden="true" data-testid="magic-time" className="text-meta text-ink-2">
        {progressText(kind, Math.floor(elapsedMs / 1000))}
      </p>
    </>
  );
}

export function MagicView({ jobs }: { jobs: readonly AiJob[] }) {
  const reduced = useReducedMotion();
  const active = jobs.filter(isActive);
  if (jobs.length === 0) return null;
  const lead = active.length > 0 ? leadJob(active) : null;
  const done = jobs.some((job) => job.status === "done");
  if (!lead && !done) return null;
  const since = lead ? Date.parse(lead.createdAt) : 0;
  return (
    <div data-testid="magic-view" className="flex flex-col items-center gap-1 text-center">
      {lead ? (
        <Running key={lead.id} kind={lead.kind} since={Number.isNaN(since) ? null : since} reduced={reduced} />
      ) : (
        <>
          <div className="magic-hero magic-settled" aria-hidden="true">
            <span className="magic-glow" />
            <span className="grid size-14 place-items-center rounded-full border border-accent bg-mint text-accent">
              <CheckIcon size={28} />
            </span>
          </div>
          <p aria-hidden="true" className="text-body text-ink">
            Klart!
          </p>
        </>
      )}
      <p aria-live="polite" className="sr-only">
        {lead ? `AI arbetar med ${subjectText(lead.kind)}.` : "Klart!"}
      </p>
    </div>
  );
}
