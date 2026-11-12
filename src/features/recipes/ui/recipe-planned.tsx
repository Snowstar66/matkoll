"use client";

import Link from "next/link";
import { createContext, type ReactNode, useContext, useLayoutEffect, useState } from "react";

/** The recipe on the meal plan: where the small text "På matsedeln v. 46" under the title leads. */
export type PlannedInfo = { href: string; text: string };

type PlannedStore = { planned: PlannedInfo | null; setPlanned: (planned: PlannedInfo | null) => void };

const PlannedContext = createContext<PlannedStore | null>(null);

/**
 * UX-01: "På matsedeln v. N" is a small text beside the time under the title, no longer a pill in the status row.
 * The plan state lives in the recipe body; it publishes it here for the header, which is a sibling.
 */
export function PlannedProvider({ children }: { children: ReactNode }) {
  const [planned, setPlanned] = useState<PlannedInfo | null>(null);
  return <PlannedContext.Provider value={{ planned, setPlanned }}>{children}</PlannedContext.Provider>;
}

/** Used by the recipe body: tells the header whether, and where, the recipe is planned. */
export function usePublishPlanned(info: PlannedInfo | null) {
  const store = useContext(PlannedContext);
  const href = info?.href;
  const text = info?.text;
  const setPlanned = store?.setPlanned;
  useLayoutEffect(() => {
    setPlanned?.(href !== undefined && text !== undefined ? { href, text } : null);
  }, [setPlanned, href, text]);
}

/** In the header's meta line: " · På matsedeln v. 46" (a link to the week), after something else on the line. */
export function PlannedText({ afterOther }: { afterOther: boolean }) {
  const planned = useContext(PlannedContext)?.planned;
  if (!planned) return null;
  return (
    <>
      {afterOther ? " · " : ""}
      <Link href={planned.href} data-testid="recipe-planned" className="font-semibold text-mint-ink">
        {planned.text}
      </Link>
    </>
  );
}
