// Result shape and error codes for actions and Route Handlers (AD-13).
// Codes are `<area>_<reason>`; the Swedish text follows Voice and Tone in EXPERIENCE.md.
// Expected errors are returned, never thrown to the client.

export const errorMessages = {
  unauthorized: "Du behöver logga in.",
  validation: "Kontrollera uppgifterna och försök igen.",
  auth_link_invalid: "Länken har gått ut eller redan använts. Be om en ny.",
  auth_not_allowed: "Adressen har inte åtkomst till Matkoll.",
  auth_sign_out_failed: "Det gick inte att logga ut. Försök igen.",
  ai_unavailable: "AI-tjänsten svarar inte just nu. Är datorn med modellen igång?",
  ai_invalid: "Det gick inte att tolka svaret. Försök igen.",
  ai_rejected: "AI-tjänsten tog inte emot förfrågan. Prova med en kortare text eller försök igen senare.",
  import_no_recipe: "Det gick inte att hitta något recept i texten.",
  catalog_unavailable: "Det gick inte att läsa ingredienskatalogen. Försök igen.",
  recipe_save_failed: "Det gick inte att spara receptet. Försök igen.",
  recipe_delete_failed: "Det gick inte att ta bort receptet. Försök igen.",
  recipe_conflict: "Receptet har ändrats någon annanstans. Stäng och öppna det igen.",
  recipe_conflicting_links: "Två rader med samma text kan inte kopplas till olika ingredienser.",
  recipe_search_failed: "Det gick inte att söka bland recepten. Försök igen.",
  recipe_favorite_failed: "Det gick inte att spara favoriten.",
  settings_unavailable: "Det gick inte att läsa inställningarna. Försök igen.",
  pantry_unavailable: "Det gick inte att läsa lagret. Försök igen.",
  pantry_save_failed: "Det gick inte att spara varan. Försök igen.",
  // Removing an item (Story 2.3). After a failed remove the row is back in
  // the list; after a failed "Ångra" it stays removed.
  pantry_remove_failed: "Det gick inte att ta bort varan.",
  pantry_restore_failed: "Det gick inte att ångra.",
  // Matsedel (Story 3.1). After failed servings the selector shows the saved
  // value again; after a failed remove the dish is back on the plan.
  mealplan_unavailable: "Det gick inte att läsa matsedeln. Försök igen.",
  // In Lägg till rätt when the library cannot be read; the plan is still shown.
  mealplan_recipes_unavailable: "Det gick inte att läsa recepten. Försök igen.",
  mealplan_add_failed: "Det gick inte att lägga rätten på matsedeln. Försök igen.",
  mealplan_servings_failed: "Det gick inte att spara portionerna.",
  mealplan_remove_failed: "Det gick inte att ta bort rätten.",
  mealplan_restore_failed: "Det gick inte att ångra.",
  // Tidigare matsedlar (Story 3.2). After a failed "Använd igen" or "Ny
  // matsedel" the current plan is as it was; after a failed delete the plan stays.
  mealplan_previous_unavailable: "Det gick inte att läsa tidigare matsedlar. Försök igen.",
  mealplan_create_failed: "Det gick inte att skapa matsedeln. Försök igen.",
  // "Använd igen" of a plan deleted elsewhere: back to Tidigare.
  mealplan_plan_gone: "Matsedeln finns inte längre.",
  // A new plan that cannot be made as asked, because the plans changed
  // elsewhere (or the recipes did): the page is read again.
  mealplan_plans_changed: "Matsedlarna har ändrats.",
  mealplan_delete_failed: "Det gick inte att ta bort matsedeln. Försök igen.",
  // Inköpslista (Story 3.3): the plan, its recipes or the catalog cannot be read.
  shopping_unavailable: "Det gick inte att läsa inköpslistan. Försök igen.",
  // A check that could not be saved (Story 3.4): the check goes back.
  shopping_check_failed: "Det gick inte att spara bocken.",
  // A check from a page whose plan is no longer the current one: the list is read again.
  shopping_plan_changed: "Matsedeln har bytts. Listan är uppdaterad.",
  // Own items (Story 3.5). A failed add keeps the sheet as it was; after a
  // failed remove the item is back on the list; after a failed "Ångra" it
  // stays removed.
  shopping_save_failed: "Det gick inte att spara varan. Försök igen.",
  shopping_remove_failed: "Det gick inte att ta bort varan.",
  shopping_restore_failed: "Det gick inte att ångra.",
  // An own item changed in its detail after it was removed elsewhere (Story 3.6): the sheet closes and the list is read again.
  shopping_item_gone: "Varan finns inte längre.",
  // Recipe sites in Inställningar (FR7). The sentence with the site's name,
  // "koket.se finns redan.", is in `fields.domain`.
  settings_invalid_domain: "Ange en giltig webbadress, t.ex. koket.se.",
  settings_duplicate_domain: "Sajten finns redan.",
  settings_save_failed: "Det gick inte att spara ändringen. Försök igen.",
  // Fetching a recipe page (AD-11). The sentence with the site's name, from
  // `fields.domain`, is built by fetchErrorMessage below.
  fetch_invalid_url: "Det där ser inte ut som en länk till en receptsida. Kopiera hela adressen, som börjar med https://.",
  fetch_domain_not_allowed: "Sajten är inte en godkänd receptsajt.",
  fetch_blocked: "Sajten släppte inte in oss.",
  fetch_timeout: "Sajten svarade inte i tid.",
  fetch_too_large: "Sidan är för stor för att läsas.",
  /** The caller stopped the fetch ("Avbryt"); the client shows nothing for it. */
  fetch_aborted: "Hämtningen avbröts.",
  // Photos (AD-15): resized in the client, checked again by the server.
  image_too_large: "Bilden är för stor. Ta en ny bild eller välj en mindre bild.",
  image_unsupported: "Bildformatet stöds inte. Välj en JPEG-, PNG- eller WebP-bild.",
} as const;

/**
 * The text for a fetch error that names the site, when `fields.domain` has it:
 * "ica.se är inte en godkänd receptsajt." (EXPERIENCE.md, State Patterns).
 * Other errors keep their message.
 */
export function fetchErrorMessage(error: Pick<AppError, "code" | "message" | "fields">): string {
  const domain = error.fields?.domain;
  if (!domain) return error.message;
  switch (error.code) {
    case "fetch_domain_not_allowed":
      return `${domain} är inte en godkänd receptsajt.`;
    case "fetch_blocked":
      return `${domain} släppte inte in oss.`;
    case "fetch_timeout":
      return `${domain} svarade inte i tid.`;
    default:
      return error.message;
  }
}

/**
 * The text for `ai_invalid` in an import: after an invalid AI answer, an import
 * also suggests pasting the text (EXPERIENCE.md, State Patterns).
 */
export const importInvalidMessage = "Det gick inte att tolka svaret. Försök igen eller klistra in texten.";

/** True for a string that is one of the error codes above. */
export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && Object.hasOwn(errorMessages, value);
}

export type ErrorCode = keyof typeof errorMessages;

export type AppError = {
  code: ErrorCode;
  message: string;
  /** Per-field messages for form validation, keyed by field name. */
  fields?: Record<string, string>;
};

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };

export function ok<T>(data: T): Result<T>;
export function ok(): Result<null>;
export function ok<T>(data?: T): Result<T | null> {
  return { ok: true, data: data ?? null };
}

export function fail(code: ErrorCode, fields?: Record<string, string>): { ok: false; error: AppError } {
  return {
    ok: false,
    error: fields ? { code, message: errorMessages[code], fields } : { code, message: errorMessages[code] },
  };
}
