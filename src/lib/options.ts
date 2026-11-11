// Tillval (Inställningar → Tillval): switches for the app's quiet extras. Each is
// kept per device in localStorage (wrapped, since storage can be blocked), like the
// colour theme. A new feature adds a row to `options` and reads it with useOption;
// the settings page lists whatever is here.

/**
 * The groups the settings page shows, in order, each under its small label. Delade recept comes
 * last on its own, after "Gäller bara den här enheten.", since its other rows are the household's
 * (the page puts its option row there).
 */
export const optionGroups = [
  { id: "recipe", label: "I receptet" },
  { id: "household", label: "Hushållet" },
  { id: "nutrition", label: "Näring" },
  { id: "dagens", label: "Dagens" },
  { id: "menu", label: "Äta ute" },
  { id: "shared", label: "Delade recept" },
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
    id: "recipeSteps",
    group: "recipe",
    label: "Bocka av steg",
    hint: "Tryck på stegets nummer. Bockarna försvinner när receptet är lagat eller efter 12 timmar",
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
  // "dagensFood" keeps its id from when it also covered the season, so a saved choice still means Matdagar.
  { id: "dagensFood", group: "dagens", label: "Matdagar", hint: "Kanelbullens dag, semmeldagen och andra", defaultOn: true },
  { id: "dagensSeason", group: "dagens", label: "Säsongens råvara", hint: "Vad som är som bäst just nu", defaultOn: true },
  { id: "dagensNameDay", group: "dagens", label: "Namnsdag", hint: "", defaultOn: false },
  { id: "dagensAlmanac", group: "dagens", label: "Kinesiska almanackan", hint: "宜 vad dagen passar för, 忌 vad du bör undvika", defaultOn: false },
  { id: "menuAdvisor", group: "menu", label: "Menyrådgivare", hint: "För dig som äter ute och vill ha hjälp att välja", defaultOn: false },
  { id: "restaurantAgent", group: "menu", label: "Restaurangagenten", hint: "Hjälper dig hitta ett ställe att äta på i närheten. Under uppbyggnad, händer inget än", defaultOn: false },
  { id: "weekAgent", group: "household", label: "Veckoagenten", hint: "Ett förslag på veckans middagar som du godkänner. Inget sparas utan att du säger ja", defaultOn: false },
  { id: "showShared", group: "shared", label: "Visa delade recept", hint: "Recept som andra hushåll delar, under Recept", defaultOn: true },
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

/**
 * Choice options: a few named values instead of on/off, kept per device under the same key scheme.
 * "showFit" (Visa vem rätten passar) was a switch ("1"/"0") before: "0" now reads as Inget, anything else as the default.
 */
export const choiceOptions = [
  {
    id: "showFit",
    group: "household",
    label: "Visa vem rätten passar",
    hint: "Hur hushållets smak och allergier syns på recept och Matsedel",
    defaultValue: "dots",
    choices: [
      { value: "dots", label: "Prickar" },
      { value: "text", label: "Text" },
      { value: "none", label: "Inget" },
    ],
  },
] as const satisfies readonly { id: string; group: OptionGroupId; label: string; hint: string; defaultValue: string; choices: readonly { value: string; label: string }[] }[];

export type ChoiceOptionId = (typeof choiceOptions)[number]["id"];
export type FitMode = Extract<(typeof choiceOptions)[0]["choices"][number]["value"], string>;

const choiceDefaults = { showFit: "dots" } as const satisfies Record<ChoiceOptionId, string>;

export const defaultChoice = <Id extends ChoiceOptionId>(id: Id): string => choiceDefaults[id];

/** The chosen value of a choice option; the default when nothing valid is stored (a legacy "0" is "none"). */
export function readChoice(id: ChoiceOptionId): string {
  const option = choiceOptions.find((entry) => entry.id === id);
  const fallback = choiceDefaults[id];
  try {
    const value = storage()?.getItem(optionStorageKey(id as unknown as OptionId));
    if (value === null || value === undefined) return fallback;
    if (option?.choices.some((choice) => choice.value === value)) return value;
    if (id === "showFit" && value === "0") return "none";
    return fallback;
  } catch {
    return fallback;
  }
}

/** Remembers a choice on this device. Never throws. */
export function saveChoice(id: ChoiceOptionId, value: string): void {
  try {
    storage()?.setItem(optionStorageKey(id as unknown as OptionId), value);
  } catch {
    // Storage blocked: the choice holds until the page is closed.
  }
  try {
    window.dispatchEvent(new Event(optionChangedEvent));
  } catch {
    // No window.
  }
}
