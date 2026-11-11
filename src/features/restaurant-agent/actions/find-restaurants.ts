"use server";

import { requireUser } from "@/features/auth/server";
import { getHouseholdFoodPreferences } from "@/features/menu-advisor/server";
import { claudeModels } from "@/features/settings";
import { getAiDayRemainingSek, getAiServiceForUser, recordMeteredUse } from "@/features/settings/server";
import { env } from "@/server/env";
import { fetchOwnPage } from "../data/public-fetch";
import { searchPlaces } from "../data/places";
import type { FindInput, FindResult } from "./contract";
import { runFind } from "./run";

const price = (id: string) => {
  const model = claudeModels.find((entry) => entry.id === id);
  if (!model) throw new Error("model_price_missing");
  return { usdPerMTokIn: model.usdPerMTokIn, usdPerMTokOut: model.usdPerMTokOut };
};

/**
 * "Hitta restaurang": finds restaurants near coordinates or a typed place (Google Places, the finder only), reads each
 * restaurant's own website, and lets Claude (Haiku 5.5 low, Sonnet 5.5 medium only when the guard rejects an answer)
 * rank them and give short reasons that cite the restaurant's own page. Google content goes to the browser only; the
 * model never sees it (legal design: domain/types.ts). Nothing is stored. Costs (Places request, tokens) count in the
 * household's daily AI cost. Never throws for an expected case. Whether the Tillval is on is per device, so it is not checked here.
 */
export async function findRestaurants(input: FindInput): Promise<FindResult> {
  return runFind(
    {
      signedIn: async () => (await requireUser()).ok,
      apiKey: env.GOOGLE_PLACES_API_KEY,
      dayRemainingSek: getAiDayRemainingSek,
      recordPlacesRequest: () => recordMeteredUse("google-places", 1),
      searchPlaces: (key, query) => searchPlaces(key, query),
      fetchPage: fetchOwnPage,
      household: async () => {
        const { people } = await getHouseholdFoodPreferences();
        return { people: people.map((person) => ({ tastes: person.tastes, allergies: [...person.allergies], likes: person.likes, avoids: person.dislikes })) };
      },
      ai: getAiServiceForUser,
      prices: { standard: price("claude-haiku-5-5"), careful: price("claude-sonnet-5-5") },
    },
    input,
  );
}
