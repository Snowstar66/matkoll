"use client";

import Link from "next/link";
import { type ReactNode, useId, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";

/**
 * Inköpslistans smala veckorad (UX: "Smalare topp på Inköpslistan"): ‹ en pill med veckan och datumen › på en rad
 * i stället för tre tiler och en datumrad. ‹ finns inte på denna vecka (bakåt hör till Tidigare i Matsedel) och › är
 * avstängd på sista veckan. Ett tryck på pillen öppnar de gamla veckotilarna (`children`, med antalet varor per vecka),
 * ett tryck till stänger dem. Tilarna finns alltid i sidan (dolda), så minnet av veckan (RememberWeek i dem) körs som förut.
 */
export function WeekBar({
  label,
  prevHref,
  nextHref,
  children,
}: {
  /** "v. 47 · 16 nov – 22 nov". */
  label: string;
  /** Förra veckan, eller `null` på denna vecka (pilen är då dold). */
  prevHref: string | null;
  /** Nästa vecka, eller `null` på sista veckan som går att välja (pilen är då avstängd). */
  nextHref: string | null;
  /** Veckotilarna (WeekNav). */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  const arrow = "relative flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-accent before:absolute before:-inset-x-1 before:-inset-y-1 before:content-['']";
  return (
    <div data-testid="week-bar" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        {prevHref ? (
          <Link href={prevHref} scroll={false} aria-label="Förra veckan" className={arrow}>
            <ChevronLeftIcon size={18} />
          </Link>
        ) : (
          <span aria-hidden="true" className="size-9 shrink-0" />
        )}
        <button
          type="button"
          data-testid="week-pill"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => setOpen((current) => !current)}
          className="flex h-9 min-w-0 items-center rounded-pill bg-seg-track px-4 text-control font-semibold whitespace-nowrap text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="truncate">{label}</span>
        </button>
        {nextHref ? (
          <Link href={nextHref} scroll={false} aria-label="Nästa vecka" className={arrow}>
            <ChevronRightIcon size={18} />
          </Link>
        ) : (
          <span role="img" aria-label="Sista veckan som går att välja" className={`${arrow} opacity-45`}>
            <ChevronRightIcon size={18} />
          </span>
        )}
      </div>
      <div id={regionId} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
