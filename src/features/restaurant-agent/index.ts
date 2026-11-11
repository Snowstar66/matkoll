// Client-safe entry of Restaurangagenten (AD-1). Pure logic only: no network, AI or database. See the design at the top
// of domain/types.ts before changing what the model may say or see.
export {
  cuisineIds,
  cuisines,
  defaultParty,
  defaultRestaurantSettings,
  maxCuisines,
  maxParty,
  maxPriorities,
  minParty,
  priorities,
  priorityIds,
  warningFlags,
  type CuisineId,
  type PriorityId,
  type Reason,
  type RestaurantSettings,
  suggestionId,
  type Suggestion,
  type WarningFlag,
} from "./domain/types";
export { parseRestaurantSettings, restaurantSettingsSchema } from "./domain/settings";
export { maxPlaceTextLength, parsePlaceText, roundCoordinates, type Coordinates, type PlaceTextResult } from "./domain/location";
export { guardSuggestions, normalizeUrl, type GuardResult, type Rejection } from "./domain/guard";
export { buildLlmInput, type LlmHousehold, type LlmInput } from "./domain/llm-input";
export {
  checkCap,
  costSek,
  defaultDayCapSek,
  maxSearchesPerRun,
  mayStartSearch,
  noUsage,
  runCapSek,
  sekPerUsd,
  usdPerSearch,
  type CapCheck,
  type ModelPrice,
  type Usage,
} from "./domain/cost";
