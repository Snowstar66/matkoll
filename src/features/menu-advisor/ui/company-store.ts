// Who was ticked last time, kept on this phone (like Sök restauranger keeps its choices), so the next visit starts
// with the same company instead of "Bara du". Only ids: names and allergies are the household's (use-people). Ids
// that are gone (a guest for one evening, a removed person) are dropped when read against the list.

export const companyStorageKey = "livskoll-menu-company-v1";

/** The ids ticked last time, or null when nothing is kept (or storage is blocked or broken). */
export function readCompanyIds(): string[] | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(companyStorageKey) ?? "null");
    if (!Array.isArray(value)) return null;
    const ids = value.filter((entry): entry is string => typeof entry === "string" && entry !== "" && entry.length <= 80).slice(0, 40);
    return ids.length > 0 ? ids : null;
  } catch {
    return null;
  }
}

export function writeCompanyIds(ids: readonly string[]) {
  try {
    localStorage.setItem(companyStorageKey, JSON.stringify(ids));
  } catch {
    // Blocked or full storage: the company starts on "Bara du" next time.
  }
}
