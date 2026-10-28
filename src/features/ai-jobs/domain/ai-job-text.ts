import { isActive, type AiJob, type AiJobKind } from "@/lib/ai-job-shape";

// The words of AI jobs (Story 12.4, EXPERIENCE.md, Voice and Tone och State
// Patterns, Epic 12). The job is named after what it is about, never after
// the technique, and the word "jobb" is only in the job row and the sheet.

/** The domain a link import reads from, kept in the job's context ("koket.se"); null for other jobs. */
export function importDomain(job: Pick<AiJob, "kind" | "context">): string | null {
  const domain = job.kind === "import" ? job.context.domain : undefined;
  return typeof domain === "string" && domain !== "" ? domain : null;
}

/** What the AI is doing, for the job row: "Letar efter rättförslag", "Läser receptet från koket.se". */
export function doingText(kind: AiJobKind, domain: string | null = null): string {
  switch (kind) {
    case "suggest":
      return "Letar efter rättförslag";
    case "analyze":
      return "Tittar på fotot av kylen";
    case "import":
      return domain ? `Läser receptet från ${domain}` : "Läser receptet";
  }
}

/** What the job is about, for the sheet and for a screen reader: "rättförslag". */
export function subjectText(kind: AiJobKind): string {
  switch (kind) {
    case "suggest":
      return "rättförslag";
    case "analyze":
      return "fotot av kylen";
    case "import":
      return "receptet";
  }
}

/** The state of a job in the sheet: "Pågår", "I kö, 1 före", "Klart", "Gick inte", "Avbrutet". */
export function statusText(job: Pick<AiJob, "status" | "ahead">): string {
  switch (job.status) {
    case "queued":
      return job.ahead > 0 ? `I kö, ${job.ahead} före` : "I kö";
    case "running":
      return "Pågår";
    case "done":
      return "Klart";
    case "failed":
      return "Gick inte";
    case "cancelled":
    case "superseded":
      return "Avbrutet";
  }
}

/** The line in the flow while a job waits: "I kö, 1 före."; null when it is next or running. */
export function waitingText(job: Pick<AiJob, "status" | "ahead">): string | null {
  return job.status === "queued" && job.ahead > 0 ? `I kö, ${job.ahead} före.` : null;
}

/** The short confirmation for a finished job: "3 rättförslag är klara.", or why it did not go. */
export function finishedText(job: Pick<AiJob, "kind" | "status" | "count" | "title">): string {
  if (job.status === "failed") {
    switch (job.kind) {
      case "suggest":
        return "Det gick inte att ta fram rättförslag.";
      case "analyze":
        return "Det gick inte att läsa fotot av kylen.";
      case "import":
        return "Det gick inte att läsa receptet.";
    }
  }
  switch (job.kind) {
    case "suggest":
      return job.count === 1 ? "1 rättförslag är klart." : `${job.count ?? 0} rättförslag är klara.`;
    case "analyze":
      return job.count === 1 ? "1 förslag från fotot av kylen är klart." : `${job.count ?? 0} förslag från fotot av kylen är klara.`;
    case "import":
      return job.title ? `Receptet ${job.title} är inläst.` : "Receptet är inläst.";
  }
}

/** Several finished jobs at once: "2 AI-resultat är klara." */
export function severalFinishedText(count: number): string {
  return `${count} AI-resultat är klara.`;
}

/**
 * The job row: what runs, and how many wait behind it ("AI: Letar efter
 * rättförslag · 2 i kö"). The job shown is the one that runs, or the first in
 * the queue when none does. null when nothing is active.
 */
export function jobRowText(jobs: readonly AiJob[]): { text: string; label: string } | null {
  const active = jobs.filter(isActive).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const shown = active.find((job) => job.status === "running") ?? active[0];
  if (!shown) return null;
  const waiting = active.length - 1;
  const doing = doingText(shown.kind, importDomain(shown));
  return {
    text: waiting > 0 ? `AI: ${doing} · ${waiting} i kö` : `AI: ${doing}`,
    label: waiting > 0 ? `AI-jobb: ${doing}, ${waiting} i kö` : `AI-jobb: ${doing}`,
  };
}

/** Where a finished job's result is shown: the tab's route (EXPERIENCE.md, Information Architecture). */
export function resultHref(kind: AiJobKind): string {
  return kind === "analyze" ? "/hemma" : "/recept";
}
