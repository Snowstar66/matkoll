"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/button";
import { TrashIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { fail, type Result } from "@/lib/errors";
import { removeEmptyThingRoom, restoreThingRoom } from "../actions/remove-room";
import { removeRoomText, roomRemovedText, type RoomSnapshot } from "../domain/thing-clear";

// "Ta bort rummet" for an empty room (Pontus 1 Nov): no question and no name
// to type, since it can be undone. The room goes at once, the user is back on
// Förråd, and "Tog bort Boden." offers "Ångra", as a line of the list or a dish
// of Matsedel does (Story 19.4). A room that has got a card or a föremål
// meanwhile is not removed: the page is read again and "Rensa rummet" is there.

export type RemoveRoomProps = { siteId: string; roomKey: string; room: string };

export function useRemoveEmptyRoom({ siteId, roomKey, room }: RemoveRoomProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function remove() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    let result: Result<RoomSnapshot>;
    try {
      result = await removeEmptyThingRoom({ siteId, roomKey });
    } catch {
      // No answer: it may have gone, so the page is read again.
      result = fail("things_place_remove_failed");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
    if (!result.ok) {
      showToast(result.error.message, { role: "alert" });
      if (result.error.code === "things_place_gone") router.replace("/prylar");
      else router.refresh();
      return;
    }
    const snapshot = result.data;
    // The room is gone: back to Förråd, and "back" never leads to it.
    router.replace("/prylar");
    showToast(roomRemovedText(room), {
      onUndo: () => {
        void (async () => {
          let restored: Result<null>;
          try {
            restored = await restoreThingRoom(snapshot);
          } catch {
            restored = fail("things_restore_failed");
          }
          if (!restored.ok) showToast(restored.error.message, { role: "alert" });
          router.refresh();
        })();
      },
    });
  }

  return { remove, busy };
}

/** The muted red "Ta bort rummet" at the end of an empty room's page. */
export function RemoveRoomButton(props: RemoveRoomProps) {
  const { remove, busy } = useRemoveEmptyRoom(props);
  return (
    <Button variant="danger" disabled={busy} onClick={() => void remove()} className="-ml-3 self-start" data-testid="remove-room">
      <TrashIcon size={20} />
      {removeRoomText}
    </Button>
  );
}
