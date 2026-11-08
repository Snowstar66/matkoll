"use client";

import { useId } from "react";
import { cx } from "@/components/cx";
import { NUTRITION_LICENSE_URL } from "@/features/nutrition";
import { type OptionId, optionGroups, options, saveOption } from "@/lib/options";
import { useOption } from "@/lib/use-option";

// Tillval: one switch row per entry in src/lib/options.ts, remembered on this device.

function OptionRow({ id, label, hint, disabled = false }: { id: OptionId; label: string; hint: string; disabled?: boolean }) {
  const on = useOption(id);
  const hintId = useId();
  return (
    <li>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby={hint ? hintId : undefined}
        disabled={disabled}
        onClick={() => saveOption(id, !on)}
        className={cx("flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left", disabled && "opacity-50")}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body text-ink">{label}</span>
          {hint ? (
            <span id={hintId} className="text-meta text-ink-2">
              {hint}
            </span>
          ) : null}
        </span>
        <span
          aria-hidden="true"
          className={cx("relative h-8 w-[51px] shrink-0 rounded-full transition-colors", on ? "bg-accent" : "border border-border bg-fill")}
        >
          <span className={cx("absolute top-0.5 size-7 rounded-full shadow transition-[left]", on ? "left-[22px] bg-on-accent" : "left-0.5 bg-surface")} />
        </span>
      </button>
    </li>
  );
}

export function OptionSettings() {
  const showNutrition = useOption("showNutrition");
  return (
    <section aria-label="Tillval">
      {optionGroups.map((group) => (
        <div key={group.id} className="mb-6">
          <h2 className="mx-1 mb-2 text-section-label text-ink-2 uppercase">{group.label}</h2>
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg bg-surface">
            {options
              .filter((option) => option.group === group.id)
              .map((option) => (
                <OptionRow
                  key={option.id}
                  id={option.id}
                  label={option.label}
                  // Visa kcal adds to the nutrition card, so it waits for Visa näring.
                  hint={option.id === "showKcal" && !showNutrition ? "Kräver Visa näring" : option.hint}
                  disabled={option.id === "showKcal" && !showNutrition}
                />
              ))}
          </ul>
          {group.id === "nutrition" ? (
            <p className="mx-1 mt-2 text-meta text-ink-3" data-testid="nutrition-source">
              Näringen är ungefärlig och räknas från Livsmedelsverkets livsmedelsdatabas (
              <a href={NUTRITION_LICENSE_URL} target="_blank" rel="noreferrer" className="underline">
                CC BY 4.0
              </a>
              ).
            </p>
          ) : null}
        </div>
      ))}
      <p className="px-1 text-meta text-ink-3">Gäller bara den här enheten.</p>
    </section>
  );
}
