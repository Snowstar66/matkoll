import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/server/env-schema";
import { photoReadingOptionsFor } from "./adapters/anthropic";
import { createAiService, inputLimits, type AiChoice } from "./service";

// The fridge photo's reading (analyzeImage) uses the level from Inställningar,
// with adaptive thinking, like every other call: Pontus found the Kylfoto A
// fast mode read worse (2026-11-04). The eval can still opt into that mode
// (fastPhotoReading): effort low, with thinking off on Claude Haiku 5.5, the
// one 5.5 model the Anthropic docs say takes `thinking: {type: "disabled"}`
// (at effort high or below); Opus and Sonnet 5.5 keep adaptive thinking at
// low. Checked on the request body Claude would get; no call leaves the test
// (the fetch is a stub that answers 400).

const kyl = {
  data: new Uint8Array(readFileSync(new URL("../../../tests/fixtures/ai/kyl.png", import.meta.url))),
  mediaType: "image/png",
};

function stubbedService(choice: AiChoice, options: { fastPhotoReading?: boolean } = {}) {
  const bodies: Record<string, unknown>[] = [];
  const fetchStub = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ error: { type: "invalid_request_error", message: "stub" } }), { status: 400 });
  }) as typeof fetch;
  const env = parseEnv({ AI_PROVIDER: "mock", ANTHROPIC_API_KEY: "sk-ant-test" });
  return { service: createAiService(env, { fetch: fetchStub, ...options }, choice), bodies };
}

async function photoBody(choice: AiChoice, options: { fastPhotoReading?: boolean } = {}) {
  const { service, bodies } = stubbedService(choice, options);
  await service.analyzeImage({ image: kyl, place: "Kyl" }, new AbortController().signal);
  expect(bodies).toHaveLength(1);
  return bodies[0];
}

async function recipeBody(choice: AiChoice) {
  const { service, bodies } = stubbedService(choice);
  await service.parseRecipe({ text: "Pannkakor: 3 dl mjöl" }, new AbortController().signal);
  return bodies[0];
}

const effortOf = (body: Record<string, unknown>) => (body.output_config as { effort?: string } | undefined)?.effort;

describe("the fridge photo's settings", () => {
  it.each(["low", "medium", "high"] as const)(
    "reads the photo on Haiku 5.5 at the level from Inställningar, with thinking on (%s)",
    async (effort) => {
      const body = await photoBody({ provider: "anthropic", model: "claude-haiku-5-5", effort });
      expect(body.model).toBe("claude-haiku-5-5");
      expect(effortOf(body)).toBe(effort);
      expect(body).not.toHaveProperty("thinking");
      for (const key of ["temperature", "top_p", "top_k"]) expect(body).not.toHaveProperty(key);
      expect(body.max_tokens).toBe(inputLimits.analyze.maxOutputTokens + 8_000);
    },
  );

  it.each(["claude-opus-5-5", "claude-sonnet-5-5"])("reads the photo on %s at the level from Inställningar", async (model) => {
    const body = await photoBody({ provider: "anthropic", model, effort: "high" });
    expect(effortOf(body)).toBe("high");
    expect(body).not.toHaveProperty("thinking");
  });

  it("keeps the level from Inställningar, and thinking, for a recipe too", async () => {
    const body = await recipeBody({ provider: "anthropic", model: "claude-haiku-5-5", effort: "high" });
    expect(effortOf(body)).toBe("high");
    expect(body).not.toHaveProperty("thinking");
  });
});

describe("the eval's fast mode (fastPhotoReading, Kylfoto A)", () => {
  it.each(["low", "medium", "high"] as const)(
    "reads the photo on Haiku 5.5 at effort low with thinking off, whatever the level (%s)",
    async (effort) => {
      const body = await photoBody({ provider: "anthropic", model: "claude-haiku-5-5", effort }, { fastPhotoReading: true });
      expect(body.model).toBe("claude-haiku-5-5");
      expect(effortOf(body)).toBe("low");
      expect(body.thinking).toEqual({ type: "disabled" });
      for (const key of ["temperature", "top_p", "top_k"]) expect(body).not.toHaveProperty(key);
      expect(body.max_tokens).toBe(inputLimits.analyze.maxOutputTokens + 8_000);
    },
  );

  it.each(["claude-opus-5-5", "claude-sonnet-5-5"])("keeps adaptive thinking on %s, at effort low", async (model) => {
    const body = await photoBody({ provider: "anthropic", model, effort: "high" }, { fastPhotoReading: true });
    expect(effortOf(body)).toBe("low");
    expect(body).not.toHaveProperty("thinking");
  });

});

describe("photoReadingOptionsFor", () => {
  it("turns thinking off only for Haiku 5.5 (and a dated id of it)", () => {
    expect(photoReadingOptionsFor("claude-haiku-5-5")).toEqual({ anthropic: { effort: "low", thinking: { type: "disabled" } } });
    expect(photoReadingOptionsFor("claude-haiku-5-5-20261001")).toEqual({
      anthropic: { effort: "low", thinking: { type: "disabled" } },
    });
  });

  it.each(["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5", "claude-haiku-5-50", "claude-future"])(
    "only lowers the effort for %s",
    (model) => {
      expect(photoReadingOptionsFor(model)).toEqual({ anthropic: { effort: "low" } });
    },
  );
});
