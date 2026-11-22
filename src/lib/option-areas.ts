// "Vad vill du ha hjälp med?" (Inställningar → Tillval): five areas of Tillval switches that can be ticked
// as a whole. Nothing is stored for an area: its box is counted from its switches every time, so the switches
// stay the only truth (the keys livskoll-option-<id> are untouched), and Ångra is kept in memory.

import { type OptionId, options, readOption, saveOption } from "./options";

/**
 * The off switch of the whole feature. With `false` the card in Tillval, the areas in the welcome tour and the
 * value on the Tillval row of the start page are gone, and every switch works as before: nothing saved is
 * touched either way.
 */
export const areasCardEnabled = true;

export type AreaId = "plan" | "cook" | "nutrition" | "ute" | "things";

export type Area = {
  id: AreaId;
  /** The name in the card, in the row value and in the messages. */
  name: string;
  /** The line of examples under the name. */
  example: string;
  /** The switches the box turns on and off together. */
  options: readonly OptionId[];
};

export const areas: readonly Area[] = [
  { id: "plan", name: "Planera veckan", example: "veckoförslag, hur ofta en rätt ätits, tidigare vecka", options: ["weekAgent", "showHowOften", "showPreviousWeek"] },
  { id: "cook", name: "Laga mat", example: "timer, bocka av steg, skärmen släcks inte, startrecept", options: ["recipeTimer", "recipeSteps", "recipeAwake", "starterRecipes"] },
  { id: "nutrition", name: "Näring", example: "näringsvärden, kcal", options: ["showNutrition", "showKcal"] },
  { id: "ute", name: "Äta ute", example: "Menyrådgivare, sök restauranger", options: ["menuAdvisor", "restaurantAgent"] },
  { id: "things", name: "Förrådet", example: "Värdetips: tips om saker som kan ha värde", options: ["worthLook"] },
];

/**
 * The switches that belong to no area, so the boxes and the buttons never touch them: Dagens (its own
 * section), Visa delade recept (the household's), and Låt agenten söka på webben and Visa sidtider (under
 * Avancerat). A new Tillval must be in an area or here, which a test checks.
 */
export const outsideAreaOptionIds: readonly OptionId[] = [
  "dagensShow",
  "dagensFood",
  "dagensSeason",
  "dagensNameDay",
  "dagensAlmanac",
  "showShared",
  "restaurantAgentWeb",
  "showTimings",
];

export type AreaStatus = "full" | "half" | "none";

/** How many switches the buttons Bara grunderna and Allt reach: all of the areas'. */
export const areaOptionIds: readonly OptionId[] = areas.flatMap((area) => area.options);

export type Read = (id: OptionId) => boolean;

/** Full when all of the area's switches are on, half when some are, none when none are. */
export function areaStatus(area: Area, read: Read = readOption): AreaStatus {
  const on = area.options.filter((id) => read(id)).length;
  return on === 0 ? "none" : on === area.options.length ? "full" : "half";
}

/** An area counts as on in the row value when at least one of its switches is on. */
export function areaIsOn(area: Area, read: Read = readOption): boolean {
  return areaStatus(area, read) !== "none";
}

/** One switch that a tap changed, with what it was before (what Ångra puts back). */
export type Change = { id: OptionId; before: boolean };

/** The switches a tap on the box would change: all to on unless the box is full, then all to off. Only those that differ. */
export function toggleAreaChanges(area: Area, read: Read = readOption): { on: boolean; changes: Change[] } {
  const on = areaStatus(area, read) !== "full";
  return { on, changes: area.options.filter((id) => read(id) !== on).map((id) => ({ id, before: read(id) })) };
}

/** The switches Bara grunderna (all off) or Allt (all on) would change. Never the ones outside the areas. */
export function setAllChanges(on: boolean, read: Read = readOption): Change[] {
  return areaOptionIds.filter((id) => read(id) !== on).map((id) => ({ id, before: read(id) }));
}

/** Writes the changes (the same call as a tap on a switch). */
export function applyChanges(changes: readonly Change[], on: boolean, save: (id: OptionId, on: boolean) => void = saveOption): void {
  for (const change of changes) save(change.id, on);
}

/** Puts back exactly the switches the changes touched. */
export function undoChanges(changes: readonly Change[], save: (id: OptionId, on: boolean) => void = saveOption): void {
  for (const change of changes) save(change.id, change.before);
}

/** Taps a box: returns what changed (empty when nothing needed changing) and the message for the toast. */
export function toggleArea(area: Area, read: Read = readOption, save: (id: OptionId, on: boolean) => void = saveOption): { changes: Change[]; message: string } {
  const { on, changes } = toggleAreaChanges(area, read);
  applyChanges(changes, on, save);
  const count = changes.length;
  return { changes, message: `${area.name} ${on ? "på" : "av"}. ${on ? "Slog på" : "Stängde"} ${count}.` };
}

/** Bara grunderna (`on` false) or Allt (`on` true). */
export function setAll(on: boolean, read: Read = readOption, save: (id: OptionId, on: boolean) => void = saveOption): { changes: Change[]; message: string } {
  const changes = setAllChanges(on, read);
  applyChanges(changes, on, save);
  return { changes, message: on ? `Allt på. Slog på ${changes.length}.` : `Bara grunderna. Stängde ${changes.length}.` };
}

/** "Planera veckan, Laga mat +1", at most two names and then +N; "Inget påslaget" when no area is on. */
export function areasValueText(read: Read = readOption): string {
  const on = areas.filter((area) => areaIsOn(area, read));
  if (on.length === 0) return "Inget påslaget";
  const names = on.slice(0, 2).map((area) => area.name).join(", ");
  return on.length > 2 ? `${names} +${on.length - 2}` : names;
}

/** Whether every Tillval is in at most one area, and in an area or on the outside list: what the test checks. */
export function uncoveredOptionIds(): OptionId[] {
  const covered = new Set<OptionId>([...areaOptionIds, ...outsideAreaOptionIds]);
  return options.map((option) => option.id).filter((id) => !covered.has(id));
}
