"use client";

// Siffra på hemskärmsikonen (Story 23.2): the Badging API, when the browser has
// it. An installed app on iOS 16.4+ shows the number only after notifications
// are allowed; Chrome and Edge on a computer show it for an installed app
// without asking. It is opt-in, per device, in Inställningar → Appen, and kept
// in localStorage (wrapped, since storage can be blocked).

/** The parts of navigator the badge needs; missing where the browser lacks them. */
export type BadgeNavigator = {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/** The parts of window.Notification the opt-in needs. */
export type NotificationLike = {
  permission: NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
};

const optInKey = "livskoll.app-badge";

/** True when the browser can put a number on the app's icon. */
export function canBadge(nav: BadgeNavigator | undefined = browserNavigator()): boolean {
  return typeof nav?.setAppBadge === "function" && typeof nav.clearAppBadge === "function";
}

/** Shows `count` on the icon, or clears it at 0. False when the browser cannot, or refused (never throws). */
export async function showAppBadge(count: number, nav: BadgeNavigator | undefined = browserNavigator()): Promise<boolean> {
  if (!nav || !canBadge(nav)) return false;
  try {
    if (count > 0) await nav.setAppBadge!(count);
    else await nav.clearAppBadge!();
    return true;
  } catch {
    // Not installed, or notifications not allowed (iOS): nothing to show, nothing to say.
    return false;
  }
}

/** Whether notifications are allowed, for the opt-in's text; "unsupported" without the Notification API. */
export function notificationState(notification: NotificationLike | undefined = browserNotification()): NotificationPermission | "unsupported" {
  return notification ? notification.permission : "unsupported";
}

/**
 * Asks for notifications once, when they have not been asked for: iOS shows
 * the icon's number only then. Returns the answer, or the state as it was.
 */
export async function askForBadgePermission(notification: NotificationLike | undefined = browserNotification()): Promise<NotificationPermission | "unsupported"> {
  if (!notification) return "unsupported";
  if (notification.permission !== "default") return notification.permission;
  try {
    return await notification.requestPermission();
  } catch {
    return notification.permission;
  }
}

/** Whether "Siffra på appikonen" is on, on this device. */
export function badgeOptedIn(storage: Pick<Storage, "getItem"> | undefined = browserStorage()): boolean {
  try {
    return storage?.getItem(optInKey) === "on";
  } catch {
    return false;
  }
}

/** Turns "Siffra på appikonen" on or off on this device. */
export function setBadgeOptIn(on: boolean, storage: Pick<Storage, "setItem" | "removeItem"> | undefined = browserStorage()): void {
  try {
    if (on) storage?.setItem(optInKey, "on");
    else storage?.removeItem(optInKey);
  } catch {
    // Blocked storage: the setting holds until the page is closed, no longer.
  }
}

function browserNavigator(): BadgeNavigator | undefined {
  return typeof navigator === "undefined" ? undefined : (navigator as BadgeNavigator);
}

function browserNotification(): NotificationLike | undefined {
  return typeof window !== "undefined" && "Notification" in window ? window.Notification : undefined;
}

function browserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
