import type { CuisineId, PriorityId, RadiusM, RestaurantSettings, WhenId } from "./types";
import { cuisines, priorities } from "./types";

// The ONLY thing the model is told by us: the typed place, the party, the wishes and the household's tastes (see the
// design at the top of domain/types.ts). The model may then read web pages through the search tool; those pages are
// untrusted data and the prompt says so. Household allergies go along as words so the model can steer clear, but they
// are never a safety claim: the app flags `allergy_unverified` itself (domain/assemble.ts).

/** The household as the model needs it: no names, no ids; allergies and tastes only. */
export type LlmHousehold = { people: { allergies: string[]; likes: string[]; avoids: string[] }[] };

export type LlmInput = {
  /** The typed city or postcode. */
  place: string;
  party: number;
  /** A soft wish: about this far from the place. Never a measured distance. */
  radiusM: RadiusM;
  /** A soft wish: prefer places that, according to a source, are open then. */
  when: WhenId;
  wantedCuisines: string[];
  priorities: string[];
  household: LlmHousehold;
};

const cuisineLabel = (id: CuisineId) => cuisines.find((cuisine) => cuisine.id === id)?.label ?? id;
const priorityLabel = (id: PriorityId) => priorities.find((priority) => priority.id === id)?.label ?? id;

export function buildLlmInput(settings: RestaurantSettings, household: LlmHousehold, place: string): LlmInput {
  return {
    place,
    party: settings.party,
    radiusM: settings.radiusM,
    when: settings.when,
    wantedCuisines: settings.cuisines.map(cuisineLabel),
    priorities: settings.priorities.map(priorityLabel),
    // Field by field: nothing else a household object might carry (names, ids) gets through.
    household: { people: household.people.map((person) => ({ allergies: [...person.allergies], likes: [...person.likes], avoids: [...person.avoids] })) },
  };
}
