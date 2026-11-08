// Tillval (Inställningar → Tillval): switches for the app's quiet extras. Each is
// kept per device in localStorage (wrapped, since storage can be blocked), like the
// colour theme. A new feature adds a row to `options` and reads it with useOption;
// the settings page lists whatever is here.

export const options = [
  {
    id: "recipeTimer",
    group: "I receptet",
    label: "Timer i receptet",
    hint: "Tryck på en tid i ett steg för att starta en timer",
    defaultOn: true,
  },
  {
    id: "recipeAwake",
    group: "I receptet",
    label: "Skärmen släcks inte i receptet",
    hint: "Skärmen förblir tänd medan ett recept är öppet",
    defaultOn: true,
  },
  {
    id: "showNutrition",
    group: "Näring",
    label: "Visa näring",
    hint: "Tallriken, märken och veckans rad",
    defaultOn: false,
  },
  {
    id: "showKcal",
    group: "Näring",
    label: "Visa kcal",
    hint: "kcal och gram per portion",
    defaultOn: false,
  },
] as const;

/** The groups of the Tillval page, in the order they are shown. */
export const optionGroups = ["I receptet", "Näring"] as const;

export type OptionId = (typeof options)[number]["id"];

export const optionStorageKey = (id: OptionId) => `livskoll-option-${id}`;
/** Fired on window when an option changes on this page (the `storage` event only reaches other tabs). */
export const optionChangedEvent = "livskoll-option-changed";

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Whether an option is on: its default when nothing (valid) is stored or storage is blocked. */
export function readOption(id: OptionId): boolean {
  const fallback = options.find((option) => option.id === id)?.defaultOn ?? false;
  try {
    const value = storage()?.getItem(optionStorageKey(id));
    return value === "1" ? true : value === "0" ? false : fallback;
  } catch {
    return fallback;
  }
}

/** Remembers the choice on this device. Never throws. */
export function saveOption(id: OptionId, on: boolean): void {
  try {
    storage()?.setItem(optionStorageKey(id), on ? "1" : "0");
  } catch {
    // Storage blocked: the choice holds until the page is closed.
  }
  try {
    window.dispatchEvent(new Event(optionChangedEvent));
  } catch {
    // No window.
  }
}
