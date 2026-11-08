// Steps ticked off in a recipe while cooking ("Bocka av steg" in Tillval). Kept on
// this device in localStorage, per recipe, with the time of the last change. They
// reset by themselves, so the next time the dish is cooked every step is open again:
// - when the dish is marked as cooked (MarkCookedButton clears them),
// - when "Börja om" is tapped,
// - and stepChecksMaxAgeMs after the last tick (read as empty, then removed).
// Storage can be blocked (private mode): then the ticks just live until the page closes.

export const stepChecksMaxAgeMs = 12 * 60 * 60 * 1000;

/** Fired on window when this page changes the ticks (the `storage` event only reaches other tabs). */
export const stepChecksChangedEvent = "livskoll-step-checks-changed";

const storageKey = (recipeId: string) => `livskoll-step-checks-${recipeId}`;

type Stored = { at: number; ids: string[] };

const memory = new Map<string, Stored>();

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function isStored(value: unknown): value is Stored {
  if (typeof value !== "object" || value === null) return false;
  const stored = value as Record<string, unknown>;
  return typeof stored.at === "number" && Array.isArray(stored.ids) && stored.ids.every((id) => typeof id === "string");
}

function readStored(recipeId: string): Stored | null {
  const store = storage();
  if (!store) return memory.get(recipeId) ?? null;
  try {
    const parsed: unknown = JSON.parse(store.getItem(storageKey(recipeId)) ?? "null");
    return isStored(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(stepChecksChangedEvent));
}

/** The ticked step ids of a recipe; none once they are older than stepChecksMaxAgeMs. */
export function readStepChecks(recipeId: string, now = Date.now()): string[] {
  const stored = readStored(recipeId);
  if (!stored) return [];
  if (now - stored.at > stepChecksMaxAgeMs) return [];
  return stored.ids;
}

/** Ticks exactly `ids` (none removes the entry). */
export function saveStepChecks(recipeId: string, ids: readonly string[], now = Date.now()) {
  const store = storage();
  if (ids.length === 0) {
    memory.delete(recipeId);
    try {
      store?.removeItem(storageKey(recipeId));
    } catch {
      // Blocked storage: nothing was kept there.
    }
  } else {
    const value: Stored = { at: now, ids: [...ids] };
    if (store) {
      try {
        store.setItem(storageKey(recipeId), JSON.stringify(value));
      } catch {
        memory.set(recipeId, value);
      }
    } else memory.set(recipeId, value);
  }
  notify();
}

/** Every step open again: after cooking, or "Börja om". */
export function clearStepChecks(recipeId: string) {
  saveStepChecks(recipeId, []);
}
