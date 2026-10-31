import { beforeEach, describe, expect, it, vi } from "vitest";
import { newApiKey } from "@/lib/api-key";

// The quick-add Route Handler with the shopping module stubbed: what the key and the body must look
// like, the answers for Siri, and that a refused key is a bare 401.

const addItemsByApiKey = vi.fn();
vi.mock("@/features/shopping/server", () => ({ addItemsByApiKey: (...args: unknown[]) => addItemsByApiKey(...args) }));
vi.mock("@/features/shopping", () => ({ quickAddedText: (labels: string[]) => `La till: ${labels.join(", ")}` }));
vi.mock("@/lib/revalidate", () => ({ revalidateFor: vi.fn() }));
vi.mock("@/lib/api-key", async (importOriginal) => importOriginal());

const { POST } = await import("./route");
const key = newApiKey();

function post(body: string, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost:3100/api/snabb", {
      method: "POST",
      body,
      headers: { "content-type": "application/json", authorization: `Bearer ${key}`, ...headers },
    }),
  );
}

beforeEach(() => addItemsByApiKey.mockReset());

describe("POST /api/snabb", () => {
  it("says what was added", async () => {
    addItemsByApiKey.mockResolvedValue({ kind: "added", labels: ["Mjölk", "Ägg"] });
    const response = await post(JSON.stringify({ text: "mjölk och ägg" }));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("La till: Mjölk, Ägg");
    expect(addItemsByApiKey).toHaveBeenCalledWith(key, "mjölk och ägg");
  });

  it("answers a bare 401 without a key, with a malformed key and with a key the database refuses", async () => {
    addItemsByApiKey.mockResolvedValue({ kind: "invalid_key" });
    const cases: Record<string, string>[] = [{ authorization: "" }, { authorization: "Bearer nope" }, { authorization: `Basic ${key}` }];
    for (const headers of cases) {
      const response = await post(JSON.stringify({ text: "mjölk" }), headers);
      expect(response.status).toBe(401);
      expect(await response.text()).toBe("");
    }
    expect(addItemsByApiKey).not.toHaveBeenCalled();
    // A well-formed key the database does not know: the same bare answer.
    const refused = await post(JSON.stringify({ text: "mjölk" }));
    expect(refused.status).toBe(401);
    expect(await refused.text()).toBe("");
  });

  it("answers 429 over the rate limit and 400 for a body without text", async () => {
    addItemsByApiKey.mockResolvedValue({ kind: "rate_limited" });
    expect((await post(JSON.stringify({ text: "mjölk" }))).status).toBe(429);
    expect((await post("{}")).status).toBe(400);
    expect((await post("not json")).status).toBe(400);
  });

  it("takes a plain text body too", async () => {
    addItemsByApiKey.mockResolvedValue({ kind: "added", labels: ["Mjölk"] });
    await post("mjölk", { "content-type": "text/plain" });
    expect(addItemsByApiKey).toHaveBeenCalledWith(key, "mjölk");
  });
});
