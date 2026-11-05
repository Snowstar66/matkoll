// Push-notiser (Story 23.3): what a notification says. Shared code, since the
// write that triggers a send (revalidateFor) lives in src/lib, below the
// feature modules. Pure and client-safe.

/** What the household's changes are sorted into; the database's `push_event.kind`. */
export const pushKinds = ["lista", "forrad", "matsedel", "lappar"] as const;
export type PushKind = (typeof pushKinds)[number];

/** One notification as the service worker shows it. */
export type PushMessage = { title: string; body: string; url: string; tag: string };

/** A batch of changes by others: how many, and for a single note its author and text. */
export type PushBatch = { kind: PushKind; count: number; actorName: string | null; noteText: string | null };

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

/**
 * The notification for a batch: "3 nya varor på listan", "Pontus skrev en lapp"
 * with the note as text, "Matsedeln har ändrats". `appTitle` is the app's name,
 * the title of everything but a single note.
 */
export function pushMessageFor(batch: PushBatch, appTitle: string): PushMessage {
  switch (batch.kind) {
    case "lista":
      return { title: appTitle, body: `${plural(batch.count, "ny vara", "nya varor")} på listan`, url: "/lista", tag: "lista" };
    case "forrad":
      return { title: appTitle, body: `${plural(batch.count, "nytt kort", "nya kort")} i Förråd`, url: "/prylar", tag: "forrad" };
    case "matsedel":
      return { title: appTitle, body: "Matsedeln har ändrats", url: "/matsedel", tag: "matsedel" };
    case "lappar":
      if (batch.count === 1 && batch.noteText) {
        return { title: batch.actorName ? `${batch.actorName} skrev en lapp` : "Ny lapp", body: batch.noteText, url: "/", tag: "lappar" };
      }
      return { title: appTitle, body: plural(batch.count, "ny lapp", "nya lappar"), url: "/", tag: "lappar" };
  }
}

/** How long a batch waits for more changes after the latest one, in seconds. */
export const pushQuietSeconds = 120;
/** The longest a change waits, however many follow it, in seconds. */
export const pushMaxWaitSeconds = 300;
