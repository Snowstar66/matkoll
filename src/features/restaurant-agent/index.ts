// Client-safe entry of Restaurangagenten (AD-1). Pure logic only: no network, AI or database in this PR. See the legal
// design at the top of domain/types.ts before adding anything that touches Google Places.
export {
  cuisineIds,
  cuisines,
  defaultParty,
  defaultRadiusM,
  defaultRestaurantSettings,
  maxCuisines,
  maxParty,
  maxPriorities,
  minParty,
  priorities,
  priorityIds,
  radiiM,
  warningFlags,
  type Candidate,
  type CuisineId,
  type MenuSource,
  type PlaceFacts,
  type PlaceKind,
  type PriorityId,
  type RadiusM,
  type Reason,
  type RestaurantSettings,
  type RunResult,
  type Suggestion,
  type WarningFlag,
} from "./domain/types";
export { parseRestaurantSettings, restaurantSettingsSchema } from "./domain/settings";
export { maxPlaceTextLength, parsePlaceText, roundCoordinates, type Coordinates, type PlaceTextResult } from "./domain/location";
export { cuisineTasteKeys, distanceScore, householdFit, rankCandidates, sugenPaBonus, sugenPaWeight, type HouseholdTaster, type RankedCandidate } from "./domain/weights";
export { allowedSourcesOf, guardSuggestions, type GuardResult, type Rejection } from "./domain/guard";
export { buildLlmInput, maxPageChars, type LlmHousehold, type LlmInput, type LlmRestaurant } from "./domain/llm-input";
export {
  checkCap,
  costSek,
  defaultDayCapSek,
  maxSearchesPerRun,
  mayStartSearch,
  noUsage,
  runCapSek,
  sekPerUsd,
  usdPerPlacesRequest,
  usdPerSearch,
  type CapCheck,
  type ModelPrice,
  type Usage,
} from "./domain/cost";
