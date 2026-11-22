"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/button";
import { cx } from "@/components/cx";
import { useToast } from "@/components/toast";
import { type Area, type AreaStatus, type Change, areaStatus, areas, areasCardEnabled, setAll, toggleArea, undoChanges } from "@/lib/option-areas";
import { optionChangedEvent, readOption } from "@/lib/options";

// Vad vill du ha hjälp med?: five boxes (full, half, none) counted from the Tillval switches, and the buttons
// Bara grunderna and Allt. A tap works at once and the toast says what happened, with Ångra. Nothing is stored.

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(optionChangedEvent, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(optionChangedEvent, listener);
  };
}

/** The statuses of the five boxes as one string ("full,none,…"), so the snapshot is stable between reads. */
function snapshot(): string {
  return areas.map((area) => areaStatus(area, readOption)).join(",");
}

/** The five statuses, counted from the switches on this device; null until the page has loaded (the server cannot know). */
export function useAreaStatuses(): AreaStatus[] | null {
  const value = useSyncExternalStore(subscribe, snapshot, () => "");
  return value === "" ? null : (value.split(",") as AreaStatus[]);
}

/** The box: full (green with a check), half (dashed with a dash) or none (empty). */
export function AreaBox({ status }: { status: AreaStatus }) {
  return (
    <span
      aria-hidden="true"
      data-status={status}
      className={cx(
        "flex size-6 shrink-0 items-center justify-center rounded-md border-2",
        status === "full" && "border-accent bg-accent text-on-accent",
        status === "half" && "border-dashed border-accent text-accent",
        status === "none" && "border-border bg-surface",
      )}
    >
      {status === "full" ? (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      ) : status === "half" ? (
        <span className="h-0.5 w-3 rounded-full bg-current" />
      ) : null}
    </span>
  );
}

/** One row of the card: the box, the name and the line of examples. In em, so it follows the text size. */
export function AreaRow({ area, status, onClick, checked }: { area: Area; status: AreaStatus; onClick?: () => void; checked?: boolean }) {
  const content = (
    <>
      <AreaBox status={status} />
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="text-body text-ink">{area.name}</span>
        <span className="text-meta text-ink-2">{area.example}</span>
      </span>
    </>
  );
  const className = "flex min-h-[3em] w-full items-center gap-3 px-4 py-2";
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked !== undefined ? checked : status === "full" ? true : status === "half" ? "mixed" : false}
        onClick={onClick}
        className={className}
        data-testid={`area-${area.id}`}
      >
        {content}
      </button>
    </li>
  );
}

/**
 * The card at the top of Tillval. `enabled` is `areasCardEnabled` unless a test says otherwise; off, the card is
 * not drawn at all.
 */
export function AreasCard({ enabled = areasCardEnabled }: { enabled?: boolean }) {
  const statuses = useAreaStatuses();
  const { showToast } = useToast();
  if (!enabled) return null;

  function say(result: { changes: Change[]; message: string }) {
    showToast(result.message, { onUndo: () => undoChanges(result.changes), durationMs: 10_000 });
  }

  const noneOn = statuses !== null && statuses.every((status) => status === "none");
  return (
    <section aria-labelledby="areas-title" className="mb-6 rounded-lg bg-surface p-4 pb-3" data-testid="areas-card">
      <h2 id="areas-title" className="text-row-title text-ink">
        Vad vill du ha hjälp med?
      </h2>
      <p className="mt-1 text-meta text-ink-2">Kryssa i flera. Gäller den här telefonen. Reglagen nedan kan du ändra ett och ett.</p>
      <ul className="-mx-4 mt-2 flex flex-col">
        {areas.map((area, index) => (
          <AreaRow key={area.id} area={area} status={statuses?.[index] ?? "none"} onClick={() => say(toggleArea(area))} />
        ))}
      </ul>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => say(setAll(false))}>
          Bara grunderna
        </Button>
        <Button variant="secondary" onClick={() => say(setAll(true))}>
          Allt
        </Button>
      </div>
      <p className="mt-3 text-meta text-ink-3" data-testid="areas-note">
        {noneOn ? "Inget är påslaget. Recept och Matsedel visar bara det grundläggande. Slå på ett område ovan." : "Reglagen gäller bara den här telefonen. Delningen längst ned gäller hela hushållet."}
      </p>
    </section>
  );
}
