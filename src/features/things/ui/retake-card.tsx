"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, useCallback, useRef } from "react";
import { Button } from "@/components/button";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import { errorMessages } from "@/lib/errors";
import { retakeText } from "../domain/capture";
import { useCardUpload } from "./use-card-upload";

// "Ta om" on one card (Story 18.11): a new photo of the same place that
// replaces only this card, once the new one is read (the server removes the old
// card when the new one is saved). On a phone the camera opens at once; on a
// desktop the file picker. The new card shows in the list while it is read.

export function RetakeCard({ cardId, placeId, name }: { cardId: string; placeId: string; name: string }) {
  const router = useRouter();
  const touch = useCoarsePointer();
  const input = useRef<HTMLInputElement>(null);
  const refresh = useCallback(() => router.refresh(), [router]);
  const upload = useCardUpload(refresh);
  const sending = upload.state.kind === "sending";

  async function onChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) await upload.send([file], { placeId, replaces: cardId });
  }

  return (
    <>
      <Button
        variant="compact"
        disabled={sending}
        aria-label={`${retakeText} kortet ${name}`}
        onClick={() => input.current?.click()}
        data-testid="retake-card"
      >
        {sending ? "Skickar …" : retakeText}
      </Button>
      {upload.state.kind === "error" ? (
        <span role="alert" className="text-meta text-ink-2">
          {errorMessages[upload.state.error.code]}
        </span>
      ) : null}
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture={touch ? "environment" : undefined}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={onChosen}
      />
    </>
  );
}
