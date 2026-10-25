// Result shape and error codes for actions and Route Handlers (AD-13).
// Codes are `<area>_<reason>`; the Swedish text follows Voice and Tone in EXPERIENCE.md.
// Expected errors are returned, never thrown to the client.

export const errorMessages = {
  unauthorized: "Du behöver logga in.",
  validation: "Kontrollera uppgifterna och försök igen.",
  auth_link_invalid: "Länken har gått ut eller redan använts. Be om en ny.",
  auth_not_allowed: "Adressen har inte åtkomst till Matkoll.",
  ai_unavailable: "AI-tjänsten svarar inte just nu. Är datorn med modellen igång?",
  ai_invalid: "Det gick inte att tolka svaret. Försök igen.",
  ai_rejected: "AI-tjänsten tog inte emot förfrågan. Prova med en kortare text eller försök igen senare.",
  import_no_recipe: "Det gick inte att hitta något recept i texten.",
  catalog_unavailable: "Det gick inte att läsa ingredienskatalogen. Försök igen.",
  recipe_save_failed: "Det gick inte att spara receptet. Försök igen.",
} as const;

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
