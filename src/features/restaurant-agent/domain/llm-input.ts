import type { CuisineId, MenuSource, PriorityId, RestaurantSettings } from "./types";
import { cuisines, priorities } from "./types";

// The ONLY thing the model sees (see the legal design in domain/types.ts). It is built field by field from three
// inputs: the household's profile (`LlmHousehold`), opaque place ids, and the restaurants' own pages (`MenuSource`).
// `Candidate` and `PlaceFacts` (Google-derived) are not accepted here: the builder takes bare ids, and a test checks
// that Google fields cannot get through even when smuggled into the arguments.

/** The household as the model needs it: no names, no ids; allergies and tastes only. */
export type LlmHousehold = { people: { allergies: string[]; likes: string[]; avoids: string[] }[] };

export type LlmRestaurant = {
  /** An opaque handle the model must echo back; it carries no Google text. */
  placeId: string;
  /** The restaurant's own pages and their text; empty when none was found. */
  pages: { url: string; text: string }[];
};

export type LlmInput = {
  party: number;
  wantedCuisines: string[];
  priorities: string[];
  household: LlmHousehold;
  restaurants: LlmRestaurant[];
};

/** Longest menu text per page that goes to the model, in characters. */
export const maxPageChars = 6000;

const cuisineLabel = (id: CuisineId) => cuisines.find((cuisine) => cuisine.id === id)?.label ?? id;
const priorityLabel = (id: PriorityId) => priorities.find((priority) => priority.id === id)?.label ?? id;

/**
 * @param placeIds Bare ids from the finder (not `Candidate` objects: those carry Google-derived fields).
 * @param sources Menu pages by place; pages of places not in `placeIds` are dropped.
 */
export function buildLlmInput(settings: RestaurantSettings, household: LlmHousehold, placeIds: readonly string[], sources: readonly MenuSource[]): LlmInput {
  return {
    party: settings.party,
    wantedCuisines: settings.cuisines.map(cuisineLabel),
    priorities: settings.priorities.map(priorityLabel),
    household: {
      people: household.people.map((person) => ({ allergies: [...person.allergies], likes: [...person.likes], avoids: [...person.avoids] })),
    },
    restaurants: placeIds.map((placeId) => ({
      placeId,
      // Only url and text are copied: nothing else a source object might carry gets through.
      pages: sources.filter((source) => source.placeId === placeId).map((source) => ({ url: source.url, text: source.text.slice(0, maxPageChars) })),
    })),
  };
}
