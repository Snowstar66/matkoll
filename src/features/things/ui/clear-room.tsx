"use client";

import { useRouter } from "next/navigation";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { MoreIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { clearThingRoom } from "../actions/clear-things";
import { renameThingRoom } from "../actions/edit-place";
import { clearRoomDetailText, clearRoomMenuText, moreActionsText, roomClearedText, type ClearCounts } from "../domain/thing-clear";
import { mergeConfirmText, mergeQuestionText, renameRoomLabelText, renameRoomMenuText, roomRenamedText } from "../domain/thing-place-edit";
import { ClearSheet } from "./clear-sheet";
import { RenameSheet } from "./rename-sheet";

// The ⋯ menu of a room's page (Story 18.15) with "Rensa rummet": the sheet shows
// what goes, and the user types the room's name before the room's cards, files,
// things, boxes and places are removed. Afterwards the user is back on Förråd.
// "Byt namn på rummet" (Story 18.16) gives the room another name; when the boende
// has a room with that name the sheet asks, and the rooms are merged on a yes.

export function ClearRoom({ siteId, roomKey, room, counts }: { siteId: string; roomKey: string; room: string; counts: ClearCounts }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const firstItem = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    firstItem.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
    toggle.current?.focus();
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    } else if (event.key === "Tab") setMenuOpen(false);
  }

  function ask() {
    // Focus on ⋯ first, so the sheet gives it back when it closes.
    closeMenu();
    setAsking(true);
  }

  function rename() {
    closeMenu();
    setRenaming(true);
  }

  return (
    <div ref={root} className="relative flex">
      <button
        ref={toggle}
        type="button"
        aria-label={moreActionsText}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        onClick={() => setMenuOpen((open) => !open)}
        className="flex size-tap items-center justify-center rounded-full text-ink-2"
        data-testid="room-menu"
      >
        <MoreIcon size={24} />
      </button>
      {menuOpen ? (
        <div
          id={menuId}
          role="menu"
          aria-label={moreActionsText}
          onKeyDown={onMenuKeyDown}
          className="absolute top-full right-0 z-30 flex min-w-40 flex-col rounded-md border border-hairline bg-surface py-1"
        >
          <button ref={firstItem} type="button" role="menuitem" onClick={rename} className="min-h-tap px-4 text-left text-body text-ink" data-testid="rename-room">
            {renameRoomMenuText}
          </button>
          <button type="button" role="menuitem" onClick={ask} className="min-h-tap px-4 text-left text-body text-ink" data-testid="clear-room">
            {clearRoomMenuText}
          </button>
        </div>
      ) : null}
      <RenameSheet
        open={renaming}
        onClose={() => setRenaming(false)}
        title={renameRoomMenuText}
        label={renameRoomLabelText}
        initial={room}
        confirmText={mergeConfirmText}
        submit={async (name, merge) => {
          const result = await renameThingRoom({ siteId, roomKey, name, merge });
          if (!result.ok) {
            if (result.error.code === "things_place_gone") router.replace("/prylar");
            return { kind: "error", message: result.error.fields?.name ?? result.error.message, field: Boolean(result.error.fields?.name) };
          }
          if (result.data.kind === "exists") return { kind: "ask", question: mergeQuestionText(result.data.room) };
          // The room's address has its key, so the page moves to the new one.
          router.replace(`/prylar/rum/${siteId}/${encodeURIComponent(result.data.key)}`);
          showToast(roomRenamedText(result.data.room, result.data.merged));
          return { kind: "done" };
        }}
      />
      <ClearSheet
        open={asking}
        onClose={() => setAsking(false)}
        title={clearRoomMenuText}
        counts={counts}
        detail={clearRoomDetailText}
        word={room}
        onClear={(confirm) => clearThingRoom({ siteId, roomKey, confirm })}
        onCleared={(removed) => {
          setAsking(false);
          // The room is gone: back to Förråd, and "back" never leads to it.
          router.replace("/prylar");
          showToast(roomClearedText(room, removed));
        }}
        onStale={() => router.refresh()}
      />
    </div>
  );
}
