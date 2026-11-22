import { fail, type Result } from "@/lib/errors";

// The browser's side of "Undersök värdet": POST /api/things/worth-detail with the föremål's id. Any answer that is
// not one (no connection, a server error) is `ai_unavailable`.

export async function explainWorthDetail(thingId: string): Promise<Result<{ detail: string }>> {
  try {
    const response = await fetch("/api/things/worth-detail", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ thing: thingId }),
    });
    const answer = (await response.json()) as Result<{ detail: string }>;
    return typeof answer === "object" && answer !== null && "ok" in answer ? answer : fail("ai_unavailable");
  } catch {
    return fail("ai_unavailable");
  }
}
