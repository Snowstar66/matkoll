import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/env", () => ({ env: { AI_PROVIDER: "mock", NODE_ENV: "test" } }));

const { getAiServiceFor } = await import("./index");
const { createModelAiService, inputLimits, isValidPickRestaurantsInput, pickRestaurantsText } = await import("./service");
const { prompts } = await import("./prompts");
const { fakeModel } = await import("./test-support");

const limits = { healthMs: 30_000, attemptMs: 30_000, totalMs: 60_000, maxAttempts: 1, minRetryMs: 0 };
const signal = () => new AbortController().signal;
const input = {
  party: 2,
  wantedCuisines: ["Pizza"],
  priorities: ["Prisvärt"],
  household: { people: [{ allergies: ["gluten"], likes: ["pasta"], avoids: ["svamp"] }] },
  restaurants: [
    { placeId: "p1", pages: [{ url: "https://a.example/meny", text: "Margherita 125 kr\nCapricciosa 139 kr" }] },
    { placeId: "p2", pages: [] },
  ],
};

describe("pickRestaurants (Restaurangagenten)", () => {
  it("sends the prompt and the restaurants by id with their own text, nothing else", async () => {
    const answer = JSON.stringify({ suggestions: [{ placeId: "p1", menuStatus: "found", why: [{ text: " Har pizza ", sourceUrl: "https://a.example/meny" }], warnings: ["allergy_unverified"] }] });
    const model = fakeModel(answer);
    const result = await createModelAiService({ model }, limits).pickRestaurants(input, signal());
    expect(result).toEqual({ ok: true, data: { quality: "standard", suggestions: [{ placeId: "p1", menuStatus: "found", why: [{ text: "Har pizza", sourceUrl: "https://a.example/meny" }], warnings: ["allergy_unverified"] }] } });
    const call = model.doGenerateCalls[0];
    expect(call.maxOutputTokens).toBe(inputLimits.pickRestaurants.maxOutputTokens);
    const text = pickRestaurantsText(input);
    expect(text).toContain("Restaurang p1");
    expect(text).toContain("Sida: https://a.example/meny");
    expect(text).toContain("Margherita 125 kr Capricciosa 139 kr");
    expect(text).toContain("(ingen egen sida hittades)");
    expect(JSON.stringify(call.prompt)).toContain("Restaurang p1");
    expect(prompts.pickRestaurants).toContain("Du ser inga namn, adresser, betyg");
  });

  it("refuses an input outside the limits with validation, without calling the model", async () => {
    const model = fakeModel("{}");
    const service = createModelAiService({ model }, limits);
    expect(isValidPickRestaurantsInput({ ...input, restaurants: [] })).toBe(false);
    expect(isValidPickRestaurantsInput({ ...input, restaurants: [{ placeId: "p1", pages: [{ url: "javascript:alert(1)", text: "x" }] }] })).toBe(false);
    const wrapped = getAiServiceFor(null);
    expect(await wrapped.pickRestaurants({ ...input, restaurants: [] }, signal())).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(model.doGenerateCalls).toHaveLength(0);
    void service;
  });

  it("goes through the gate and the usage sink", async () => {
    const sink = vi.fn();
    expect(await getAiServiceFor(null, sink, vi.fn().mockResolvedValue(false)).pickRestaurants(input, signal())).toMatchObject({ ok: false, error: { code: "ai_cap_reached" } });
    expect(sink).not.toHaveBeenCalled();
    expect(await getAiServiceFor(null, sink, vi.fn().mockResolvedValue(true)).pickRestaurants(input, signal())).toMatchObject({ ok: true });
    expect(sink).toHaveBeenCalledTimes(1);
  });
});
