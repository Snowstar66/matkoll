import { parseRestaurantSettings } from "../domain/settings";
import { defaultRestaurantSettings, type RestaurantSettings } from "../domain/types";

// The choices are kept on this device only (localStorage, like the Tillval switches). Nothing goes to the server
// except as part of a search, and nothing is stored there (d7). Blocked storage means the defaults every time.

export const settingsStorageKey = "livskoll-restaurant-agent-settings";

export function readStoredSettings(): RestaurantSettings {
  try {
    const raw = window.localStorage.getItem(settingsStorageKey);
    return raw ? parseRestaurantSettings(JSON.parse(raw)) : { ...defaultRestaurantSettings };
  } catch {
    return { ...defaultRestaurantSettings };
  }
}

export function writeStoredSettings(settings: RestaurantSettings): void {
  try {
    window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
  } catch {
    // Blocked storage: the choice lasts until the page closes.
  }
}
