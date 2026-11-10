import type { FitPerson } from "@/features/menu-advisor";
import { defaultWeekAgentSettings, type WeekAgentSettings } from "./settings";
import type { PlanInput, RecipeCandidate } from "./types";

// Test fixtures for the planner (not exported from index).

let n = 0;
export const id = (k: number) => `00000000-0000-4000-8000-${String(k).padStart(12, "0")}`;

export function recipe(title: string, ingredients: string[], extra: Partial<RecipeCandidate> = {}): RecipeCandidate {
  n += 1;
  return { id: id(n), title, ingredients, totalMinutes: 30, ...extra };
}

export const settings = (extra: Partial<WeekAgentSettings> = {}): WeekAgentSettings => ({ ...defaultWeekAgentSettings, ...extra });

export const anna: FitPerson = { name: "Anna", allergies: ["laktos"], dislikes: [], likes: ["pasta"] };
export const bo: FitPerson = { name: "Bo", allergies: [], dislikes: ["svamp"], likes: [] };

export const weekStart = "2026-11-16";

export function input(candidates: RecipeCandidate[], extra: Partial<PlanInput> = {}): PlanInput {
  return { weekStart, settings: settings(), candidates, fixedDays: [], people: [], recent: [], ...extra };
}

/** Ten different dishes of different kinds. */
export function library(): RecipeCandidate[] {
  return [
    recipe("Pasta med köttfärssås", ["400 g spaghetti", "500 g nötfärs", "1 burk krossade tomater"]),
    recipe("Kycklinggryta", ["600 g kycklingfilé", "2 dl grädde", "1 gul lök"], { totalMinutes: 50 }),
    recipe("Laxfilé med potatis", ["4 laxfilé", "800 g potatis", "1 citron"]),
    recipe("Linssoppa", ["3 dl röda linser", "1 gul lök", "1 morot", "2 dl kokosmjölk"], { totalMinutes: 25 }),
    recipe("Grönsakscurry", ["1 blomkål", "2 dl kokosmjölk", "ris"], { totalMinutes: 35 }),
    recipe("Korvstroganoff", ["500 g falukorv", "2 dl grädde", "ris"], { totalMinutes: 25 }),
    recipe("Pannkakor", ["3 dl vetemjöl", "6 dl mjölk", "3 ägg"], { totalMinutes: 30 }),
    recipe("Wok med nudlar och tofu", ["200 g nudlar", "200 g tofu", "1 paprika"], { totalMinutes: 20 }),
    recipe("Fiskgratäng", ["600 g torsk", "3 dl grädde", "ost"], { totalMinutes: 45 }),
    recipe("Svampsoppa", ["300 g champinjoner", "1 gul lök", "2 dl vatten"], { totalMinutes: 30 }),
  ];
}
