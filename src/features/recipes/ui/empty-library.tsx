"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/button";
import { useOption } from "@/lib/use-option";
import type { SharedListItem } from "../domain/shared-recipe";
import { Library } from "./library";
import { useRecipeFilter } from "./recipe-filter-store";

/**
 * Recept without own recipes: the empty state (`children`), and, when other households share
 * recipes and Tillval "Visa delade recept" is on, "Visa delade recept" under it, which opens the
 * library on Delade (pressing the chip Delade again comes back here).
 */
export function EmptyLibrary({ shared, children }: { shared?: readonly SharedListItem[]; children: ReactNode }) {
  const [filter, setFilter] = useRecipeFilter();
  const withShared = useOption("showShared") && shared !== undefined && shared.length > 0;
  if (withShared && filter === "shared") {
    return <Library recipes={[]} pantryUnavailable={false} site={null} shared={shared} />;
  }
  return (
    <>
      {children}
      {withShared ? (
        <div className="-mt-8 flex justify-center">
          <Button variant="text" onClick={() => setFilter("shared")}>
            Visa delade recept
          </Button>
        </div>
      ) : null}
    </>
  );
}
