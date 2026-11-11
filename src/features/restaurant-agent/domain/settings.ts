import { z } from "zod";
import { cuisineIds, defaultRestaurantSettings, maxCuisines, maxParty, maxPriorities, minParty, priorityIds, radiiM, whenIds, type RestaurantSettings } from "./types";

// The choices of one run. Parsed from what a phone sends; nothing is stored (d7).

export const restaurantSettingsSchema = z.object({
  radiusM: z.union([z.literal(radiiM[0]), z.literal(radiiM[1]), z.literal(radiiM[2]), z.literal(radiiM[3])]),
  when: z.enum(whenIds),
  party: z.number().int().min(minParty).max(maxParty),
  cuisines: z.array(z.enum(cuisineIds)).max(maxCuisines),
  priorities: z.array(z.enum(priorityIds)).max(maxPriorities),
});

/** The settings, with a missing or invalid field replaced by its default and duplicates removed. Never throws. */
export function parseRestaurantSettings(input: unknown): RestaurantSettings {
  const source = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const defaults = defaultRestaurantSettings;
  const pick = <K extends keyof RestaurantSettings>(key: K, fallback: RestaurantSettings[K]): RestaurantSettings[K] => {
    const field = restaurantSettingsSchema.shape[key].safeParse(source[key]);
    return field.success ? (field.data as RestaurantSettings[K]) : fallback;
  };
  const unique = <T>(list: T[]) => [...new Set(list)];
  const listOf = <T>(value: unknown, allowed: readonly T[], max: number): T[] =>
    Array.isArray(value) ? unique(value.filter((item): item is T => (allowed as readonly unknown[]).includes(item))).slice(0, max) : [];
  return {
    radiusM: pick("radiusM", defaults.radiusM),
    when: pick("when", defaults.when),
    party: pick("party", defaults.party),
    cuisines: listOf(source.cuisines, cuisineIds, maxCuisines),
    priorities: listOf(source.priorities, priorityIds, maxPriorities),
  };
}
