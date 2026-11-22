// Tillval (Inställningar → Tillval): switches for the app's quiet extras. Each is
// kept per device in localStorage (wrapped, since storage can be blocked), like the
// colour theme. A new feature adds a row to `options` and reads it with useOption;
// the settings page lists whatever is here.

/**
 * The sections Tillval shows, in order, each under its small label (the first five are the areas of
 * "Vad vill du ha hjälp med?"). Dagens and Delade recept are sections of their own, not areas. Delade
 * recept comes last, after "Gäller bara den här enheten.", since its other rows are the household's (the
 * page puts its option row there). "debug" is not in Tillval: its switch lives under Avancerat.
 */
export const optionGroups = [
  { id: "cook", label: "Laga mat" },
  { id: "plan", label: "Planera veckan" },
  { id: "nutrition", label: "Näring" },
  { id: "menu", label: "Äta ute" },
  { id: "things", label: "Förrådet" },
  { id: "dagens", label: "Dagens" },
  { id: "shared", label: "Delade recept" },
  { id: "debug", label: "Felsökning" },
] as const;

/** The switches that live under Inställningar → Avancerat and not on the Tillval page. */
export const advancedOptionIds = ["restaurantAgentWeb", "showTimings"] as const;

export type OptionGroupId = (typeof optionGroups)[number]["id"];

export const options = [
  {
    id: "recipeTimer",
    group: "cook",
    label: "Timer i receptet",
    hint: "Tryck på en tid i ett steg för att starta en timer",
    defaultOn: true,
  },
  {
    id: "recipeSteps",
    group: "cook",
    label: "Bocka av steg",
    hint: "Tryck på stegets nummer. Bockarna försvinner när receptet är lagat eller efter 12 timmar",
    defaultOn: true,
  },
  {
    id: "recipeAwake",
    group: "cook",
    label: "Skärmen släcks inte i receptet",
    hint: "Skärmen förblir tänd medan ett recept är öppet",
    defaultOn: true,
  },
  { id: "showNutrition", group: "nutrition", label: "Visa näring", hint: "Tallriken, märken och veckans rad", defaultOn: false },
  { id: "showKcal", group: "nutrition", label: "Visa kcal", hint: "kcal och gram per portion och chippet <500 kcal i Recept", defaultOn: false },
  { id: "dagensShow", group: "dagens", label: "Visa Dagens", hint: "Ett kort överst i Recept", defaultOn: true },
  // "dagensFood" keeps its id from when it also covered the season, so a saved choice still means Matdagar.
  { id: "dagensFood", group: "dagens", label: "Matdagar", hint: "Kanelbullens dag, semmeldagen och andra", defaultOn: true },
  { id: "dagensSeason", group: "dagens", label: "Säsongens råvara", hint: "Vad som är som bäst just nu", defaultOn: true },
  { id: "dagensNameDay", group: "dagens", label: "Namnsdag", hint: "", defaultOn: false },
  { id: "dagensAlmanac", group: "dagens", label: "Kinesiska almanackan", hint: "宜 vad dagen passar för, 忌 vad du bör undvika", defaultOn: false },
  { id: "menuAdvisor", group: "menu", label: "Menyrådgivare", hint: "För dig som äter ute och vill ha hjälp att välja", defaultOn: false },
  { id: "restaurantAgent", group: "menu", label: "Sök restauranger", hint: "Sök restauranger i Google Maps med dina val ifyllda. Gratis. Telefonen frågar om plats när du öppnar sidan, och den sparas inte", defaultOn: false },
  { id: "restaurantAgentWeb", group: "menu", label: "Låt agenten söka på webben", hint: "Låt agenten söka restauranger på webben åt dig. Experimentell, kostar Claude-tokens, cirka 1 kr per sökning", defaultOn: false },
  {
    id: "worthLook",
    group: "things",
    label: "Värt en titt",
    hint: "När ett kort läses in markerar AI:n de föremål som kan vara samlarvärda eller värda mer än de ser ut. Ett tips, inte en värdering. Gäller kort du läser in efter att du slagit på det",
    defaultOn: false,
  },
  {
    id: "starterRecipes",
    group: "cook",
    label: "Startrecept",
    hint: "Välj bland färdiga vardagsrätter med bild och lägg dem i er receptlista. Inget läggs till av sig självt",
    defaultOn: false,
  },
  { id: "weekAgent", group: "plan", label: "Veckoagenten", hint: "Ett förslag på veckans middagar som du godkänner. Inget sparas utan att du säger ja", defaultOn: false },
  {
    id: "showHowOften",
    group: "plan",
    label: "Visa hur ofta",
    hint: "I Matsedel: när en rätt senast var på menyn och hur ofta, och chippen Inte på menyn och Aldrig planerad",
    defaultOn: false,
  },
  {
    id: "showPreviousWeek",
    group: "plan",
    label: "Visa tidigare vecka",
    hint: "Förra veckan finns i väljaren på Matsedel, bara för att titta",
    defaultOn: false,
  },
  {
    id: "showTimings",
    group: "debug",
    label: "Visa sidtider",
    hint: "Visar uppe till vänster hur lång tid ett byte av flik tar, från tryck till att innehållet syns. Bara för att mäta",
    defaultOn: false,
  },
  { id: "showShared", group: "shared", label: "Visa delade recept", hint: "Recept som andra hushåll delar, under Recept", defaultOn: true },
] as const satisfies readonly { id: string; group: OptionGroupId; label: string; hint: string; defaultOn: boolean }[];

export type OptionId = (typeof options)[number]["id"];

/** A switch that does nothing until another one is on: its row is greyed and says "Kräver …" while that one is off. */
export const optionRequires: Partial<Record<OptionId, OptionId>> = {
  showKcal: "showNutrition",
  restaurantAgent: "menuAdvisor",
  dagensFood: "dagensShow",
  dagensSeason: "dagensShow",
  dagensNameDay: "dagensShow",
  dagensAlmanac: "dagensShow",
};

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
    group: "plan",
    label: "Visa vem rätten passar",
    hint: "Hur hushållets smak och allergier syns på recept och Matsedel",
    defaultValue: "dots",
    choices: [
      { value: "dots", label: "Prickar" },
      { value: "text", label: "Text" },
      { value: "none", label: "Inget" },
    ],
  },
  {
    id: "oftenAfterWeeks",
    group: "plan",
    label: "Länge sedan efter",
    hint: "Så många veckor utan att rätten legat på menyn tills chipet Inte på menyn visas. Gäller med Visa hur ofta på",
    defaultValue: "4",
    choices: [
      { value: "2", label: "2 veckor" },
      { value: "3", label: "3 veckor" },
      { value: "4", label: "4 veckor" },
      { value: "6", label: "6 veckor" },
      { value: "8", label: "8 veckor" },
      { value: "12", label: "12 veckor" },
    ],
  },
] as const satisfies readonly { id: string; group: OptionGroupId; label: string; hint: string; defaultValue: string; choices: readonly { value: string; label: string }[] }[];

export type ChoiceOptionId = (typeof choiceOptions)[number]["id"];
export type FitMode = Extract<(typeof choiceOptions)[0]["choices"][number]["value"], string>;

const choiceDefaults = { showFit: "dots", oftenAfterWeeks: "4" } as const satisfies Record<ChoiceOptionId, string>;

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
