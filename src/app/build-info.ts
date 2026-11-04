// The app's version, build time and commit (Om Livskoll, the Om row's value and
// Hjälp och tips' footer). next.config.ts puts them in `env` when the server
// starts or the app is built, so they are fixed in the bundle; the formatting
// below is pure, for the tests.

export type BuildInfo = {
  /** package.json's version, "0.1.0". */
  version: string;
  /** When the app was built, as an ISO time; null when it is not known. */
  builtAt: string | null;
  /** VERCEL_GIT_COMMIT_SHA, or null for a local build. */
  commit: string | null;
};

const shortMonths = ["jan", "feb", "mars", "apr", "maj", "juni", "juli", "aug", "sep", "okt", "nov", "dec"];

/** The build as next.config.ts left it in the bundle. */
export function readBuildInfo(): BuildInfo {
  // Read one by one: Next replaces each `process.env.X` with its value at build
  // time, so these are constants of the bundle, not configuration (AD-14).
  return {
    // eslint-disable-next-line no-restricted-syntax
    version: process.env.LIVSKOLL_VERSION || "0.0.0",
    // eslint-disable-next-line no-restricted-syntax
    builtAt: process.env.LIVSKOLL_BUILT_AT || null,
    // eslint-disable-next-line no-restricted-syntax
    commit: process.env.LIVSKOLL_COMMIT || null,
  };
}

/** "0.1.0" → "0.1": major and minor, the way the app shows its version. */
export function shortVersion(version: string): string {
  return version.split(".").slice(0, 2).join(".");
}

/** The date and time in Swedish time, or null for a time that cannot be read. */
function stockholmParts(iso: string): { day: number; month: number; year: number; hour: string; minute: string } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value ?? "";
  return { day: Number(part("day")), month: Number(part("month")), year: Number(part("year")), hour: part("hour"), minute: part("minute") };
}

/** "4 nov": the build's day in Swedish time. */
export function buildDayText(iso: string | null): string | null {
  const parts = iso ? stockholmParts(iso) : null;
  return parts ? `${parts.day} ${shortMonths[parts.month - 1]}` : null;
}

/** "Byggd 4 nov 2026 kl 19.42", in Swedish time. */
export function builtText(iso: string | null): string | null {
  const parts = iso ? stockholmParts(iso) : null;
  return parts ? `Byggd ${parts.day} ${shortMonths[parts.month - 1]} ${parts.year} kl ${parts.hour}.${parts.minute}` : null;
}

/** The commit's first 7 characters, or "lokal" for a build on a computer. */
export function commitText(commit: string | null): string {
  const sha = commit?.trim();
  return sha ? sha.slice(0, 7) : "lokal";
}

/** "0.1 · 4 nov": the Om row's value. Just the version when the build time is not known. */
export function versionLine(info: BuildInfo): string {
  const day = buildDayText(info.builtAt);
  return day ? `${shortVersion(info.version)} · ${day}` : shortVersion(info.version);
}
