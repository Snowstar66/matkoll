"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChoiceRows } from "@/components/choice-rows";
import { ChevronDownIcon } from "@/components/icons";
import { Sheet } from "@/components/sheet";

/** One week in the menu: its Monday, its name ("Nästa vecka"), its dishes ("2 rätter") and its `?vecka=` value (`null` for this week). */
export type WeekMenuOption = { weekStart: string; label: string; detail: string; param: string | null };

/** The sheet's title. */
export const weekMenuTitle = "Vilken vecka?";

/**
 * The quiet week choice on Inköpslista: a small text button with the viewed
 * week ("Denna vecka ⌄") that opens a sheet with this week, next week and the
 * week after, each with its dishes as a second line. A choice closes the sheet
 * and puts the week in the address (`?vecka=2026-W46`, none for this week),
 * keeping the address's other values (the filter `?visa=`), so a reload keeps
 * both. The page is read again for the new week.
 */
export function WeekMenu({ weekStart, options }: { weekStart: string; options: readonly WeekMenuOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const shown = options.find((option) => option.weekStart === weekStart) ?? options[0];
  const choose = (value: string) => {
    setOpen(false);
    const option = options.find((candidate) => candidate.weekStart === value);
    if (!option || option.weekStart === weekStart) return;
    const params = new URLSearchParams(window.location.search);
    if (option.param) params.set("vecka", option.param);
    else params.delete("vecka");
    const query = params.toString();
    startTransition(() => router.push(`${window.location.pathname}${query ? `?${query}` : ""}`, { scroll: false }));
  };
  return (
    <>
      <button
        type="button"
        data-testid="week-menu"
        aria-haspopup="dialog"
        aria-label={`Vecka: ${shown?.label ?? ""}, ${shown?.detail.toLocaleLowerCase("sv-SE") ?? ""}`}
        aria-busy={pending || undefined}
        onClick={() => setOpen(true)}
        className="-mr-1.5 flex min-h-tap shrink-0 items-center gap-1 rounded-md px-1.5 text-control text-accent"
      >
        <span>{shown?.label}</span>
        <ChevronDownIcon size={16} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={weekMenuTitle} closeLabel="Klar">
        <ChoiceRows
          label={weekMenuTitle}
          value={weekStart}
          onChange={choose}
          options={options.map((option) => ({
            value: option.weekStart,
            label: option.label,
            detail: option.detail,
            testId: "week-menu-option",
          }))}
        />
      </Sheet>
    </>
  );
}
