"use client";

import { useState } from "react";
import { buttonClasses } from "@/components/button";
import { Sheet } from "@/components/sheet";
import type { Store } from "@/features/settings";
import { chainSite, openSiteText, stepsDontShowAgainText, stepsSheetTitle, stepsText } from "../domain/list-text";

/** The key under which "Visa inte igen" is kept in this browser. */
const stepsHiddenKey = "matkoll:hide-basket-steps";

/** Whether Pontus has asked not to see the steps after a copy; `false` when storage is not available. */
export function stepsHidden(): boolean {
  try {
    return window.localStorage.getItem(stepsHiddenKey) === "1";
  } catch {
    return false;
  }
}

function rememberStepsHidden(hidden: boolean) {
  try {
    if (hidden) window.localStorage.setItem(stepsHiddenKey, "1");
    else window.localStorage.removeItem(stepsHiddenKey);
  } catch {
    // Without storage the steps simply show every time.
  }
}

/**
 * "Så fyller du varukorgen" (Story 14.2): the three steps for the copied
 * text, a link to the chain's own site (opened only when tapped, in a new
 * tab; Matkoll never fetches it) and "Visa inte igen".
 */
export function StepsSheet({ open, store, onClose }: { open: boolean; store: Store | null; onClose: () => void }) {
  const site = chainSite(store);
  // Read when the sheet opens, so a box ticked earlier shows ticked.
  const [dontShow, setDontShow] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDontShow(stepsHidden());
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={stepsSheetTitle}
    >
      <div className="flex flex-col gap-4">
        <ol className="flex list-decimal flex-col gap-2 pl-6 text-body text-ink">
          {stepsText(store).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {site ? (
          <a href={site.url} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary", true)}>
            {openSiteText(site.host)}
          </a>
        ) : null}
        <label className="flex min-h-11 items-center gap-3 text-body text-ink">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(event) => {
              setDontShow(event.target.checked);
              rememberStepsHidden(event.target.checked);
            }}
            className="size-5"
          />
          {stepsDontShowAgainText}
        </label>
      </div>
    </Sheet>
  );
}
