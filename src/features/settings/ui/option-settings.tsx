"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRightIcon } from "@/components/icons";
import { SwitchRow } from "@/components/switch-row";
import { NUTRITION_LICENSE_URL } from "@/features/nutrition";
import { cx } from "@/components/cx";
import {
  type ChoiceOptionId,
  type OptionId,
  advancedOptionIds,
  choiceOptions,
  optionGroups,
  optionRequires,
  options,
  saveChoice,
  saveOption,
} from "@/lib/options";
import { areasCardEnabled } from "@/lib/option-areas";
import { useChoice, useOption } from "@/lib/use-option";
import { AreasCard } from "./areas-card";

// Tillval: one switch row per entry in src/lib/options.ts, remembered on this device.

/**
 * One option's switch, remembered on this device; the label and hint of src/lib/options.ts unless given.
 * A switch that needs another one (`optionRequires`) is greyed and says "Kräver …" while that one is off,
 * unless it is itself on, so it can still be turned off. The greying changes no setting.
 */
export function OptionRow({ id, label, hint, disabled = false }: { id: OptionId; label?: string; hint?: string; disabled?: boolean }) {
  const on = useOption(id);
  const option = options.find((entry) => entry.id === id);
  const requiredId = optionRequires[id];
  const requiredOn = useOption(requiredId ?? id);
  const waiting = requiredId !== undefined && !requiredOn && !on;
  const requiredLabel = requiredId ? options.find((entry) => entry.id === requiredId)?.label : undefined;
  return (
    <SwitchRow
      id={`tillval-${id}`}
      label={label ?? option?.label ?? id}
      hint={waiting ? `Kräver ${requiredLabel}` : (hint ?? option?.hint)}
      on={on}
      onToggle={() => saveOption(id, !on)}
      disabled={disabled || waiting}
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

/** The rows of Planera veckan in the order they are shown; "previous" is the link Öppna tidigare matsedlar. */
const planRows = ["weekAgent", "showHowOften", "oftenAfterWeeks", "showPreviousWeek", "previous", "showFit"] as const;

/** Öppna tidigare matsedlar: always there, so the way to the earlier plans stays even with Visa tidigare vecka off. */
function PreviousPlansRow() {
  return (
    <li>
      <Link href="/matsedel/tidigare" className="flex min-h-14 items-center gap-3 px-4 py-2 focus-visible:-outline-offset-2" data-testid="open-previous-plans">
        <span className="min-w-0 flex-1 text-body text-ink">Öppna tidigare matsedlar</span>
        <ChevronRightIcon size={16} className="-mr-1 shrink-0 text-ink-3" />
      </Link>
    </li>
  );
}

/**
 * The device's sections, then "Gäller bara den här enheten.", then `after`: the page puts the section
 * Delade recept there, whose other rows are the household's and come from the recipes module.
 * `nutritionNote` is the Näringskoll, a quiet line under the Näring section, shown only with Visa näring on.
 * Låt agenten söka på webben and Visa sidtider are not here: they live under Avancerat.
 */
export function OptionSettings({ after, nutritionNote, areasEnabled = areasCardEnabled }: { after?: ReactNode; nutritionNote?: ReactNode; areasEnabled?: boolean } = {}) {
  const showNutrition = useOption("showNutrition");
  const hidden: readonly string[] = advancedOptionIds;
  return (
    <section aria-label="Tillval">
      <AreasCard enabled={areasEnabled} />
      {optionGroups
        .filter((group) => group.id !== "shared" && group.id !== "debug")
        .map((group) => (
          <div key={group.id} className="mb-6">
            <h2 className="mx-1 mb-2 text-section-label text-ink-2 uppercase">{group.label}</h2>
            <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg bg-surface">
              {group.id === "plan" ? (
                planRows.map((row) =>
                  row === "previous" ? (
                    <PreviousPlansRow key={row} />
                  ) : row === "oftenAfterWeeks" || row === "showFit" ? (
                    <ChoiceRow key={row} id={row} />
                  ) : (
                    <OptionRow key={row} id={row} />
                  ),
                )
              ) : (
                <>
                  {options
                    .filter((option) => option.group === group.id && !hidden.includes(option.id))
                    .map((option) => (
                      <OptionRow key={option.id} id={option.id} />
                    ))}
                  {choiceOptions
                    .filter((option) => (option.group as string) === group.id)
                    .map((option) => (
                      <ChoiceRow key={option.id} id={option.id} />
                    ))}
                </>
              )}
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
      {areasEnabled ? null : <p className="px-1 text-meta text-ink-3">Gäller bara den här enheten.</p>}
      {after}
    </section>
  );
}
