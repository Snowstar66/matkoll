// Which kind of device the app runs on, and whether it runs as the installed app
// (home-screen icon). Pure functions, so they are easy to test; `useDevice`
// reads them in the browser only.

export type Device = "iphone" | "android" | "computer";

/** The device from the browser's user agent. iPadOS says Macintosh but has a touch screen. */
export function deviceFrom(userAgent: string, maxTouchPoints: number): Device {
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return "iphone";
  if (/Android/.test(userAgent)) return "android";
  return "computer";
}

/** True when the page runs as the installed app: iOS's `navigator.standalone` or the standalone display mode. */
export function isStandalone(navigatorStandalone: boolean | undefined, displayModeStandalone: boolean): boolean {
  return navigatorStandalone === true || displayModeStandalone;
}

/**
 * The link to a recipe site's start page. In the installed app on iPhone a link opens in a
 * view without an address bar, so it goes to real Safari instead (`x-safari-https`, iOS 17+).
 */
export function recipeSiteLink(domain: string, device: Device | null, standalone: boolean): { href: string; newTab: boolean } {
  if (device === "iphone" && standalone) return { href: `x-safari-https://${domain}/`, newTab: false };
  return { href: `https://${domain}/`, newTab: true };
}

export type DeviceInfo = { device: Device | null; standalone: boolean };

const separator = ":";

const noSubscription = () => () => {};

/** One string, so `useSyncExternalStore` sees an unchanged value as unchanged. */
function snapshot(): string {
  const device = deviceFrom(navigator.userAgent, navigator.maxTouchPoints);
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone = isStandalone(nav.standalone, window.matchMedia?.("(display-mode: standalone)")?.matches === true);
  return `${device}${separator}${standalone}`;
}

const serverSnapshot = () => `null${separator}false`;

export function parseDeviceInfo(value: string): DeviceInfo {
  const [device, standalone] = value.split(separator);
  return { device: device === "null" ? null : (device as Device), standalone: standalone === "true" };
}

export { noSubscription, snapshot, serverSnapshot };
