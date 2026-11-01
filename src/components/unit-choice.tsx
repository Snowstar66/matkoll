"use client";

import { type Ref, useState } from "react";
import { Chip } from "./chip";
import { ChoiceRows } from "./choice-rows";
import { cx } from "./cx";

/** The units a chip row starts with (Story 19.5); the rest are behind "Fler ›". */
export const quickUnits = ["st", "förp", "kruka", "klyfta", "g"] as const;

export type UnitChoiceProps<U extends string> = {
  /** Every unit that can be chosen, in the order "Fler" lists them. */
  units: readonly U[];
  value: U | "";
  onChange: (unit: U | "") => void;
  /**
   * "Fler ›" opens a step in the sheet (the caller shows `UnitList` under "‹ Tillbaka", Enhet).
   * Without it the chips expand in place, for a form that sits inside a sheet it cannot change.
   */
  onMore?: () => void;
  disabled?: boolean;
  /** Names the group, "Enhet" by default. */
  label?: string;
  className?: string;
  /** The group, e.g. to move focus to it when the unit is missing. */
  ref?: Ref<HTMLDivElement>;
};

/**
 * Enhet as chips (Story 19.5): st · förp · kruka · klyfta · g · Fler ›. A chosen unit that is not
 * among them shows as a chip of its own before "Fler ›". Tapping the chosen chip again clears the
 * unit ("Ingen enhet" in the list behind Fler does too).
 */
export function UnitChoice<U extends string>({
  units,
  value,
  onChange,
  onMore,
  disabled = false,
  label = "Enhet",
  className,
  ref,
}: UnitChoiceProps<U>) {
  const [expanded, setExpanded] = useState(false);
  const available = (list: readonly string[]) =>
    list.filter((unit): unit is U =>
      (units as readonly string[]).includes(unit),
    );
  const quick = available(quickUnits);
  const shown: U[] = expanded ? [...units] : [...quick];
  if (!expanded && value !== "" && !shown.includes(value)) shown.push(value);
  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      className={cx("flex flex-wrap items-center gap-x-2 gap-y-3", className)}
    >
      {shown.map((unit) => (
        <Chip
          key={unit}
          role="radio"
          aria-checked={value === unit}
          selected={value === unit}
          disabled={disabled}
          onClick={() => onChange(value === unit ? "" : unit)}
        >
          {unit}
        </Chip>
      ))}
      {expanded ? null : (
        <Chip
          selected={false}
          disabled={disabled}
          aria-haspopup={onMore ? "dialog" : undefined}
          aria-expanded={onMore ? undefined : false}
          onClick={() => (onMore ? onMore() : setExpanded(true))}
          className="text-accent"
        >
          Fler ›
        </Chip>
      )}
    </div>
  );
}

/** All the units as rows with a check, for the step behind "Fler ›"; "Ingen enhet" first. */
export function UnitList<U extends string>({
  units,
  value,
  onChange,
  label = "Enhet",
}: {
  units: readonly U[];
  value: U | "";
  onChange: (unit: U | "") => void;
  label?: string;
}) {
  const options: { value: U | ""; label: string }[] = [
    { value: "", label: "Ingen enhet" },
    ...units.map((unit) => ({ value: unit, label: unit })),
  ];
  return (
    <ChoiceRows
      label={label}
      options={options}
      value={value}
      onChange={onChange}
    />
  );
}
