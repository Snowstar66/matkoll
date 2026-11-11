import { z } from "zod";

// Veckoagentens inställningar, per hushåll (table household_week_agent_settings). Every field is optional in what is
// stored: a household that never opened the sheet has `{}`, and a stray or invalid field falls back to its default
// instead of failing the whole read. Weekdays are 1 (måndag) to 7 (söndag), as in meal_plan_recipe.weekday.

/** A weekday: 1 (måndag) to 7 (söndag), as meal_plan_recipe.weekday. */
export const weekdaySchema = z.number().int().min(1).max(7);

export const minDinners = 3;
export const maxDinners = 7;
export const defaultDinners = 7;

export const budgets = ["normal", "low"] as const;
export type Budget = (typeof budgets)[number];

export type WeekAgentSettings = {
  /** How many dinners to cook in the week, fixed days included (3-7). Leftover and skip days are not dinners. */
  dinners: number;
  budget: Budget;
  /** Weekdays that must be vegetarian. */
  vegetarianDays: number[];
  /** Weekdays with no dinner planned (eating out, away). */
  skipDays: number[];
  /** Weekdays with leftovers or a matlåda: no dish is planned, the day is marked. */
  leftoverDays: number[];
  /** Quick dishes on weekdays (Mån-Fre), the slower ones at the weekend. */
  quickWeekdays: boolean;
  /** Prefer dishes that use what is about to expire. */
  useSoonFirst: boolean;
  /** Prefer dishes that use this week's offers. */
  favourOffers: boolean;
  /** The stores whose offers count; empty means every store the household follows. */
  offerStoreIds: string[];
};

export const defaultWeekAgentSettings: Readonly<WeekAgentSettings> = {
  dinners: defaultDinners,
  budget: "normal",
  vegetarianDays: [],
  skipDays: [],
  leftoverDays: [],
  quickWeekdays: false,
  useSoonFirst: true,
  favourOffers: true,
  offerStoreIds: [],
};

const dayList = z.array(weekdaySchema).max(7);

/** What may be saved: the same shape the database check accepts. Unknown keys are refused. */
export const weekAgentSettingsSchema = z
  .object({
    dinners: z.number().int().min(minDinners).max(maxDinners),
    budget: z.enum(budgets),
    vegetarianDays: dayList,
    skipDays: dayList,
    leftoverDays: dayList,
    quickWeekdays: z.boolean(),
    useSoonFirst: z.boolean(),
    favourOffers: z.boolean(),
    offerStoreIds: z.array(z.uuid()).max(20),
  })
  .strict();

const unique = (days: readonly number[]) => [...new Set(days)].sort((a, b) => a - b);

/**
 * The settings as the app uses them, from anything read from storage: each field that is valid is kept, any other
 * is the default; a weekday on more than one list keeps only the strongest role (skip, then leftover, then vegetarian).
 */
export function parseWeekAgentSettings(raw: unknown): WeekAgentSettings {
  const source = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: WeekAgentSettings = { ...defaultWeekAgentSettings, vegetarianDays: [], skipDays: [], leftoverDays: [], offerStoreIds: [] };
  const shape = weekAgentSettingsSchema.shape;
  const dinners = shape.dinners.safeParse(source.dinners);
  if (dinners.success) out.dinners = dinners.data;
  const budget = shape.budget.safeParse(source.budget);
  if (budget.success) out.budget = budget.data;
  for (const key of ["quickWeekdays", "useSoonFirst", "favourOffers"] as const) {
    const value = shape[key].safeParse(source[key]);
    if (value.success) out[key] = value.data;
  }
  for (const key of ["vegetarianDays", "skipDays", "leftoverDays"] as const) {
    const value = shape[key].safeParse(source[key]);
    if (value.success) out[key] = unique(value.data);
  }
  const stores = shape.offerStoreIds.safeParse(source.offerStoreIds);
  if (stores.success) out.offerStoreIds = [...new Set(stores.data)];
  return resolveDayRoles(out);
}

/** A weekday has one role: skip beats leftover beats vegetarian. */
export function resolveDayRoles(settings: WeekAgentSettings): WeekAgentSettings {
  const skip = new Set(settings.skipDays);
  const leftover = settings.leftoverDays.filter((day) => !skip.has(day));
  const taken = new Set([...skip, ...leftover]);
  return { ...settings, skipDays: unique(settings.skipDays), leftoverDays: unique(leftover), vegetarianDays: unique(settings.vegetarianDays.filter((day) => !taken.has(day))) };
}

/** The settings to save: every field, valid, with the day roles resolved. Throws a ZodError for anything invalid. */
export function toStoredSettings(settings: WeekAgentSettings): WeekAgentSettings {
  return weekAgentSettingsSchema.parse(resolveDayRoles(settings));
}

/**
 * The days a household can cook on at all: Mån-Sön without its skip and leftover days. Not more than `dinners` of
 * them get a dish (planAroundFixed picks the first ones that are empty).
 */
export function cookableDays(settings: WeekAgentSettings): number[] {
  const off = new Set([...settings.skipDays, ...settings.leftoverDays]);
  return [1, 2, 3, 4, 5, 6, 7].filter((day) => !off.has(day));
}
