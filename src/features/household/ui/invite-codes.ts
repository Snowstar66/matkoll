// The codes of the invitations made on this device (Story 21.2b). The database
// keeps only a code's hash, so the code itself is shown again ("Inbjudan
// K7Q 4MP", the sheet opened from the row) only where it was made. A per-device
// convenience in localStorage: without it the row says "Inbjudan" only.

const storageKey = "livskoll-invite-codes";
/** The most codes kept; an invitation is valid for 7 days, so older ones are long gone. */
const maxKept = 20;

type Stored = Record<string, string>;

function parse(raw: string): Stored {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}

/** The stored codes as text, for useSyncExternalStore (a string keeps the snapshot stable). */
export function readInviteCodesRaw(): string {
  try {
    return localStorage.getItem(storageKey) ?? "";
  } catch {
    return "";
  }
}

/** The codes in `raw` for the invitations still open (`openIds`). */
export function inviteCodesFor(raw: string, openIds: readonly string[]): Stored {
  return Object.fromEntries(Object.entries(parse(raw)).filter(([id]) => openIds.includes(id)));
}

const listeners = new Set<() => void>();

/** Subscribes to changes made by rememberInviteCode (this tab). */
export function subscribeInviteCodes(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Remembers the code of the invitation `id`. */
export function rememberInviteCode(id: string, code: string) {
  const entries = Object.entries({ ...parse(readInviteCodesRaw()), [id]: code }).slice(-maxKept);
  try {
    localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Private mode or full: the code is only not shown again.
  }
  for (const listener of listeners) listener();
}
