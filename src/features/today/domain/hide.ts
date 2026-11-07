// "Dölj idag": the X hides the card until tomorrow, on this device. The stored value is
// the day it was hidden; a different day shows the card again.

export const hiddenStorageKey = "livskoll-dagens-hidden";
export const hiddenChangedEvent = "livskoll-dagens-hidden-changed";

/** Used only when storage is blocked, so the X still works for this visit. */
let hiddenInMemory: string | null = null;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Whether the card was hidden on `dayKey` (never throws; storage may be blocked). */
export function isHiddenToday(dayKey: string): boolean {
  if (hiddenInMemory === dayKey) return true;
  try {
    return storage()?.getItem(hiddenStorageKey) === dayKey;
  } catch {
    return false;
  }
}

export function hideToday(dayKey: string): void {
  try {
    const store = storage();
    if (!store) throw new Error("no storage");
    store.setItem(hiddenStorageKey, dayKey);
  } catch {
    // Storage blocked: the card stays hidden until the page is closed.
    hiddenInMemory = dayKey;
  }
  try {
    window.dispatchEvent(new Event(hiddenChangedEvent));
  } catch {
    // No window.
  }
}
