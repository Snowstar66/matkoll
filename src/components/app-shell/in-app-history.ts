// Whether this page load has moved within Matkoll (Story 11.6): the app shell
// counts client navigations, so a back link can go back in history when there
// is a page of Matkoll to go back to, and otherwise to a fixed page. A reload
// or a link from outside starts at zero.

let navigations = 0;

/** Called by the app shell when the path changes after the first render. */
export function noteInAppNavigation(): void {
  navigations += 1;
}

/** True when going back in history stays in Matkoll. */
export function hasInAppHistory(): boolean {
  return navigations > 0;
}

/** For tests: back to a fresh page load. */
export function resetInAppHistory(): void {
  navigations = 0;
}
