// "Nytt sedan sist" on the Nyheter row: the newest entry's date against the one
// this device saw last. Dates are "YYYY-MM-DD", so they compare as text.

/**
 * Whether the Nyheter row gets its dot. `seen` is the date this device saw last,
 * null when it has never opened Nyheter, and undefined when the device cannot
 * remember (storage blocked): then no dot, since opening the page could never
 * clear it.
 */
export function hasNewsSince(latest: string, seen: string | null | undefined): boolean {
  if (seen === undefined) return false;
  return seen === null || latest > seen;
}
