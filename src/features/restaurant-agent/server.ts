// Server-only entry (AD-1) of Restaurangagenten: the Server Action a page passes down to the UI, and its contract types.
export { findRestaurants } from "./actions/find-restaurants";
export { readMenuLink } from "./actions/read-menu-link";
export type { FindInput, FindResult, LocationQuery, MenuLinkResult, SuggestionView } from "./actions/contract";
