import { z } from "zod";
import type { FeedbackAreaId } from "./feedback";

// Automatic error reports into Tyck till's inbox: what is worth reporting, and how
// a report is made safe to store. Pure, so the browser, the Server Action and
// Next's onRequestError share it. A report holds only the error's name and message,
// the first lines of its stack, the path without query, the digest and the app
// version: never request bodies, form values, recipe text, photos, tokens,
// cookies, e-mail addresses or query strings.

/** The most error reports one browser session sends. */
export const maxReportsPerSession = 20;
/** The longest message kept (after scrubbing). */
export const maxMessageChars = 200;
/** Inputs are cut to these before anything scans them (a scan of a huge text is slow), never rejected. */
export const maxRawNameChars = 200;
export const maxRawMessageChars = 4000;
export const maxRawStackChars = 10_000;
export const maxRawPathChars = 1000;
/** The longest stack kept: its first lines. */
export const maxStackChars = 1000;
const maxStackLines = 6;
const maxPathChars = 200;
/** Where the error came from, for the owner. */
export const errorSources = ["boundary", "window", "rejection", "server"] as const;
export type ErrorSource = (typeof errorSources)[number];

const sourceLabels: Record<ErrorSource, string> = {
  boundary: "sidan kraschade",
  window: "fel i webbläsaren",
  rejection: "ohanterat löfte",
  server: "fel på servern",
};

/** What the browser sends to the Server Action; the server checks and scrubs it again. */
const clamp = (max: number) => z.string().transform((text) => text.slice(0, max));

/** Long values are cut, not refused: a long report (a hydration diff, a big stack) must still arrive. */
export const errorReportSchema = z.object({
  name: clamp(maxRawNameChars),
  message: clamp(maxRawMessageChars),
  stack: clamp(maxRawStackChars).nullable(),
  digest: clamp(200).nullable(),
  path: clamp(maxRawPathChars),
  source: z.enum(errorSources),
});
export type ErrorReportInput = z.input<typeof errorReportSchema>;

/** A thrown value, as far as it is known. */
export type RawError = { name: string; message: string; stack: string | null; digest: string | null };

/** Reads name, message, stack and digest from anything that was thrown. */
export function rawErrorOf(thrown: unknown): RawError {
  if (typeof thrown === "object" && thrown !== null) {
    const record = thrown as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === "string" ? value : null);
    return {
      name: (text(record.name) ?? "Error").slice(0, maxRawNameChars),
      message: (text(record.message) ?? "").slice(0, maxRawMessageChars),
      stack: text(record.stack)?.slice(0, maxRawStackChars) ?? null,
      digest: text(record.digest)?.slice(0, 200) ?? null,
    };
  }
  return { name: "Error", message: typeof thrown === "string" ? thrown.slice(0, maxRawMessageChars) : "", stack: null, digest: null };
}

// ---------- scrubbing ----------

