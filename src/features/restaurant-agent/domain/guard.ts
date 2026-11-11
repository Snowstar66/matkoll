import type { MenuSource, Suggestion, WarningFlag } from "./types";
import { warningFlags } from "./types";

// Hallucination guard. A suggestion from the model counts only if its placeId is one the finder returned this run and
// every reason names a page we know. The model may rank and summarise; it may not invent a restaurant or a source.

export type Rejection = { placeId: string; reason: "unknown_place" | "duplicate" | "no_reason_source" | "found_without_reason" | "malformed" };
export type GuardResult = { valid: Suggestion[]; rejected: Rejection[] };

const isHttpUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

/** The pages we may cite per place: the restaurant's own site as fetched or found by search. */
export function allowedSourcesOf(sources: readonly MenuSource[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const source of sources) {
    if (!isHttpUrl(source.url)) continue;
    const set = map.get(source.placeId) ?? new Set<string>();
    set.add(source.url);
    map.set(source.placeId, set);
  }
  return map;
}

/**
 * @param raw What the model returned (unknown shape).
 * @param placeIds The ids the finder returned this run.
 * @param sources The pages we hold per place. A reason's source must be one of the place's pages.
 */
export function guardSuggestions(raw: unknown, placeIds: ReadonlySet<string>, sources: readonly MenuSource[]): GuardResult {
  const allowed = allowedSourcesOf(sources);
  const valid: Suggestion[] = [];
  const rejected: Rejection[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw) ? raw : []) {
    const entry = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : null;
    const placeId = typeof entry?.placeId === "string" ? entry.placeId : "";
    if (!entry || !placeId) {
      rejected.push({ placeId, reason: "malformed" });
      continue;
    }
    if (!placeIds.has(placeId)) {
      rejected.push({ placeId, reason: "unknown_place" });
      continue;
    }
    if (seen.has(placeId)) {
      rejected.push({ placeId, reason: "duplicate" });
      continue;
    }
    const menuStatus = entry.menuStatus === "found" || entry.menuStatus === "missing" ? entry.menuStatus : null;
    const whyRaw = Array.isArray(entry.why) ? entry.why : null;
    if (!menuStatus || !whyRaw) {
      rejected.push({ placeId, reason: "malformed" });
      continue;
    }
    const pages = allowed.get(placeId);
    const why: Suggestion["why"] = [];
    let sourced = true;
    for (const reason of whyRaw) {
      const r = typeof reason === "object" && reason !== null ? (reason as Record<string, unknown>) : {};
      if (typeof r.text !== "string" || r.text.trim() === "" || !isHttpUrl(r.sourceUrl) || !pages?.has(r.sourceUrl)) {
        sourced = false;
        break;
      }
      why.push({ text: r.text.trim(), sourceUrl: r.sourceUrl });
    }
    if (!sourced) {
      rejected.push({ placeId, reason: "no_reason_source" });
      continue;
    }
    if (menuStatus === "found" && why.length === 0) {
      rejected.push({ placeId, reason: "found_without_reason" });
      continue;
    }
    const warnings = (Array.isArray(entry.warnings) ? entry.warnings : []).filter((flag): flag is WarningFlag => warningFlags.includes(flag as WarningFlag));
    // A place with no menu text is always flagged, whatever the model said.
    if (menuStatus === "missing" && !warnings.includes("menu_missing")) warnings.push("menu_missing");
    seen.add(placeId);
    valid.push({ placeId, why, menuStatus, warnings: [...new Set(warnings)] });
  }
  return { valid, rejected };
}
