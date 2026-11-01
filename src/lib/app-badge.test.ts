import { describe, expect, it, vi } from "vitest";
import { askForBadgePermission, badgeOptedIn, canBadge, notificationState, setBadgeOptIn, showAppBadge } from "./app-badge";

// Siffra på hemskärmsikonen (Story 23.2): the Badging API only where the
// browser has it, never a throw, and the opt-in kept per device.

function badgeNavigator() {
  return { setAppBadge: vi.fn(async (count?: number) => void count), clearAppBadge: vi.fn(async () => {}) };
}

describe("the app icon's number", () => {
  it("is used only when the browser has both setAppBadge and clearAppBadge", () => {
    expect(canBadge(badgeNavigator())).toBe(true);
    expect(canBadge({ setAppBadge: async () => {} })).toBe(false);
    expect(canBadge({})).toBe(false);
    expect(canBadge(undefined)).toBe(false);
  });

  it("shows the total and clears it at 0", async () => {
    const nav = badgeNavigator();
    expect(await showAppBadge(3, nav)).toBe(true);
    expect(nav.setAppBadge).toHaveBeenCalledWith(3);
    expect(await showAppBadge(0, nav)).toBe(true);
    expect(nav.clearAppBadge).toHaveBeenCalledTimes(1);
  });

  it("does nothing without the API, and never throws when the browser refuses", async () => {
    expect(await showAppBadge(2, {})).toBe(false);
    const refusing = { setAppBadge: vi.fn(async () => Promise.reject(new DOMException("not allowed"))), clearAppBadge: vi.fn(async () => {}) };
    expect(await showAppBadge(2, refusing)).toBe(false);
  });

  it("asks for notifications only while they have not been asked for", async () => {
    const asking = { permission: "default" as NotificationPermission, requestPermission: vi.fn(async () => "granted" as const) };
    expect(await askForBadgePermission(asking)).toBe("granted");
    const answered = { permission: "denied" as NotificationPermission, requestPermission: vi.fn(async () => "granted" as const) };
    expect(await askForBadgePermission(answered)).toBe("denied");
    expect(answered.requestPermission).not.toHaveBeenCalled();
    expect(await askForBadgePermission(undefined)).toBe("unsupported");
    expect(notificationState(undefined)).toBe("unsupported");
  });

  it("keeps the opt-in per device, and treats blocked storage as off", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    };
    expect(badgeOptedIn(storage)).toBe(false);
    setBadgeOptIn(true, storage);
    expect(badgeOptedIn(storage)).toBe(true);
    setBadgeOptIn(false, storage);
    expect(badgeOptedIn(storage)).toBe(false);
    const blocked = {
      getItem: () => {
        throw new DOMException("blocked");
      },
      setItem: () => {
        throw new DOMException("blocked");
      },
      removeItem: () => {},
    };
    expect(badgeOptedIn(blocked)).toBe(false);
    expect(() => setBadgeOptIn(true, blocked)).not.toThrow();
  });
});
