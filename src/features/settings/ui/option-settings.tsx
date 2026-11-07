"use client";

import { useId } from "react";
import { cx } from "@/components/cx";
import { type OptionId, options, saveOption } from "@/lib/options";
import { useOption } from "@/lib/use-option";

// Tillval: one switch row per entry in src/lib/options.ts, remembered on this device.

function OptionRow({ id, label, hint }: { id: OptionId; label: string; hint: string }) {
  const on = useOption(id);
  const hintId = useId();
  return (
    <li>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby={hintId}
        onClick={() => saveOption(id, !on)}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body text-ink">{label}</span>
          <span id={hintId} className="text-meta text-ink-2">
            {hint}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={cx("relative h-8 w-[51px] shrink-0 rounded-full transition-colors", on ? "bg-accent" : "border border-border bg-surface-2")}
        >
          <span className={cx("absolute top-0.5 size-7 rounded-full bg-white shadow transition-[left]", on ? "left-[22px]" : "left-0.5")} />
        </span>
      </button>
    </li>
  );
}

export function OptionSettings() {
  return (
    <section aria-label="Tillval">
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg bg-surface">
        {options.map((option) => (
          <OptionRow key={option.id} id={option.id} label={option.label} hint={option.hint} />
        ))}
      </ul>
      <p className="px-1 pt-2 text-meta text-ink-3">Gäller bara den här enheten.</p>
    </section>
  );
}
