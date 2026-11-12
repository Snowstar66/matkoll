"use client";

import type { ReactNode } from "react";
import { SwitchRow } from "@/components/switch-row";
import { NUTRITION_LICENSE_URL } from "@/features/nutrition";
import { cx } from "@/components/cx";
import { type ChoiceOptionId, type OptionId, choiceOptions, optionGroups, options, saveChoice, saveOption } from "@/lib/options";
import { useChoice, useOption } from "@/lib/use-option";

// Tillval: one switch row per entry in src/lib/options.ts, remembered on this device.

/** One option's switch, remembered on this device; the label and hint of src/lib/options.ts unless given. */
export function OptionRow({ id, label, hint, disabled = false }: { id: OptionId; label?: string; hint?: string; disabled?: boolean }) {
  const on = useOption(id);
  const option = options.find((entry) => entry.id === id);
  return (
    <SwitchRow
      id={`tillval-${id}`}
      label={label ?? option?.label ?? id}
      hint={hint ?? option?.hint}
      on={on}
      onToggle={() => saveOption(id, !on)}
      disabled={disabled}
    />
  );
}

/** One choice option as a small segmented control (radio group) under its label, remembered on this device. */
export function ChoiceRow({ id }: { id: ChoiceOptionId }) {
  const value = useChoice(id);
  const option = choiceOptions.find((entry) => entry.id === id);
  if (!option) return null;
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <span className="flex flex-col">
        <span className="text-body text-ink">{option.label}</span>
        <span className="text-meta text-ink-2">{option.hint}</span>
      </span>
      <div role="radiogroup" aria-label={option.label} className="grid grid-cols-3 gap-1 rounded-lg bg-fill p-1">
        {option.choices.map((choice) => {
          const on = value === choice.value;
          return (
            <button
              key={choice.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => saveChoice(id, choice.value)}
              className={cx("min-h-tap rounded-md px-2 text-control", on ? "bg-surface font-semibold text-ink shadow-sm" : "text-ink-2")}
            >
              {choice.label}
            </button>
          );
        })}
      </div>
    </li>
  );
}

/**
 * The device's groups, then "Gäller bara den här enheten.", then `after`: the page puts the group
 * Delade recept there, whose other rows are the household's and come from the recipes module.
 * `nutritionNote` is the Näringskoll, a quiet line under the Näring group, shown only with Visa näring on.
 */
export function OptionSettings({ after, nutritionNote }: { after?: ReactNode; nutritionNote?: ReactNode } = {}) {
  const showNutrition = useOption("showNutrition");
  return (
    <section aria-label="Tillval">
      {optionGroups
        .filter((group) => group.id !== "shared")
        .map((group) => (
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
              {choiceOptions.filter((option) => option.group === group.id).map((option) => (
                <ChoiceRow key={option.id} id={option.id} />
              ))}
            </ul>
            {group.id === "nutrition" && showNutrition ? nutritionNote : null}
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
      {after}
    </section>
  );
}
