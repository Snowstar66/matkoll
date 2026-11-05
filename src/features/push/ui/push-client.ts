"use client";

import type { PushSubscriptionInput } from "../domain/push";

// The browser's side of push (Story 23.3): the service worker at /sw.js and the
// subscription it holds. Each function is safe to call anywhere: a browser
// without the parts says so with `false` or null, never an exception.

/** True when the browser has service workers, the Push API and notifications. */
export function pushSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof window !== "undefined" && "PushManager" in window && "Notification" in window;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

/** The VAPID public key as the bytes `subscribe` wants. */
export function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.padEnd(base64Url.length + ((4 - (base64Url.length % 4)) % 4), "=").replaceAll("-", "+").replaceAll("_", "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function toInput(subscription: PushSubscription): PushSubscriptionInput | null {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  return json.endpoint && p256dh && auth ? { endpoint: json.endpoint, p256dh, auth } : null;
}

/** This device's subscription, or null when it has none (or the browser cannot say). */
export async function currentSubscription(): Promise<PushSubscriptionInput | null> {
  if (!pushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    return subscription ? toInput(subscription) : null;
  } catch {
    return null;
  }
}

/**
 * Asks for permission (a tap is needed, so call it from a click), registers the
 * service worker and subscribes with the app's public key. Null when the person
 * said no or the browser refused.
 */
export async function subscribeThisDevice(publicKey: string): Promise<PushSubscriptionInput | null> {
  if (!pushSupported()) return null;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
    return toInput(subscription);
  } catch {
    return null;
  }
}

/** Takes this device's subscription away in the browser; the endpoint it had, or null. */
export async function unsubscribeThisDevice(): Promise<string | null> {
  if (!pushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return null;
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    return endpoint;
  } catch {
    return null;
  }
}
