import { fail, type Result } from "@/lib/errors";
import type { ThingBox } from "@/lib/thing-box";

// The browser's side of "Peka ut föremålet" (Story 18.7): POST /api/things/locate
// with the föremål's id. Any answer that is not one (no connection, a server
// error) is `ai_unavailable`.

export async function lookUpBox(thingId: string): Promise<Result<{ box: ThingBox | null }>> {
  try {
    const response = await fetch("/api/things/locate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ thing: thingId }),
    });
    const answer = (await response.json()) as Result<{ box: ThingBox | null }>;
    return typeof answer === "object" && answer !== null && "ok" in answer ? answer : fail("ai_unavailable");
  } catch {
    return fail("ai_unavailable");
  }
}
