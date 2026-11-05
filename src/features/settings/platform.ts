// Which way Matkoll is running, for the home-screen hint (Story 11.6). Plain
// TypeScript so server code that imports the settings barrel never loads a .tsx
// file (the offers script runs in plain Node).

const standaloneQuery = "(display-mode: standalone)";

export type Platform = "standalone" | "ios" | "android" | "other";

export function platformSubscribe(onChange: () => void) {
  const media = window.matchMedia(standaloneQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** iPadOS 13 and later says "Macintosh" but has touch; a Mac has no touch points. */
function isIos(): boolean {
  const { userAgent, maxTouchPoints } = navigator;
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

export function platformNow(): Platform {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (iosStandalone || window.matchMedia(standaloneQuery).matches) return "standalone";
  if (isIos()) return "ios";
  if (/Android/.test(navigator.userAgent)) return "android";
  return "other";
}

/** Unknown on the server, so nothing is shown until the browser has said. */
export function platformOnServer(): Platform | null {
  return null;
}
