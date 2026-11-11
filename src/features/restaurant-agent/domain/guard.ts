import type { Rating, Reason, Suggestion, WarningFlag } from "./types";
import { suggestionId, warningFlags } from "./types";

// Hallucination guard. A suggestion from the model counts only if at least one of its reasons cites a page the search
// tool really returned in this run. The model may find, rank and summarise; it may not invent a source, so a place whose
// every source is unknown is dropped. A reason with an unknown source is cut, and the rest of the place stays.

export type Rejection = { name: string; reason: "malformed" | "duplicate" | "no_source" };
export type GuardResult = { valid: Suggestion[]; rejected: Rejection[] };

const maxName = 80;
const maxArea = 60;
/** A quoted menu shorter than this is a fragment, not a menu. */
const minMenuChars = 30;

/** An http(s) address as a string, without a fragment and a trailing slash, lower case host: for comparing, not for showing. */
export function normalizeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

const originOf = (value: unknown): string | null => {
  const normalized = normalizeUrl(value);
  return normalized ? new URL(normalized).origin : null;
};

const scales = [5, 10, 100];
const maxQuote = 100;

/** "4,3" and "4.3" for 4.3, "4" for 4: how a page may write the number. */
const writings = (value: number) => [...new Set([String(value), String(value).replace(".", ","), value.toFixed(1), value.toFixed(1).replace(".", ",")])];

/**
 * A rating counts only when its source is a page the search returned, the numbers are sane, and the short text the model
 * quotes holds the number (and the count, when one is given). Otherwise it is dropped and the place stays.
 */
function guardRating(raw: unknown, returned: ReadonlySet<string>): Rating | null {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null;
  if (!r) return null;
  const { value, scale, count } = r;
  const source = normalizeUrl(r.sourceUrl);
  const quote = typeof r.quote === "string" ? r.quote.trim() : "";
  if (typeof value !== "number" || !Number.isFinite(value) || typeof scale !== "number" || !scales.includes(scale) || value <= 0 || value > scale) return null;
  if (count !== null && count !== undefined && (typeof count !== "number" || !Number.isInteger(count) || count < 0)) return null;
  if (!source || !returned.has(source) || quote === "" || Array.from(quote).length > maxQuote) return null;
  if (!writings(value).some((text) => new RegExp(`(?<![\\d.,])${text.replace(".", "\\.")}(?!\\d|[.,]\\d)`).test(quote))) return null;
  if (typeof count === "number" && !quote.replace(/[\s\u00a0]/g, "").includes(String(count))) return null;
  const sourceName = typeof r.sourceName === "string" ? r.sourceName.trim() : "";
  return { value, scale, count: typeof count === "number" ? count : null, sourceName: sourceName.slice(0, 40), sourceUrl: (r.sourceUrl as string).trim() };
}

/**
 * @param raw What the model returned (already parsed by the port; unknown values are tolerated).
 * @param searchedUrls Every address the search tool returned in this run. A reason's source must be one of them.
 */
export function guardSuggestions(raw: unknown, searchedUrls: readonly string[]): GuardResult {
  const returned = new Set(searchedUrls.map(normalizeUrl).filter((url): url is string => url !== null));
  const origins = new Set([...returned].map((url) => new URL(url).origin));
  const valid: Suggestion[] = [];
  const rejected: Rejection[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw) ? raw : []) {
    const entry = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : null;
    const name = typeof entry?.name === "string" ? entry.name.trim() : "";
    if (!entry || name === "" || Array.from(name).length > maxName || !Array.isArray(entry.why)) {
      rejected.push({ name, reason: "malformed" });
      continue;
    }
    const why: Reason[] = [];
    for (const reason of entry.why) {
      const r = typeof reason === "object" && reason !== null ? (reason as Record<string, unknown>) : {};
      const source = normalizeUrl(r.sourceUrl);
      if (typeof r.text !== "string" || r.text.trim() === "" || !source || !returned.has(source)) continue;
      why.push({ text: r.text.trim(), sourceUrl: (r.sourceUrl as string).trim() });
    }
    if (why.length === 0) {
      rejected.push({ name, reason: "no_source" });
      continue;
    }
    // The restaurant's own site is shown only when the search returned a page on that very site.
    const siteOrigin = originOf(entry.website);
    const website = siteOrigin && origins.has(siteOrigin) ? (entry.website as string).trim() : null;
    const id = suggestionId(name, website);
    if (seen.has(id)) {
      rejected.push({ name, reason: "duplicate" });
      continue;
    }
    // Menu text counts only when it is quoted from a returned page and is more than a fragment.
    const menuRaw = typeof entry.menu === "object" && entry.menu !== null ? (entry.menu as Record<string, unknown>) : null;
    const menuSource = menuRaw ? normalizeUrl(menuRaw.sourceUrl) : null;
    const menuText = typeof menuRaw?.text === "string" ? menuRaw.text.trim() : "";
    const menu: Reason | null = menuSource && returned.has(menuSource) && Array.from(menuText).length >= minMenuChars ? { text: menuText, sourceUrl: (menuRaw?.sourceUrl as string).trim() } : null;
    // Address and hours are shown only when quoted from a returned page, as short one-line text; otherwise the card says it is missing.
    const quoted = (value: unknown, max: number): Reason | null => {
      const q = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
      const source = q ? normalizeUrl(q.sourceUrl) : null;
      const text = typeof q?.text === "string" ? q.text.trim() : "";
      return source && returned.has(source) && text !== "" && Array.from(text).length <= max ? { text, sourceUrl: (q?.sourceUrl as string).trim() } : null;
    };
    const rating = guardRating(entry.rating, returned);
    const area = typeof entry.area === "string" && entry.area.trim() !== "" && Array.from(entry.area.trim()).length <= maxArea ? entry.area.trim() : null;
    const warnings = (Array.isArray(entry.warnings) ? entry.warnings : []).filter((flag): flag is WarningFlag => warningFlags.includes(flag as WarningFlag));
    // A place with no menu text is always flagged, whatever the model said.
    if (!menu && !warnings.includes("menu_missing")) warnings.push("menu_missing");
    if (menu) warnings.splice(0, warnings.length, ...warnings.filter((flag) => flag !== "menu_missing"));
    seen.add(id);
    valid.push({ id, name, area, website, why, menu, rating, address: quoted(entry.address, 120), hours: quoted(entry.hours, 200), menuStatus: menu ? "found" : "missing", warnings: [...new Set(warnings)] });
  }
  return { valid, rejected };
}
