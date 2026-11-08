// Tillval (Inställningar → Tillval): switches for the app's quiet extras. Each is
// kept per device in localStorage (wrapped, since storage can be blocked), like the
// colour theme. A new feature adds a row to `options` and reads it with useOption;
// the settings page lists whatever is here.

/** The groups the settings page shows, in order, each under its small label. */
export const optionGroups = [
  { id: "recipe", label: "I receptet" },
  { id: "nutrition", label: "Näring" },
  { id: "dagens", label: "Dagens" },
] as const;

export type OptionGroupId = (typeof optionGroups)[number]["id"];

export const options = [
  {
    id: "recipeTimer",
    group: "recipe",
    label: "Timer i receptet",
    hint: "Tryck på en tid i ett steg för att starta en timer",
    defaultOn: true,
  },
  {
    id: "recipeAwake",
    group: "recipe",
    label: "Skärmen släcks inte i receptet",
    hint: "Skärmen förblir tänd medan ett recept är öppet",
    defaultOn: true,
  },
  { id: "showNutrition", group: "nutrition", label: "Visa näring", hint: "Tallriken, märken och veckans rad", defaultOn: false },
  { id: "showKcal", group: "nutrition", label: "Visa kcal", hint: "kcal och gram per portion", defaultOn: false },
  { id: "dagensShow", group: "dagens", label: "Visa Dagens", hint: "Ett kort överst i Recept", defaultOn: true },
  { id: "dagensFood", group: "dagens", label: "Matdagar och säsong", hint: "", defaultOn: true },
  { id: "dagensNameDay", group: "dagens", label: "Namnsdag", hint: "", defaultOn: false },
  { id: "dagensAlmanac", group: "dagens", label: "Kinesiska almanackan", hint: "", defaultOn: false },
] as const satisfies readonly { id: string; group: OptionGroupId; label: string; hint: string; defaultOn: boolean }[];

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
