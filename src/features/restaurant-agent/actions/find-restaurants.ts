"use server";

import { requireUser } from "@/features/auth/server";
import { getHouseholdFoodPreferences } from "@/features/menu-advisor/server";
import { claudeModels } from "@/features/settings";
import { getAiDayRemainingSek, getAiServiceForUser } from "@/features/settings/server";
import { env } from "@/server/env";
import { createReverseGeocoder } from "../data/reverse-geocode";
import type { FindInput, FindResult } from "./contract";
import { runFind } from "./run";

const price = (id: string) => {
  const model = claudeModels.find((entry) => entry.id === id);
  if (!model) throw new Error("model_price_missing");
  return { usdPerMTokIn: model.usdPerMTokIn, usdPerMTokOut: model.usdPerMTokOut };
};

/**
 * "Hitta restaurang": lets Claude (Haiku 5.5 low, Sonnet 5.5 medium only when the guard rejects an answer) search the
 * web for restaurants in a typed city or postcode (or the name of the place a rounded position is at: the server asks
 * OpenStreetMap's Nominatim, and only the name goes on) and rank them, each reason citing a page the search returned. The
 * tokens and the searches count in the household's daily AI cost (the port records them). Nothing is stored. Never
 * throws for an expected case. Whether the Tillval is on is per device, so it is not checked here.
 */
export async function findRestaurants(input: FindInput): Promise<FindResult> {
  return runFind(
    {
      signedIn: async () => (await requireUser()).ok,
      dayRemainingSek: getAiDayRemainingSek,
      household: async () => {
        const { people } = await getHouseholdFoodPreferences();
        return { people: people.map((person) => ({ allergies: [...person.allergies], likes: person.likes, avoids: person.dislikes })) };
      },
      placeOf: env.NOMINATIM_DISABLED === "1" ? null : createReverseGeocoder(),
      ai: getAiServiceForUser,
      prices: { standard: price("claude-haiku-5-5"), careful: price("claude-sonnet-5-5") },
    },
    input,
  );
}
