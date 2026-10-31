import { bearerKey } from "@/lib/api-key";
import { readBodyText } from "@/lib/read-body";
import { revalidateFor } from "@/lib/revalidate";
import { addItemsByApiKey } from "@/features/shopping/server";
import { quickAddedText } from "@/features/shopping";

// Quick add for an iOS Shortcut (Story 17.9, FR-17): POST { "text": "mjölk och ägg" } with
// `Authorization: Bearer <personal key>` adds the items to the household's list and answers a short text
// for Siri to speak. The key is the only credential (no cookie is read, so no CSRF); it is hashed and
// checked by the database, which also limits it to 30 calls a minute. A missing, malformed, unknown or
// revoked key all answer the same bare 401. Nothing about the key or the text is ever logged.

const maxBodyBytes = 8192;

function text(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store, private" },
  });
}

/** The dictated text from a JSON body `{ "text": "..." }`, or from a plain text body; null when there is none. */
async function textOf(request: Request): Promise<string | null> {
  const raw = await readBodyText(request, maxBodyBytes);
  if (raw === null) return null;
  if (!(request.headers.get("content-type") ?? "").includes("json")) return raw;
  try {
    const body: unknown = JSON.parse(raw);
    const value = typeof body === "object" && body !== null ? (body as { text?: unknown }).text : undefined;
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const key = bearerKey(request.headers.get("authorization"));
  if (key === null) return new Response(null, { status: 401, headers: { "cache-control": "no-store" } });
  const said = await textOf(request);
  if (said === null) return text('Skicka { "text": "mjölk och ägg" }.', 400);
  const result = await addItemsByApiKey(key, said);
  switch (result.kind) {
    case "invalid_key":
      return new Response(null, { status: 401, headers: { "cache-control": "no-store" } });
    case "rate_limited":
      return text("För många anrop. Vänta en minut.", 429);
    case "nothing":
      return text("Jag hörde ingen vara.", 200);
    case "failed":
      return text("Det gick inte att lägga till. Försök igen.", 500);
    case "added":
      revalidateFor("shopping_custom_item");
      return text(quickAddedText(result.labels), 200);
  }
}
