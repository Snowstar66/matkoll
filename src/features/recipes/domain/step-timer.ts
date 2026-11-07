// Times in a recipe step ("Koka i 10 minuter") that can start a timer. A pure
// parser for Swedish durations; the timer itself lives in the recipe view.
//
// Rules:
// - a number (3, 1,5, 1.5, ½, 1 ½, 1/2) or "en"/"ett", then a unit: sekund(er),
//   sek, minut(er), min, timme/timmar, tim, h; the unit must end the word, so
//   "timjan" and "minutersbitar" are not times
// - a range ("2–3 minuter", "2-3 min", "2 till 3 minuter") starts the LOWER
//   bound: the dish is then checked at the earliest time instead of overcooked
// - "en halv timme" is 30 minutes; "1 timme 30 minuter" and "1 timme och 30
//   minuter" are one time of 90 minutes
// - "ca"/"cirka" in front stays outside the phrase; a trailing dot ("45 min.")
//   is not part of it either
// - nothing under 1 second or over 24 hours; "180 grader", "2 dl" and "4
//   portioner" never match, as they have no time unit

export type StepDuration = {
  /** Index of the phrase's first character in the text. */
  start: number;
  /** Index after its last character. */
  end: number;
  /** The phrase as written: "10 minuter". */
  text: string;
  /** How long the timer runs (the lower bound of a range). */
  seconds: number;
};

export type StepPart = string | { text: string; seconds: number };

const maxSeconds = 24 * 60 * 60;
const wordNumbers: Record<string, number> = { en: 1, ett: 1 };
const fractions: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75 };

const unitSeconds: Record<string, number> = {
  sekunder: 1,
  sekund: 1,
  sek: 1,
  minuter: 60,
  minut: 60,
  min: 60,
  timmar: 3600,
  timme: 3600,
  tim: 3600,
  h: 3600,
};

const unitPattern = "sekunder|sekund|sek|minuter|minut|min|timmar|timme|tim|h";
const numberPattern = "\\d+(?:[.,]\\d+)?(?:\\s?[½¼¾])?|\\d+\\/\\d+|[½¼¾]|en|ett";
const rangeEnd = `(?:\\s?[–—-]\\s?|\\s+till\\s+)(?:${numberPattern})`;
const halfHour = /(?<![\p{L}\d])en\s+halv\s+timme(?![\p{L}\d])/giu;
const phrase = new RegExp(
  `(?<![\\p{L}\\d.,/½¼¾])(${numberPattern})(${rangeEnd})?\\s?(${unitPattern})(?![\\p{L}\\d])`,
  "giu",
);

function parseNumber(raw: string): number | null {
  const text = raw.toLowerCase().trim();
  if (text in wordNumbers) return wordNumbers[text]!;
  const slash = /^(\d+)\/(\d+)$/.exec(text);
  if (slash) return Number(slash[2]) === 0 ? null : Number(slash[1]) / Number(slash[2]);
  const mixed = /^(\d+(?:[.,]\d+)?)\s?([½¼¾])$/.exec(text);
  if (mixed) return Number(mixed[1]!.replace(",", ".")) + fractions[mixed[2]!]!;
  if (text in fractions) return fractions[text]!;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

/** Every time in the text, in order, with the seconds its timer runs. */
export function findDurations(text: string): StepDuration[] {
  const found: StepDuration[] = [];
  for (const match of text.matchAll(halfHour)) {
    found.push({ start: match.index, end: match.index + match[0].length, text: match[0], seconds: 1800 });
  }
  for (const match of text.matchAll(phrase)) {
    const unit = unitSeconds[match[3]!.toLowerCase()]!;
    const amount = parseNumber(match[1]!);
    const seconds = amount === null ? 0 : Math.round(amount * unit);
    if (seconds < 1 || seconds > maxSeconds) continue;
    found.push({ start: match.index, end: match.index + match[0].length, text: match[0], seconds });
  }
  found.sort((a, b) => a.start - b.start);
  return mergeHoursAndMinutes(text, found);
}

const joiner = /^\s+(?:och\s+)?$/i;

/** "1 timme 30 minuter" is one time. */
function mergeHoursAndMinutes(text: string, durations: StepDuration[]): StepDuration[] {
  const merged: StepDuration[] = [];
  for (const next of durations) {
    const last = merged[merged.length - 1];
    const hours = last !== undefined && /(?:timmar|timme|tim|h)$/i.test(last.text) && !/[–—-]|till/i.test(last.text);
    const minutes = /(?:minuter|minut|min)$/i.test(next.text) && !/[–—-]|till/i.test(next.text);
    if (last && hours && minutes && joiner.test(text.slice(last.end, next.start))) {
      const seconds = last.seconds + next.seconds;
      if (seconds <= maxSeconds) {
        merged[merged.length - 1] = { start: last.start, end: next.end, text: text.slice(last.start, next.end), seconds };
        continue;
      }
    }
    merged.push(next);
  }
  return merged;
}

/** The text cut into plain strings and the times in it. */
export function splitDurations(text: string): StepPart[] {
  const parts: StepPart[] = [];
  let at = 0;
  for (const found of findDurations(text)) {
    if (found.start > at) parts.push(text.slice(at, found.start));
    parts.push({ text: found.text, seconds: found.seconds });
    at = found.end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}

/** "9:59", "1:05:00": what is left on a timer. Rounds up, so a timer never says 0:00 before it is done. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}
