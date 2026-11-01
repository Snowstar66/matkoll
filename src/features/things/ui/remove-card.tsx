"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/button";
import { TrashIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { fail, type Result } from "@/lib/errors";
import { finishCardRemoval, removeThingCard, restoreThingCard } from "../actions/remove-card";
import { type CardSnapshot, removeCardDetail, removeCardQuestion, removeCardText, removedCardText } from "../domain/thing-edit";
import { shortDateText } from "../domain/thing-photo";

// "Ta bort kortet" (Story 18.3): asks first (the card, its photo and all its
// things go), then the card leaves at once and the short confirmation offers
// "Ångra". The photo's file is kept while that shows, so "Ångra" can put the
// card back with the same things; when the time is out without "Ångra" the
// file is removed (finishCardRemoval), and a file left behind by a closed tab
// goes with the sweep of the next card. The question is always asked: a
// card is more than a row.

export function RemoveCard({ cardId, takenAt, compact = false, name }: { cardId: string; takenAt: Date; compact?: boolean; name?: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    let result: Result<CardSnapshot>;
    try {
      result = await removeThingCard(cardId);
    } catch {
      // No answer (e.g. no connection): it may have gone, so the page is read again.
      result = fail("things_card_remove_failed");
      router.refresh();
    }
    setBusy(false);
    if (!result.ok) {
      if (result.error.code === "things_card_gone" || result.error.code === "unauthorized") {
        setAsking(false);
        router.refresh();
      }
      setNotice(result.error.message);
      return;
    }
    const snapshot = result.data;
    setAsking(false);
    router.refresh();
    showToast(removedCardText(shortDateText(takenAt)), {
      onUndo: () => {
        void (async () => {
          let restored: Result<null>;
          try {
            restored = await restoreThingCard(snapshot);
          } catch {
            restored = fail("things_restore_failed");
          }
          if (!restored.ok) {
            showToast(restored.error.message, { role: "alert" });
            // The card could not come back: its file is no use any more.
            if (restored.error.code === "things_restore_file_gone") void finishCardRemoval(snapshot.objectPath).catch(() => {});
          }
          router.refresh();
        })();
      },
      onClose: () => {
        void finishCardRemoval(snapshot.objectPath).catch(() => {});
      },
    });
  }

  return (
    <>
      <Button variant={compact ? "compact" : "danger"} onClick={() => setAsking(true)} className={compact ? undefined : "self-center"} aria-label={compact && name ? `Ta bort kortet ${name}` : undefined} data-testid="remove-card">
        {compact ? null : <TrashIcon size={20} />}
        {compact ? "Ta bort" : removeCardText}
      </Button>
      <Sheet
        open={asking}
        onClose={() => setAsking(false)}
        title={removeCardQuestion}
        closeLabel="Avbryt"
        initialFocus="close"
        preventClose={busy}
        footer={
          <Button variant="danger-confirm" fullWidth onClick={confirm} aria-disabled={busy || undefined}>
            {busy ? "Tar bort …" : removeCardText}
          </Button>
        }
      >
        <div className="flex flex-col gap-2">
          {notice ? <Notice role="alert">{notice}</Notice> : null}
          <p className="text-body text-ink-2">{removeCardDetail}</p>
        </div>
      </Sheet>
    </>
  );
}
