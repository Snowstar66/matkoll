"use client";

import { useSyncExternalStore } from "react";
import { type DeviceInfo, noSubscription, parseDeviceInfo, serverSnapshot, snapshot } from "./device";

/** The device and whether the app is installed. On the server and during hydration: no device, not installed. */
export function useDevice(): DeviceInfo {
  return parseDeviceInfo(useSyncExternalStore(noSubscription, snapshot, serverSnapshot));
}
