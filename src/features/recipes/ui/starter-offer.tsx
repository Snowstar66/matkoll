"use client";

import Link from "next/link";
import { type ReactNode, Suspense, use } from "react";
import { ChevronRightIcon, RecipesIcon, SparkleIcon } from "@/components/icons";
import { useOption } from "@/lib/use-option";

// Kom igång med recept, Steg 1 (the sketch of 2026-11-11): where a household meets the starter
// recipes on Recept, only with Tillval "Startrecept" on and while the pack has recipes the household
// has not added. In an empty list the offer is the main thing ("Välj startrecept", the import as a
// text link under it); in a list with recipes, a quiet row at its end ("Fler recept?"). Nothing is
// ever added without the household choosing it on /recept/startrecept.

export const starterPickerHref = "/recept/startrecept";

/** What Recept knows of the pack: how many recipes the household has not added, of how many. */
export type StarterOffer = { available: number; total: number };

type OfferPromise = Promise<StarterOffer | undefined>;

/** The empty list: the offer instead of `children` (the usual empty state) while there is something to choose. */
export function StarterEmptyOffer({ offer, importButton, children }: { offer: OfferPromise; importButton: ReactNode; children: ReactNode }) {
  const on = useOption("starterRecipes");
  if (!on) return <>{children}</>;
  return (
    <Suspense fallback={children}>
      <EmptyOffer offer={offer} importButton={importButton}>
        {children}
      </EmptyOffer>
    </Suspense>
  );
}

function EmptyOffer({ offer: promise, importButton, children }: { offer: OfferPromise; importButton: ReactNode; children: ReactNode }) {
  const offer = use(promise);
  if (!offer || offer.available === 0) return <>{children}</>;
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center" data-testid="starter-offer">
      <span aria-hidden="true" className="flex size-18 items-center justify-center rounded-full bg-mint text-mint-ink">
        <RecipesIcon size={34} />
      </span>
      <h2 className="text-section-title font-bold text-ink">Börja med några recept</h2>
      <p className="max-w-80 text-body text-ink-2">
        Välj bland {offer.total} {offer.total === 1 ? "vardagsrätt" : "vardagsrätter"}, med bild. Du bestämmer vilka som hamnar i din lista.
      </p>
      <Link
        href={starterPickerHref}
        className="mt-1 inline-flex min-h-tap items-center justify-center rounded-pill bg-accent px-6 text-headline font-semibold text-on-accent"
      >
        Välj startrecept
      </Link>
      {importButton}
    </div>
  );
}

/** A list with recipes: "Fler recept? Välj bland startrecepten" at its end, while there is something to choose. */
export function StarterMoreRow({ offer }: { offer: OfferPromise }) {
  const on = useOption("starterRecipes");
  if (!on) return null;
  return (
    <Suspense fallback={null}>
      <MoreRow offer={offer} />
    </Suspense>
  );
}

function MoreRow({ offer: promise }: { offer: OfferPromise }) {
  const offer = use(promise);
  if (!offer || offer.available === 0) return null;
  return (
    <Link
      href={starterPickerHref}
      data-testid="starter-more"
      className="mt-4 flex min-h-tap items-center gap-3 rounded-lg bg-surface p-3 text-left"
    >
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-md bg-mint text-mint-ink">
        <SparkleIcon size={22} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="text-body font-semibold text-ink">Fler recept?</b>
        <span className="text-meta text-ink-2">Välj bland startrecepten</span>
      </span>
      <ChevronRightIcon size={20} className="shrink-0 text-ink-3" />
    </Link>
  );
}
