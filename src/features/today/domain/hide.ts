// "Dölj idag": the X hides the card until tomorrow, on this device. The stored value is
// the day it was hidden; a different day shows the card again.

export const hiddenStorageKey = "livskoll-dagens-hidden";
export const hiddenChangedEvent = "livskoll-dagens-hidden-changed";

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Whether the card was hidden on `dayKey` (never throws; storage may be blocked). */
export function isHiddenToday(dayKey: string): boolean {
  try {
    return storage()?.getItem(hiddenStorageKey) === dayKey;
  } catch {
    return false;
  }
}

export function hideToday(dayKey: string): void {
  try {
    storage()?.setItem(hiddenStorageKey, dayKey);
  } catch {
    // Storage blocked: the card stays hidden until the page is closed.
  }
  try {
    window.dispatchEvent(new Event(hiddenChangedEvent));
  } catch {
    // No window.
  }
}
