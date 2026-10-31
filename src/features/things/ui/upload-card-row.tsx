"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, useCallback, useEffect, useRef } from "react";
import { Notice } from "@/components/notice";
import { PhotoRow } from "@/components/photo-row";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import { errorMessages } from "@/lib/errors";
import { sendingText, sentText } from "../domain/capture";
import { useCardUpload } from "./use-card-upload";

// A row that takes cards for one place that is already chosen (Story 18.11): the
// inside of a box that was just added (Story 18.5). On a phone the camera opens
// at once (a browser may refuse a camera that no tap opened; the row is there
// to tap then), on a desktop the row opens the file picker.

export function UploadCardRow({ placeId, title }: { placeId: string; title: string }) {
  const router = useRouter();
  const touch = useCoarsePointer();
  const input = useRef<HTMLInputElement>(null);
  const refresh = useCallback(() => router.refresh(), [router]);
  const upload = useCardUpload(refresh);

  useEffect(() => {
    if (touch) input.current?.click();
    // Once, when the page opens.
  }, [touch]);

  async function onChosen(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    await upload.send(files, { placeId });
  }

  const { state } = upload;
  return (
    <div className="flex flex-col gap-2" data-testid="upload-card-row">
      <PhotoRow title={title} onClick={() => input.current?.click()} disabled={state.kind === "sending"} />
      <div role="status">
        {state.kind === "sending" ? <p className="text-body text-ink">{sendingText(state.done, state.total)}</p> : null}
        {state.kind === "sent" ? <p className="text-body text-ink">{sentText(state.count)}</p> : null}
      </div>
      {state.kind === "error" ? <Notice role="alert">{errorMessages[state.error.code]}</Notice> : null}
      <input ref={input} type="file" accept="image/*" multiple capture={touch ? "environment" : undefined} tabIndex={-1} aria-hidden="true" className="sr-only" onChange={onChosen} />
    </div>
  );
}
