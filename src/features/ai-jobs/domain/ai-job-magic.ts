import type { AiJobKind } from "@/lib/ai-job-shape";

// The words and the numbers of the magical view (Story 12.8): what the status
// line under the hero says for each kind of job, how often it changes, and
// how long a job usually takes (Epic 12's measurement). Pure, so it is easy to test.

/** How often the status line changes, in milliseconds. */
export const statusCycleMs = 2500;

/** What a job usually takes, in seconds, per kind (Epic 12's measurement): one place for the numbers. */
export const typicalSeconds: Record<AiJobKind, number> = { suggest: 35, analyze: 30, import: 20 };

const statusTexts: Record<AiJobKind, readonly string[]> = {
  suggest: ["Läser ditt lager…", "Matchar veckans erbjudanden…", "Komponerar rätter…", "Skriver recepten…"],
  analyze: ["Tittar på fotot…", "Känner igen varorna…", "Räknar antal…"],
  import: ["Hämtar receptet…", "Läser ingredienserna…", "Strukturerar stegen…"],
};

/** The status line for a job kind after `step` cycles; it starts over after the last. */
export function statusLine(kind: AiJobKind, step: number): string {
  const texts = statusTexts[kind];
  return texts[((Math.floor(step) % texts.length) + texts.length) % texts.length];
}

/** The line shown when nothing moves ("Minska rörelse"): the first of the kind. */
export function fixedStatusLine(kind: AiJobKind): string {
  return statusTexts[kind][0];
}

/** The number of cycles after `elapsedMs`. */
export function stepAt(elapsedMs: number): number {
  return Math.max(0, Math.floor(elapsedMs / statusCycleMs));
}

/** "12 s", "1 min 5 s", "2 min". */
export function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

/** "12 s av ca 35 s", or "36 s, tar lite längre än vanligt" once the usual time has passed. */
export function progressText(kind: AiJobKind, elapsedSeconds: number): string {
  const typical = typicalSeconds[kind];
  if (elapsedSeconds <= typical) return `${formatElapsed(elapsedSeconds)} av ca ${typical} s`;
  return `${formatElapsed(elapsedSeconds)}, tar lite längre än vanligt`;
}
