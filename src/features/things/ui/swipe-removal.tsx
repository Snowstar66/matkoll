"use client";

import { useRouter } from "next/navigation";
import { type ReactNode } from "react";
import { useConfirmDelete } from "@/components/confirm-delete";
import { useToast } from "@/components/toast";
import { fail, type Result } from "@/lib/errors";
import { finishCardRemoval, removeThingCard, restoreThingCard } from "../actions/remove-card";
import { removeThing, restoreThing } from "../actions/thing-item";
import { categoryCountText } from "../domain/thing";
import type { CardSnapshot } from "../domain/thing-edit";
import { addRemovedCard, addRemovedThing } from "./removed-things";

// "Ta bort med svep" in Förråd's lists (UX-E): a card's row and a föremål's row in a room (SwipeRow, as in Inköpslistan).
// The first removal asks ("Ta bort kortet X?" / "Ta bort föremålet X?"); after each removal everything is removed at
// once for 60 s. The window is Förråd's own (a key of its own, so a removal in Inköpslistan never starts it, and the
// other way round) and lives in memory. The row then stays, struck through, with "Ångra" (removed-things.tsx).

/** Förråd's own key for the 60 s window (confirm-delete.tsx); the shopping list has another. */
export const forradDeleteGraceKey = "forrad";

const undoDetailText = "Du kan ångra strax efteråt.";

/** The question for a card, e.g. "Ta bort kortet Hela rummet?". */
export function removeCardRowQuestion(label: string): string {
  return `Ta bort kortet ${label}?`;
}
/** The question for a föremål, e.g. "Ta bort föremålet Hammare?". */
export function removeThingRowQuestion(name: string): string {
  return `Ta bort föremålet ${name}?`;
}
/** What happens to a card and its föremål, under the question. */
export function removeCardRowDetail(count: number): string {
  return `Kortet och dess ${categoryCountText(count)} tas bort. ${undoDetailText}`;
}

/** The thumbnail of a card's row as a small data URL, read from the picture already on screen; null when it cannot be read. */
function thumbOf(cardId: string): string | null {
  try {
    const image = document.querySelector<HTMLImageElement>(`[data-card-id="${cardId}"] img`);
    if (!image || image.naturalWidth === 0) return null;
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = 112;
    canvas.height = 112;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 112, 112);
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}

/**
 * A keyboard or screen reader removal moves focus to the next row (the one that slides up), never after a swipe, so
 * nothing on a phone takes focus. Called before the removal, while the action's button still has focus; the next row
 * is found by its place in the list and focused once the removal is done.
 */
export function nextRowTarget(): HTMLElement | null {
  const active = document.activeElement;
  const row = active instanceof HTMLElement ? active.closest("li, section") : null;
  const next = row?.nextElementSibling;
  return next instanceof HTMLElement ? next.querySelector<HTMLElement>("a[href], button:not([disabled])") : null;
}

/**
 * A tap on the revealed "Ta bort" leaves focus on its button, and the question sheet gives focus back to it when it
 * closes; a focused action opens its row (SwipeRow), so "Avbryt" would leave the row open. After a pointer press the
 * button lets go of focus first, so the row snaps back. A keyboard press keeps it: focus stays where the user is.
 */
function letGoOfFocus(via: "keyboard" | "pointer") {
  if (via === "pointer" && document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

export type SwipeRemoval = {
  /** Removes a föremål's row (asks first, unless the 60 s window is open). `via` is how the action was pressed. */
  removeThingRow: (thing: { id: string; name: string }, via: "keyboard" | "pointer") => void;
  /** Removes a card's row; `index` is its place in the list, `things` how many föremål it shows. */
  removeCardRow: (card: { id: string; label: string; meta: string; things: number; index: number }, via: "keyboard" | "pointer", onGone?: () => void) => void;
  /** The question sheet; render it once. */
  dialog: ReactNode;
};

export function useSwipeRemoval(): SwipeRemoval {
  const router = useRouter();
  const { showToast } = useToast();
  const { requestDelete, dialog } = useConfirmDelete({ graceKey: forradDeleteGraceKey });

  function afterRemoval(via: "keyboard" | "pointer", next: HTMLElement | null) {
    if (via === "keyboard") next?.focus();
  }

  async function doRemoveThing(thing: { id: string; name: string }, via: "keyboard" | "pointer", next: HTMLElement | null) {
    let result: Awaited<ReturnType<typeof removeThing>>;
    try {
      result = await removeThing(thing.id);
    } catch {
      result = fail("things_item_failed");
      router.refresh();
    }
    if (!result.ok) {
      if (result.error.code === "things_item_gone") router.refresh();
      showToast(result.error.message, { role: "alert" });
      return;
    }
    const snapshot = result.data;
    router.refresh();
    addRemovedThing({
      id: thing.id,
      name: thing.name,
      photoId: snapshot.photoId,
      category: snapshot.category,
      noted: snapshot.source === "noted",
      undo: () => {
        void (async () => {
          let restored: Result<null>;
          try {
            restored = await restoreThing(snapshot);
          } catch {
            restored = fail("things_restore_failed");
          }
          if (!restored.ok) showToast(restored.error.message, { role: "alert" });
          router.refresh();
        })();
      },
    });
    afterRemoval(via, next);
  }

  async function doRemoveCard(card: { id: string; label: string; meta: string; index: number }, via: "keyboard" | "pointer", next: HTMLElement | null, thumb: string | null, onGone?: () => void) {
    let result: Result<CardSnapshot>;
    try {
      result = await removeThingCard(card.id);
    } catch {
      // No answer (e.g. no connection): it may have gone, so the page is read again.
      result = fail("things_card_remove_failed");
      router.refresh();
    }
    if (!result.ok) {
      if (result.error.code === "things_card_gone" || result.error.code === "unauthorized") router.refresh();
      showToast(result.error.message, { role: "alert" });
      return;
    }
    const snapshot = result.data;
    onGone?.();
    router.refresh();
    addRemovedCard({
      id: card.id,
      label: card.label,
      meta: card.meta,
      index: card.index,
      thumb,
      undo: () => {
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
      // The time is out without "Ångra": the photo's file goes (a file left by a closed tab goes with the next card's sweep).
      onExpire: () => {
        void finishCardRemoval(snapshot.objectPath).catch(() => {});
      },
    });
    afterRemoval(via, next);
  }

  return {
    removeThingRow(thing, via) {
      const next = via === "keyboard" ? nextRowTarget() : null;
      letGoOfFocus(via);
      requestDelete({ question: removeThingRowQuestion(thing.name), detail: undoDetailText, onConfirm: () => doRemoveThing(thing, via, next) });
    },
    removeCardRow(card, via, onGone) {
      const next = via === "keyboard" ? nextRowTarget() : null;
      // Read before the question opens: the row's picture is still on screen.
      const thumb = thumbOf(card.id);
      letGoOfFocus(via);
      requestDelete({ question: removeCardRowQuestion(card.label), detail: removeCardRowDetail(card.things), onConfirm: () => doRemoveCard(card, via, next, thumb, onGone) });
    },
    dialog,
  };
}
