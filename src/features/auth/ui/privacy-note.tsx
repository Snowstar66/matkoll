"use client";

import Link from "next/link";
import { useId } from "react";
import { buttonClasses, Button } from "@/components/button";
import { LockIcon } from "@/components/icons";
import { usePrivacyNoteAcknowledged } from "./privacy-note-store";
import { privacyText } from "@/app/app-info";

/** The note's title (Pontus 1 Nov: calm and kind); its text is the one Hjälp och tips has too. */
export const privacyNoteTitle = "Om din data";
/** Hjälp och tips, at the Konto area, where the same is said. */
export const privacyHelpHref = "/hjalp#konto";

/**
 * Om din data (Story 17.2; Pontus 1 Nov): a calm card about who can see the account's data, shown once
 * on this device, after the welcome tour is closed. A lock on a soft mint tile, the title, two short
 * lines, "Läs mer" (Hjälp och tips at Konto) and "Okej". On a phone it floats above the tab bar; on
 * a desktop it floats over the content column, never a banner across the page. It is first in the
 * page's order, so a screen reader meets it before the page.
 */
export function PrivacyNote() {
  const [acknowledged, acknowledge] = usePrivacyNoteAcknowledged();
  const id = useId();
  if (acknowledged) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tab-bar-height)+var(--fixed-action-gap)+var(--fixed-action-offset,0px))] z-30 flex justify-center px-page desktop:bottom-[calc(env(safe-area-inset-bottom)+var(--fixed-action-gap)*2+var(--fixed-action-offset,0px))] desktop:left-side-menu">
      <section
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-text`}
        className="pointer-events-auto w-full max-w-content rounded-lg bg-surface-2 p-4 pb-2 shadow-float desktop:max-w-[480px]"
        data-testid="privacy-note"
      >
        <div className="flex gap-3">
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-mint text-mint-ink">
            <LockIcon size={22} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id={`${id}-title`} className="text-row-title font-semibold text-ink">
              {privacyNoteTitle}
            </h2>
            <p id={`${id}-text`} className="text-meta text-ink-2">
              {privacyText}
            </p>
          </div>
        </div>
        <div className="-mr-2 flex justify-end gap-1">
          {/* Läs mer counts as read: the note does not follow to the help page. */}
          <Link href={privacyHelpHref} onClick={acknowledge} className={buttonClasses("quiet")}>
            Läs mer
          </Link>
          <Button variant="text" onClick={acknowledge} className="font-semibold">
            Okej
          </Button>
        </div>
      </section>
    </div>
  );
}
