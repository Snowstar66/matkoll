import { fail, type Result } from "@/lib/errors";
import type { WorthAssessment } from "../actions/explain-worth";

// The browser's side of "Undersök värdet" and "Uppdatera": POST /api/things/worth-detail with the föremål's id (and `refresh`
// for Uppdatera). Any answer that is not one (no connection, a server error) is `ai_unavailable`.

export async function explainWorthDetail(thingId: string, refresh = false): Promise<Result<WorthAssessment>> {
  try {
    const response = await fetch("/api/things/worth-detail", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ thing: thingId, ...(refresh ? { refresh: true } : {}) }),
    });
    const answer = (await response.json()) as Result<WorthAssessment>;
    return typeof answer === "object" && answer !== null && "ok" in answer ? answer : fail("ai_unavailable");
  } catch {
    return fail("ai_unavailable");
  }
}

/** The same for "Uppdatera sammanfattningen" on a card: POST /api/things/card-summary. */
export async function refreshCardSummaryText(cardId: string): Promise<Result<{ summary: string | null; title: string | null }>> {
  try {
    const response = await fetch("/api/things/card-summary", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ card: cardId }),
    });
    const answer = (await response.json()) as Result<{ summary: string | null; title: string | null }>;
    return typeof answer === "object" && answer !== null && "ok" in answer ? answer : fail("ai_unavailable");
  } catch {
    return fail("ai_unavailable");
  }
}
