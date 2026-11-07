// Push-notiser (Story 23.3): what a notification says. Shared code, since the
// write that triggers a send (revalidateFor) lives in src/lib, below the
// feature modules. Pure and client-safe.

/** What the household's changes are sorted into; the database's `push_event.kind`. */
export const pushKinds = ["lista", "forrad", "matsedel", "lappar"] as const;
export type PushKind = (typeof pushKinds)[number];

/** The choices a person can make: the queue's kinds and the daily "Ät snart", which is not queued (see eatSoonMessage). */
export type PushPreferenceKind = PushKind | "atsnart";

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

/** How many names the "Ät snart" notification lists before it says "och N till". */
const eatSoonNames = 3;

/** "Köttfärs", "Grädde och köttfärs", "Grädde, köttfärs och 2 till": the first name keeps its capital, the others are lower case. */
function eatSoonList(names: readonly string[]): string {
  const clean = names.map((name) => name.trim()).filter(Boolean);
  const shown = clean.slice(0, eatSoonNames).map((name, index) => (index === 0 ? name : name.toLocaleLowerCase("sv-SE")));
  const rest = clean.length - shown.length;
  const parts = rest > 0 ? [...shown, `${rest} till`] : shown;
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} och ${parts[parts.length - 1]}`;
}

/** An item the daily "Ät snart" is about: its catalog name, and whether today is its last day (it is not yet overdue). */
export type EatSoonItem = { name: string; today: boolean };

/**
 * The daily "Ät snart" notification for the household's items that are due
 * today or overdue: "Köttfärs bör användas idag" (one item, exactly on its
 * last day), otherwise "Grädde och köttfärs bör användas snart". `items` are
 * in the order they are listed; none gives no notification (`null`). Tapping
 * it opens Matvaror.
 */
export function eatSoonMessage(items: readonly EatSoonItem[], appTitle: string): PushMessage | null {
  const clean = items.filter((item) => item.name.trim());
  const list = eatSoonList(clean.map((item) => item.name));
  if (!list) return null;
  const today = clean.length === 1 && clean[0].today;
  return { title: appTitle, body: today ? `${list} bör användas idag` : `${list} bör användas snart`, url: "/hemma", tag: "atsnart" };
}
