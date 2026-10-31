"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, useCallback, useRef, useState } from "react";
import { Button } from "@/components/button";
import { Sheet } from "@/components/sheet";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import { errorMessages } from "@/lib/errors";
import { openCameraText, pickImagesText, retakeDetailText, retakeText, retakeTitleText } from "../domain/capture";
import { useCardUpload } from "./use-card-upload";

// "Ta om" on one card (Story 18.11): a new photo of the same place that
// replaces only this card, once the new one is read (the server removes the old
// card when the new one is saved). A sheet first says what is replaced, the
// corrections and added things of the old card too (Story 18.15); then on a
// phone the camera opens, on a desktop the file picker. The new card shows in
// the list while it is read.

export function RetakeCard({
  cardId,
  placeId,
  name,
  variant = "compact",
  onSent,
}: {
  cardId: string;
  placeId: string;
  name: string;
  variant?: "compact" | "secondary";
  /** Called once the new photo is saved (Story 18.7: the big view goes to the room, where the new card is read); otherwise the page is read again. */
  onSent?: () => void;
}) {
  const router = useRouter();
  const touch = useCoarsePointer();
  const input = useRef<HTMLInputElement>(null);
  const refresh = useCallback(() => (onSent ? onSent() : router.refresh()), [router, onSent]);
  const upload = useCardUpload(refresh);
  const sending = upload.state.kind === "sending";
  const [asking, setAsking] = useState(false);

  function choose(camera: boolean) {
    const field = input.current;
    if (!field) return;
    if (camera && touch) field.setAttribute("capture", "environment");
    else field.removeAttribute("capture");
    setAsking(false);
    field.click();
  }

  async function onChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) await upload.send([file], { placeId, replaces: cardId });
  }

  return (
    <>
      <Button
        variant={variant}
        fullWidth={variant === "secondary"}
        disabled={sending}
        aria-label={`${retakeText} kortet ${name}`}
        onClick={() => setAsking(true)}
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
        accept="image/*,.heic,.heif"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={onChosen}
      />
      <Sheet open={asking} onClose={() => setAsking(false)} title={retakeTitleText} closeLabel="Avbryt">
        <div className="flex flex-col gap-3">
          <p className="text-body text-ink-2" data-testid="retake-detail">
            {retakeDetailText}
          </p>
          {touch ? (
            <>
              <Button fullWidth onClick={() => choose(true)} data-testid="retake-camera">
                {openCameraText}
              </Button>
              <Button fullWidth variant="secondary" onClick={() => choose(false)} data-testid="retake-pick">
                {pickImagesText}
              </Button>
            </>
          ) : (
            <Button fullWidth onClick={() => choose(false)} data-testid="retake-pick">
              {pickImagesText}
            </Button>
          )}
        </div>
      </Sheet>
    </>
  );
}
