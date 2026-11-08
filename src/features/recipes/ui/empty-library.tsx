"use client";

import { type ReactNode, Suspense, use } from "react";
import { Button } from "@/components/button";
import { useOption } from "@/lib/use-option";
import type { SharedListItem } from "../domain/shared-recipe";
import { Library } from "./library";
import { useRecipeFilter } from "./recipe-filter-store";

type SharedPromise = Promise<readonly SharedListItem[] | undefined>;

/**
 * Recept without own recipes: the empty state (`children`), and, when other households share
 * recipes and Tillval "Visa delade recept" is on, "Visa delade recept" under it, which opens the
 * library on Delade (pressing the chip Delade again comes back here). The empty state never waits
 * for the shared recipes: only the button does.
 */
export function EmptyLibrary({ shared, children }: { shared?: SharedPromise; children: ReactNode }) {
  const [filter, setFilter] = useRecipeFilter();
  const withShared = useOption("showShared") && shared !== undefined;
  if (withShared && filter === "shared") {
    return <Library recipes={[]} pantryUnavailable={false} site={null} shared={shared} />;
  }
  return (
    <>
      {children}
      {withShared ? (
        <Suspense fallback={null}>
          <SharedButton promise={shared} onOpen={() => setFilter("shared")} />
        </Suspense>
      ) : null}
    </>
  );
}

function SharedButton({ promise, onOpen }: { promise: SharedPromise; onOpen: () => void }) {
  const shared = use(promise);
  if (!shared || shared.length === 0) return null;
  return (
    <div className="-mt-8 flex justify-center">
      <Button variant="text" onClick={onOpen}>
        Visa delade recept
      </Button>
    </div>
  );
}
