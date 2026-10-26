import "server-only";

// Server-only entry (AD-1). The suggestions module owns no tables: it reads
// the pantry, the catalog and the recipe format through those modules.

/** AI-förslag from the pantry, for the Route Handler /api/ai/suggest (not a Server Action). */
export { suggestFromPantry } from "./actions/suggest-from-pantry";
