import { appName } from "@/app/app-info";
import { thingNoun, thingNounCap } from "@/lib/thing-noun";
// Result shape and error codes for actions and Route Handlers (AD-13).
// Codes are `<area>_<reason>`; the Swedish text follows Voice and Tone in EXPERIENCE.md.
// Expected errors are returned, never thrown to the client.

export const errorMessages = {
  unauthorized: "Du behöver logga in.",
  validation: "Kontrollera uppgifterna och försök igen.",
  auth_link_invalid: "Länken har gått ut eller redan använts. Be om en ny.",
  auth_not_allowed: `Adressen har inte åtkomst till ${appName}.`,
  // The code from the e-mail (Story 11.6): a wrong, expired or used code and an
  // address outside ALLOWED_EMAILS all give this, so the allowlist is never revealed.
  auth_code_invalid: "Koden stämmer inte eller har gått ut. Skicka en ny länk.",
  // Too many wrong codes from one address and IP (the app's limit) or Supabase's own limit.
  auth_code_rate_limited: "För många försök. Vänta en stund eller skicka en ny länk.",
  // Password sign-in (Story 17.2): a wrong password, an unknown address and an
  // address outside ALLOWED_EMAILS all give the first, so a sign-in never
  // reveals which addresses have an account.
  auth_password_invalid: "E-postadressen eller lösenordet stämmer inte.",
  auth_password_rate_limited: "För många försök. Vänta en stund och försök igen.",
  // The link from the reset mail: used, expired or not for this address.
  auth_reset_invalid: "Länken har gått ut eller redan använts. Be om en ny under Välj lösenord.",
  // "Byt lösenord" under Konto (Story 14.7): no answer from the action.
  auth_reset_mail_failed: "Det gick inte att skicka länken. Försök igen.",
  auth_reset_failed: "Det gick inte att spara lösenordet. Försök igen.",
  auth_sign_out_failed: "Det gick inte att logga ut. Försök igen.",
  ai_unavailable: "AI-tjänsten svarar inte just nu. Är datorn med modellen igång?",
  ai_invalid: "Det gick inte att tolka svaret. Försök igen.",
  ai_rejected: "AI-tjänsten tog inte emot förfrågan. Prova med en kortare text eller försök igen senare.",
  // A photo analysis stopped because a newer one from the same person started
  // (another tab, a double tap). Not an error: the client shows nothing for it.
  ai_superseded: "En nyare bild analyseras.",
  // AI jobs (Story 12.4, AD-28): the queue holds three at most; a job that
  // waited too long to start; a job whose function died or ran out of time
  // (its time passed); a result that is older than 24 hours or was closed on
  // another device.
  ai_queue_full: "Det finns redan tre AI-jobb. Vänta tills ett är klart.",
  ai_queue_timeout: "AI:n hann inte börja med det här. Försök igen.",
  ai_job_lost: "AI-jobbet avbröts. Försök igen.",
  ai_job_gone: "Resultatet finns inte längre.",
  import_no_recipe: "Det gick inte att hitta något recept i texten.",
  // AI-förslag (Story 5.2) with nothing at home: the AI is not asked.
  suggest_empty_pantry: "Matvarorna är tomma. Lägg till varor i Matvaror, så kan AI:n föreslå rätter.",
  catalog_unavailable: "Det gick inte att läsa ingredienskatalogen. Försök igen.",
  recipe_save_failed: "Det gick inte att spara receptet. Försök igen.",
  recipe_delete_failed: "Det gick inte att ta bort receptet. Försök igen.",
  recipe_conflict: "Receptet har ändrats någon annanstans. Stäng och öppna det igen.",
  recipe_conflicting_links: "Två rader med samma text kan inte kopplas till olika ingredienser.",
  recipe_search_failed: "Det gick inte att söka bland recepten. Försök igen.",
  recipe_favorite_failed: "Det gick inte att spara favoriten.",
  settings_unavailable: "Det gick inte att läsa inställningarna. Försök igen.",
  // Välkomstturen (Story 20.1): closing it could not be saved, so it may show again at the next start. Logged, never shown.
  welcome_tour_save_failed: "Det gick inte att spara att du sett rundturen.",
  pantry_unavailable: "Det gick inte att läsa matvarorna. Försök igen.",
  pantry_save_failed: "Det gick inte att spara varan. Försök igen.",
  // Removing an item (Story 2.3). After a failed remove the row is back in
  // the list; after a failed "Ångra" it stays removed.
  pantry_remove_failed: "Det gick inte att ta bort varan.",
  // Moving an unpacked item to another place (Story 16.18); it stays where it was.
  pantry_move_failed: "Det gick inte att flytta varan.",
  pantry_restore_failed: "Det gick inte att ångra.",
  // "Töm kylen" (Story 6.3), shown in the sheet that asked: nothing is
  // removed, and the sheet stays so it can be tried again.
  pantry_empty_failed: "Det gick inte att ta bort varorna. Försök igen.",
  // "Lägg till i Matvaror" (Story 3.7) before or while the pantry is written: nothing
  // is added, and the checks stay.
  pantry_add_failed: "Det gick inte att lägga varorna i Matvaror. Försök igen.",
  // Confirming lagerförslag (Story 6.2): the catalog or the pantry refused.
  // The suggestions stay; new catalog ingredients may stay too, and trying
  // again uses them.
  pantry_confirm_failed: "Det gick inte att lägga förslagen i Matvaror. Försök igen.",
  // Confirming a photo compared with its place (Story 6.4): what is added,
  // changed and removed is one transaction, so nothing changed. The
  // suggestions stay; new catalog ingredients may stay too.
  pantry_inventory_failed: "Det gick inte att uppdatera matvarorna. Försök igen.",
  // Places in the pantry (Story 8.2, AD-24). A place deleted elsewhere, or not
  // the user's (MK410): nothing is written, and the view is read again.
  pantry_site_gone: "Boendet finns inte längre. Välj ett annat boende.",
  // The field shows siteNameTakenText with the name ("… som heter Stugan.").
  pantry_site_name_taken: "Det finns redan ett boende med det namnet.",
  pantry_site_limit: "Du kan ha högst 10 boenden.",
  // Adding, renaming or selecting a place failed; the selection goes back.
  pantry_site_failed: "Det gick inte att spara boendet. Försök igen.",
  // "Ta bort" on a place that another tab has filled or selected meanwhile:
  // nothing is deleted, and the sheet is read again.
  pantry_site_in_use: "Boendet har varor eller är valt och kan inte tas bort.",
  // The latest photo of a place (Epic 10, AD-26). Saving it is never shown to
  // Pontus: the code is only logged and sent to the client, which shows
  // nothing for it. The other two are shown in the photo's sheet (Story 10.2).
  pantry_photo_failed: "Det gick inte att spara fotot.",
  pantry_photo_gone: "Fotot finns inte längre.",
  pantry_photo_remove_failed: "Det gick inte att ta bort fotot. Försök igen.",
  // Prylar (Epic 18): places, cards and the things read from them. Nothing here touches food.
  things_unavailable: `Det gick inte att läsa ${thingNoun.definitePlural}. Försök igen.`,
  things_place_failed: "Det gick inte att spara platsen. Försök igen.",
  // The same room and part in this boende already (the field says which).
  things_place_taken: "Platsen finns redan.",
  things_place_limit: "Du kan ha högst 60 platser i ett boende.",
  // The place was removed elsewhere, or the boende was: the view is read again.
  things_place_gone: "Platsen finns inte längre.",
  things_photo_failed: "Det gick inte att spara fotot. Försök igen.",
  things_card_gone: "Kortet finns inte längre.",
  // Förnya och ta bort (Story 18.3): the card or thing stays, or "Ångra" did not go.
  things_card_remove_failed: "Det gick inte att ta bort kortet. Försök igen.",
  things_restore_failed: "Det gick inte att ångra. Försök igen.",
  things_restore_file_gone: "Kortet kunde inte läggas tillbaka, för fotot är borta. Ta ett nytt kort.",
  things_item_failed: `Det gick inte att spara ${thingNoun.definite}. Försök igen.`,
  // Rensa rummet / Rensa förrådet (Story 18.15): nothing was removed.
  things_clear_failed: "Det gick inte att rensa. Försök igen.",
  things_rename_failed: "Det gick inte att byta namn. Försök igen.",
  things_place_remove_failed: "Det gick inte att ta bort. Försök igen.",
  // Ta bort rummet (Pontus 1 Nov): only an empty room goes without a question.
  things_room_not_empty: "Rummet är inte tomt längre. Rensa det i stället.",
  things_room_taken: "Det finns ett rum med samma namn nu, så rummet kom inte tillbaka.",
  things_item_gone: `${thingNounCap.definite} finns inte längre.`,
  // Kom ihåg var jag lade den (Story 18.19): nothing was saved.
  things_noted_failed: "Det gick inte att spara. Försök igen.",
  things_noted_full: `Du har skrivit in så många ${thingNoun.plural} som får plats. Ta bort några först.`,
  // Ta och fyll på (Story 18.23): the count is as it was.
  things_count_failed: "Det gick inte att ändra antalet. Försök igen.",
  // Ångra on a take or refill that is no longer the newest change (another came after it): the count stays.
  things_undo_not_latest: "Det går bara att ångra den senaste ändringen.",
  // Sök och fråga (Story 18.4): nothing on a card to ask about yet.
  things_ask_empty: "Fotografera en plats först, så kan du fråga om vad som finns där.",
  // Matsedel (Story 3.1). After failed servings the selector shows the saved
  // value again; after a failed remove the dish is back on the plan.
  mealplan_unavailable: "Det gick inte att läsa matsedeln. Försök igen.",
  // In Lägg till rätt when the library cannot be read; the plan is still shown.
  mealplan_recipes_unavailable: "Det gick inte att läsa recepten. Försök igen.",
  mealplan_add_failed: "Det gick inte att lägga rätten på matsedeln. Försök igen.",
  mealplan_servings_failed: "Det gick inte att spara portionerna.",
  mealplan_weekday_failed: "Det gick inte att flytta rätten. Försök igen.",
  mealplan_remove_failed: "Det gick inte att ta bort rätten.",
  mealplan_restore_failed: "Det gick inte att ångra.",
  // Markera som lagad (Story 13.4): nothing is deducted or marked when it fails.
  mealplan_cooked_failed: "Det gick inte att markera rätten som lagad. Inget är ändrat.",
  mealplan_cooked_already: "Rätten är redan markerad som lagad.",
  mealplan_uncook_failed: "Det gick inte att ta bort markeringen.",
  mealplan_cooked_undo_failed: "Det gick inte att ångra. Kontrollera matvarorna.",
  // Tidigare matsedlar (Story 3.2). After a failed delete the plan stays.
  mealplan_previous_unavailable: "Det gick inte att läsa tidigare matsedlar. Försök igen.",
  // "Kopiera till …" of a plan deleted elsewhere.
  mealplan_plan_gone: "Matsedeln finns inte längre.",
  mealplan_delete_failed: "Det gick inte att ta bort matsedeln. Försök igen.",
  // "Kopiera till …" (Story 13.9): nothing is copied then.
  mealplan_copy_failed: "Det gick inte att kopiera veckan. Inget är ändrat. Försök igen.",
  mealplan_copy_nothing: "Inga rätter med recept att kopiera.",
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
  // "Lägg till i Matvaror" (Story 3.7) after the pantry was written: the list could
  // not be cleared. Trying again clears it without adding anything twice.
  shopping_put_in_pantry_failed: "Det gick inte att lägga allt i Matvaror. Försök igen.",
  // "Lägg till i Matvaror" whose plan was switched elsewhere after the pantry was
  // written: the items are at home, the list is read again.
  shopping_put_in_pantry_plan_changed: "Varorna är lagda i Matvaror, men matsedeln har bytts.",
  // Produktval (Story 7.2). A failed save keeps the sheet with its fields;
  // a failed remove keeps the sheet with the choice. When the choices cannot
  // be read, only the detail's section Produktval says so; the list works.
  shopping_product_choice_save_failed: "Det gick inte att spara produktvalet. Försök igen.",
  shopping_product_choice_remove_failed: "Det gick inte att ta bort produktvalet. Försök igen.",
  shopping_product_choices_unavailable: "Det gick inte att läsa produktvalen. Försök igen.",
  // A save from a sheet whose choice was saved, changed or removed elsewhere
  // meanwhile: nothing is written, and the sheet shows the choice as it is now.
  shopping_product_choice_changed: "Produktvalet har ändrats på annat håll. Uppgifterna är uppdaterade.",
  // The store or the catalog ingredient is not there any more (23503): the list is read again.
  shopping_product_choice_target_gone: "Butiken eller varan finns inte längre.",
  // "Skicka till ICA" (Story 7.3) when the selected store cannot be read, or
  // none is selected: nothing is copied, since the export would not say where
  // to fill the basket. A notice above the list, with "Öppna inställningar".
  shopping_export_store_missing: "Det gick inte att läsa butiken. Öppna inställningarna och försök igen.",
  // Recipe sites in Inställningar (FR7). The sentence with the site's name,
  // "koket.se finns redan.", is in `fields.domain`.
  settings_invalid_domain: "Ange en giltig webbadress, t.ex. koket.se.",
  settings_duplicate_domain: "Sajten finns redan.",
  settings_save_failed: "Det gick inte att spara ändringen. Försök igen.",
  // Siri och genvägar (Story 17.9): five working keys at most.
  settings_key_limit: "Du kan ha högst 5 nycklar. Återkalla en först.",
  // The section Butik in Inställningar (Story 7.1). When the stores cannot be
  // read, the recipe sites and "Logga ut" still work.
  settings_store_unavailable: "Det gick inte att läsa butiken. Försök igen.",
  // The same chain and store id as another of Pontus's stores; shown at Butiks-id.
  settings_duplicate_store: "Butiken finns redan.",
  // A store saved or selected after it went away elsewhere: the stores are read again.
  settings_store_gone: "Butiken finns inte längre.",
  // Veckans erbjudanden (Story 9.1, AD-25). Shown in the sheet, in a notice;
  // the fetch's errors come with "Öppna sidan" (the store's page in a new tab)
  // and are never retried.
  offers_link_missing: "Lägg in länken till butikens erbjudanden under Butik i Inställningar.",
  offers_link_unsupported: `${appName} kan bara hämta erbjudanden från ica.se än så länge.`,
  offers_fetched_recently: "Erbjudandena hämtades nyss. Försök igen om en stund.",
  // 403 or 429 from the store's site: no new try.
  offers_fetch_blocked: `ica.se släppte inte in ${appName} just nu. Öppna sidan och titta där, eller försök igen senare.`,
  // Story 17.11: the same refusal in the cloud (Vercel), where it is expected: a
  // GitHub job fetches the offers every morning and Sunday evening instead. Shown calmly, not as an alert.
  offers_fetch_scheduled: "Erbjudandena hämtas automatiskt varje morgon – nästa veckas kommer så fort butiken lagt ut dem (oftast söndag kväll eller måndag).",
  // Too slow, too large, no connection or another status.
  offers_fetch_failed: "Det gick inte att hämta erbjudandena. Försök igen senare.",
  // No offer data in the page, or a shape the reader does not know.
  offers_page_changed: `Sidan med erbjudanden ser inte ut som ${appName} väntar sig. Öppna sidan och titta där.`,
  offers_page_old: "Sidan visar inte den här eller nästa veckas erbjudanden.",
  offers_none: "Hittade inga erbjudanden på mat.",
  offers_store_missing: "Välj en butik i inställningarna först.",
  offers_week_invalid: "Veckan är slut. Välj en annan vecka och spara igen.",
  offers_limit: "Du kan ha högst 300 erbjudanden per vecka. Ta bort några först.",
  offers_failed: "Det gick inte att spara erbjudandena. Försök igen.",
  offers_unavailable: "Det gick inte att läsa erbjudandena.",
  // Tyck till (Story 20.3): the sheet keeps the text when sending fails. More than
  // 10 messages in an hour or 30 in a day from one person is refused by the database.
  feedback_send_failed: "Det gick inte att skicka. Försök igen.",
  feedback_rate_limited: "Du har skickat många meddelanden på kort tid. Försök igen senare.",
  // The owner's inbox: a message that could not be marked read stays among Nya.
  feedback_mark_failed: "Det gick inte att markera som läst.",
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
  // An iPhone photo (HEIC) a browser could not read and could not be turned into JPEG (Story 18.16).
  image_heic_failed: "Bilden gick inte att göra om från HEIC. Välj en annan bild eller ta ett nytt foto.",
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