const emailPattern = /[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[^\s@<>()"',;:]+/g;
const jwtPattern = /\beyJ[\w-]{8,}\.[\w-]{8,}(?:\.[\w-]*)?/g;
const bearerPattern = /\b(bearer|basic)\s+[\w.~+/=-]{8,}/gi;
const secretPairPattern =
  /\b(token|secret|password|passwd|apikey|api[_-]key|authorization|cookie|session|key)(["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&)]+)/gi;
// A query string or fragment after a URL or a path.
const urlQueryPattern = /(\bhttps?:\/\/[^\s?#"'`)]*|\/[\w./[\]-]*)[?#][^\s"'`)]*/g;
// A long run of letters and digits that holds both: a key, a token, a hash.
const longTokenPattern = /\b(?=[\w-]*\d)(?=[\w-]*[A-Za-z])[\w-]{24,}\b/g;
const sbCookiePattern = /\bsb-[\w-]+-auth-token[\w.-]*/g;

/** Takes out e-mail addresses, tokens, keys, cookies and query strings from a text. */
export function scrubText(text: string): string {
  return text
    .replace(jwtPattern, "[dold]")
    .replace(bearerPattern, "$1 [dold]")
    .replace(sbCookiePattern, "[dold]")
    .replace(secretPairPattern, "$1$2[dold]")
    .replace(emailPattern, "[e-post]")
    .replace(urlQueryPattern, "$1")
    .replace(longTokenPattern, "[dold]");
}

/**
 * Database and validation messages echo input ("Key (title)=(…) already exists", zod's
 * issue lists): reduced to what kind of error and which constraint or code, nothing else.
 */
export function simplifyMessage(message: string): string {
  const constraint = /^(.{0,80}?violates [\w ]{0,40}?constraint "([^"]{1,80})")/.exec(message);
  if (constraint) return constraint[1]!;
  const codes = [...message.matchAll(/"code"\s*:\s*"([a-z_]{1,40})"/g)].map((match) => match[1]);
  if (codes.length > 0) return `Validation error (${[...new Set(codes)].join(", ")})`;
  return message.replace(/\bKey \([^)]*\)=\([^)]*\)/g, "Key [dold]");
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** The first lines of a stack (after the message line), scrubbed and cut. */
export function stackExcerpt(stack: string | null): string {
  if (!stack) return "";
  const lines = stack
    .split("\n")
    .map((line) => line.trim().slice(0, 300))
    .filter((line) => /^at\s|@/.test(line))
    .slice(0, maxStackLines);
  return truncate(scrubText(lines.join("\n")), maxStackChars);
}

// ---------- the path ----------

// The words that are fixed parts of the app's routes; any other segment is an id, a
// code or a name and is hidden.
const staticSegments = new Set(
  (
    "hemma hjalp installningar ai appikon basvaror boenden butiker inkorg installera konto medlemmar notiser nyheter om " +
    "receptsajter siri spara-i-matkoll telefon lista lagg-till matsedel tidigare prylar kort lada rum recept importera valkomst " +
    "api jobs photo warm news notes snabb things locate retry auth confirm ga-med logga-in"
  ).split(" "),
);

/** The path without query or fragment, with every segment that is not a known route word hidden as [id]; null when it is not a path in the app. */
export function reportPath(raw: string): string | null {
  const path = (raw.slice(0, maxRawPathChars).split(/[?#]/)[0] ?? "").replace(/\/+$/, "") || "/";
  if (!path.startsWith("/") || /\s/.test(path)) return null;
  const segments = path
    .split("/")
    .slice(1)
    .map((segment) => (segment === "" || staticSegments.has(segment) ? segment : "[id]"));
  return truncate(`/${segments.join("/")}`, maxPathChars);
}

const areaByFirstSegment: Record<string, FeedbackAreaId> = {
  recept: "recept",
  matsedel: "matsedel",
  lista: "inkopslista",
  hemma: "matvaror",
  prylar: "forrad",
  installningar: "konto",
};

/** The help area a path belongs to, when it is one of the tabs. */
export function areaOfPath(path: string | null): FeedbackAreaId | null {
  const first = path?.split("/")[1] ?? "";
  return areaByFirstSegment[first] ?? null;
}

// ---------- what not to report ----------

const controlFlowPattern =
  /NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|NEXT_UNAUTHORIZED|NEXT_FORBIDDEN|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING/;
const networkPattern =
  /failed to fetch|load failed|networkerror when attempting to fetch|network request failed|internet connection appears to be offline/i;
const abortPattern = /signal is aborted|user aborted a request|fetch is aborted|operation was aborted/i;

/**
 * Whether an error is expected and not worth a report: redirect() and notFound()
 * control flow, aborted fetches, `unauthorized` results, ResizeObserver warnings,
 * a cross-origin "Script error." and offline network errors.
 */
export function isIgnorableError(error: RawError, { online }: { online: boolean }): boolean {
  const { name, message, digest } = error;
  if (controlFlowPattern.test(message) || controlFlowPattern.test(digest ?? "")) return true;
  if (name === "AbortError" || abortPattern.test(message)) return true;
  if (/^unauthorized$/i.test(message.trim())) return true;
  if (/ResizeObserver loop/i.test(message)) return true;
  if (/^script error\.?$/i.test(message.trim())) return true;
  if (!online && networkPattern.test(message)) return true;
  return false;
}

const extensionPattern = /(?:chrome|moz|safari|safari-web)-extension:\/\//i;

/**
 * Whether an error comes from code that is not the app's own: a browser extension, or a
 * script from another site. `filename` is the error event's, `stack` the error's.
 */
export function isForeignScript(filename: string | null | undefined, stack: string | null | undefined, site: string): boolean {
  if (extensionPattern.test(filename ?? "")) return true;
  if (extensionPattern.test((stack ?? "").slice(0, maxRawStackChars))) return true;
  if (filename) {
    try {
      return new URL(filename).origin !== site;
    } catch {
      return false;
    }
  }
  return false;
}

// ---------- the report ----------

/** One report as it is stored in `feedback`: kind 'error'. */
export type ErrorReport = { body: string; page: string | null; area: FeedbackAreaId | null; digest: string | null };

/** Makes a scrubbed, size-limited report of an error; null for an expected one. */
export function buildErrorReport(input: ErrorReportInput, { online = true }: { online?: boolean } = {}): ErrorReport | null {
  const error: RawError = {
    name: input.name.slice(0, maxRawNameChars),
    message: input.message.slice(0, maxRawMessageChars),
    stack: input.stack?.slice(0, maxRawStackChars) ?? null,
    digest: input.digest?.slice(0, 200) ?? null,
  };
  if (isIgnorableError(error, { online })) return null;
  const page = reportPath(input.path);
  const name = truncate(scrubText(error.name).replace(/\s+/g, " ").trim() || "Error", 60);
  const message = truncate(scrubText(simplifyMessage(error.message)).replace(/\s+/g, " ").trim(), maxMessageChars);
  const stack = stackExcerpt(error.stack);
  const head = `${name}: ${message || "(inget meddelande)"} [${sourceLabels[input.source]}]`;
  const digest = error.digest ? truncate(error.digest.replace(/[^\w.-]/g, ""), 64) || null : null;
  return { body: stack ? `${head}\n${stack}` : head, page, area: areaOfPath(page), digest };
}

/** The same error twice in a session has the same key: its digest or message, and the path. */
export function reportKey(error: Pick<RawError, "message" | "digest">, path: string): string {
  return `${error.digest ?? scrubText(simplifyMessage(error.message)).slice(0, 200)}|${reportPath(path) ?? "?"}`;
}

/** Remembers what was reported, and stops at a cap, so a session sends each error once and not a flood. */
export function createReportGate(max = maxReportsPerSession) {
  const seen = new Set<string>();
  return {
    /** True the first time a key is offered, while under the cap. */
    allow(key: string): boolean {
      if (seen.has(key) || seen.size >= max) return false;
      seen.add(key);
      return true;
    },
  };
}

/** "0.1.0+ab12cd3": the version and the commit's first 7 characters, at most 40 characters (feedback.app_version). */
export function reportVersion({ version, commit }: { version: string; commit: string | null }): string {
  return truncate(commit ? `${version}+${commit.slice(0, 7)}` : version, 40);
}
