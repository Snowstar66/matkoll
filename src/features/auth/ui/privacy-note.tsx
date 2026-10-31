"use client";

import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { usePrivacyNoteAcknowledged } from "./privacy-note-store";
import { appName } from "@/app/app-info";

/**
 * The one-time line about who can see the account's data (Story 17.2), shown
 * above the content of the app until "Okej" is pressed on this device.
 */
export function PrivacyNote() {
  const [acknowledged, acknowledge] = usePrivacyNoteAcknowledged();
  if (acknowledged) return null;
  return (
    <Notice
      role="status"
      className="mt-header-top"
      action={
        <Button variant="text" onClick={acknowledge}>
          Okej
        </Button>
      }
    >
      Den som driver {appName} kan tekniskt se kontots data.
    </Notice>
  );
}
